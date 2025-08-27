'use strict';

/**
 * @fileoverview Audit export model for managing audit log exports and archives
 * @module shared/lib/database/models/security/audit-export-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/file-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/file-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const fileService = require('../../../services/file-service');
const encryptionService = require('../../../security/encryption/encryption-service');
const fileHelper = require('../../../utils/helpers/file-helper');

/**
 * Audit export schema for tracking exported audit data
 */
const auditExportSchemaDefinition = {
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

  // ==================== Export Details ====================
  export: {
    id: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      maxlength: 200
    },
    description: String,
    type: {
      type: String,
      enum: ['scheduled', 'manual', 'compliance', 'investigation', 'backup'],
      required: true,
      index: true
    },
    format: {
      type: String,
      enum: ['json', 'csv', 'xml', 'pdf', 'encrypted_archive'],
      required: true
    },
    compression: {
      enabled: Boolean,
      algorithm: {
        type: String,
        enum: ['gzip', 'zip', 'bzip2', '7z']
      },
      level: Number
    },
    encryption: {
      enabled: Boolean,
      algorithm: {
        type: String,
        enum: ['aes-256-gcm', 'aes-256-cbc', 'rsa-4096']
      },
      keyId: String,
      keyVersion: String
    }
  },

  // ==================== Export Scope ====================
  scope: {
    dateRange: {
      start: {
        type: Date,
        required: true
      },
      end: {
        type: Date,
        required: true
      }
    },
    filters: {
      eventTypes: [String],
      severities: [String],
      actors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      resources: [{
        type: String,
        ids: [String]
      }],
      categories: [String],
      customFilters: mongoose.Schema.Types.Mixed
    },
    includeCriteria: {
      includeSystemEvents: { type: Boolean, default: true },
      includeApiEvents: { type: Boolean, default: true },
      includeUserEvents: { type: Boolean, default: true },
      includeFailedEvents: { type: Boolean, default: true },
      includeRedactedData: { type: Boolean, default: false }
    },
    exclusions: {
      excludePatterns: [String],
      excludeUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      excludeIPs: [String]
    }
  },

  // ==================== Export Status ====================
  status: {
    state: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'expired', 'deleted'],
      default: 'pending',
      index: true
    },
    progress: {
      current: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      phase: String,
      lastUpdate: Date
    },
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    error: {
      code: String,
      message: String,
      details: mongoose.Schema.Types.Mixed,
      occurredAt: Date
    },
    retries: {
      count: { type: Number, default: 0 },
      maxRetries: { type: Number, default: 3 },
      lastRetryAt: Date
    }
  },

  // ==================== Export Results ====================
  results: {
    recordCount: {
      total: Number,
      exported: Number,
      skipped: Number,
      failed: Number
    },
    files: [{
      filename: String,
      path: String,
      size: Number,
      checksum: String,
      encrypted: Boolean,
      createdAt: Date
    }],
    storage: {
      location: {
        type: String,
        enum: ['local', 's3', 'azure', 'gcs', 'archive'],
        required: true
      },
      bucket: String,
      path: String,
      region: String,
      url: String,
      signedUrl: String,
      signedUrlExpiry: Date
    },
    summary: {
      totalSize: Number,
      compressedSize: Number,
      compressionRatio: Number,
      processingTime: Number,
      exportRate: Number // records per second
    }
  },

  // ==================== Access & Permissions ====================
  access: {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalRequired: Boolean,
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved'
    },
    approvalDate: Date,
    approvalNotes: String,
    permissions: {
      canView: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      canDownload: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      canDelete: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      roles: [String]
    },
    accessLog: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      action: {
        type: String,
        enum: ['viewed', 'downloaded', 'shared', 'deleted']
      },
      timestamp: Date,
      ip: String,
      userAgent: String
    }]
  },

  // ==================== Compliance & Legal ====================
  compliance: {
    purpose: {
      type: String,
      enum: [
        'regulatory_compliance',
        'legal_discovery',
        'internal_audit',
        'investigation',
        'backup',
        'data_subject_request',
        'other'
      ],
      required: true
    },
    frameworks: [{
      type: String,
      enum: ['gdpr', 'hipaa', 'sox', 'pci-dss', 'iso27001', 'ccpa']
    }],
    legalHold: {
      active: { type: Boolean, default: false },
      caseId: String,
      requestedBy: String,
      startDate: Date,
      endDate: Date
    },
    dataSubjectRequest: {
      requestId: String,
      subjectId: String,
      requestType: {
        type: String,
        enum: ['access', 'portability', 'rectification', 'erasure']
      }
    },
    retention: {
      policy: String,
      expiryDate: Date,
      autoDelete: { type: Boolean, default: false },
      extensionHistory: [{
        extendedBy: Number,
        extendedAt: Date,
        reason: String,
        authorizedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    }
  },

  // ==================== Processing Configuration ====================
  configuration: {
    schedule: {
      frequency: {
        type: String,
        enum: ['once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']
      },
      cronExpression: String,
      timezone: String,
      nextRun: Date
    },
    processing: {
      priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'critical'],
        default: 'normal'
      },
      batchSize: { type: Number, default: 1000 },
      parallel: { type: Boolean, default: false },
      workerCount: { type: Number, default: 1 },
      timeout: { type: Number, default: 3600000 }, // 1 hour default
      memoryLimit: Number
    },
    notifications: {
      onComplete: {
        enabled: Boolean,
        recipients: [String],
        includeDownloadLink: Boolean
      },
      onFailure: {
        enabled: Boolean,
        recipients: [String]
      },
      webhooks: [{
        url: String,
        events: [String],
        headers: mongoose.Schema.Types.Mixed
      }]
    },
    postProcessing: {
      deleteOriginalLogs: { type: Boolean, default: false },
      createBackup: { type: Boolean, default: true },
      generateReport: { type: Boolean, default: false },
      indexForSearch: { type: Boolean, default: false }
    }
  },

  // ==================== Integrity & Verification ====================
  integrity: {
    hash: {
      algorithm: {
        type: String,
        enum: ['sha256', 'sha512', 'sha3-512'],
        default: 'sha256'
      },
      value: String,
      verified: Boolean,
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    signature: {
      algorithm: String,
      value: String,
      publicKeyId: String,
      signedAt: Date,
      signedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    chainOfCustody: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date,
      hash: String,
      notes: String
    }]
  },

  // ==================== Related Entities ====================
  relationships: {
    auditLogs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    }],
    parentExportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditExport'
    },
    childExports: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditExport'
    }],
    retentionPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditRetentionPolicy'
    },
    incidents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityIncident'
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    version: {
      type: String,
      default: '1.0'
    },
    source: {
      system: String,
      version: String,
      hostname: String
    },
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }]
  }
};

// Create schema
const auditExportSchema = BaseModel.createSchema(auditExportSchemaDefinition, {
  collection: 'audit_exports',
  timestamps: true,
  strict: true
});

// ==================== Indexes ====================
auditExportSchema.index({ organizationId: 1, createdAt: -1 });
auditExportSchema.index({ 'export.type': 1, 'status.state': 1 });
auditExportSchema.index({ 'access.requestedBy': 1, createdAt: -1 });
auditExportSchema.index({ 'compliance.retention.expiryDate': 1 });
auditExportSchema.index({ 'configuration.schedule.nextRun': 1 });
auditExportSchema.index({ 'scope.dateRange.start': 1, 'scope.dateRange.end': 1 });

// Text search
auditExportSchema.index({
  'export.name': 'text',
  'export.description': 'text'
});

// ==================== Virtual Fields ====================
auditExportSchema.virtual('isExpired').get(function() {
  return this.compliance.retention.expiryDate && 
         this.compliance.retention.expiryDate < new Date();
});

auditExportSchema.virtual('isProcessing').get(function() {
  return this.status.state === 'processing';
});

auditExportSchema.virtual('isAvailable').get(function() {
  return this.status.state === 'completed' && 
         !this.isExpired &&
         this.results.files?.length > 0;
});

auditExportSchema.virtual('canAutoDelete').get(function() {
  return this.isExpired && 
         this.compliance.retention.autoDelete && 
         !this.compliance.legalHold?.active;
});

auditExportSchema.virtual('downloadUrl').get(function() {
  if (!this.isAvailable) return null;
  
  if (this.results.storage.signedUrl && 
      this.results.storage.signedUrlExpiry > new Date()) {
    return this.results.storage.signedUrl;
  }
  
  return this.results.storage.url;
});

// ==================== Pre-save Middleware ====================
auditExportSchema.pre('save', async function(next) {
  try {
    // Generate export ID if not set
    if (!this.export.id) {
      this.export.id = `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }

    // Calculate progress percentage
    if (this.status.progress.total > 0) {
      this.status.progress.percentage = Math.round(
        (this.status.progress.current / this.status.progress.total) * 100
      );
    }

    // Calculate duration if completed
    if (this.status.completedAt && this.status.startedAt) {
      this.status.duration = this.status.completedAt.getTime() - this.status.startedAt.getTime();
    }

    // Set retention expiry date based on compliance
    if (!this.compliance.retention.expiryDate) {
      this.compliance.retention.expiryDate = this.calculateRetentionExpiry();
    }

    // Generate integrity hash for completed exports
    if (this.status.state === 'completed' && !this.integrity.hash.value) {
      this.integrity.hash.value = await this.generateIntegrityHash();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
auditExportSchema.post('save', async function(doc) {
  try {
    // Send notifications if configured
    if (doc.status.state === 'completed' && doc.configuration.notifications.onComplete.enabled) {
      await doc.sendCompletionNotifications();
    }

    if (doc.status.state === 'failed' && doc.configuration.notifications.onFailure.enabled) {
      await doc.sendFailureNotifications();
    }

    // Trigger webhooks
    if (doc.configuration.notifications.webhooks?.length) {
      await doc.triggerWebhooks(doc.status.state);
    }

  } catch (error) {
    logger.error('Error in audit export post-save hook', {
      exportId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
auditExportSchema.methods.calculateRetentionExpiry = function() {
  const retentionDays = {
    regulatory_compliance: 2555, // 7 years
    legal_discovery: 3650,      // 10 years
    internal_audit: 1095,       // 3 years
    investigation: 730,         // 2 years
    backup: 365,               // 1 year
    data_subject_request: 30,  // 30 days
    other: 90                  // 90 days
  };

  const days = retentionDays[this.compliance.purpose] || 90;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

auditExportSchema.methods.generateIntegrityHash = async function() {
  const crypto = require('crypto');
  const hash = crypto.createHash(this.integrity.hash.algorithm || 'sha256');

  // Include key export data in hash
  const dataToHash = {
    exportId: this.export.id,
    organizationId: this.organizationId,
    scope: this.scope,
    results: {
      recordCount: this.results.recordCount,
      files: this.results.files.map(f => ({
        filename: f.filename,
        size: f.size,
        checksum: f.checksum
      }))
    },
    timestamp: this.createdAt
  };

  hash.update(JSON.stringify(dataToHash, Object.keys(dataToHash).sort()));
  return hash.digest('hex');
};

auditExportSchema.methods.start = async function() {
  if (this.status.state !== 'pending') {
    throw new AppError('Export is not in pending state', 400, 'INVALID_STATE');
  }

  this.status.state = 'processing';
  this.status.startedAt = new Date();
  this.status.progress.phase = 'initializing';
  this.status.progress.lastUpdate = new Date();

  await this.save();
  
  logger.info('Audit export started', {
    exportId: this._id,
    type: this.export.type
  });

  return this;
};

auditExportSchema.methods.updateProgress = async function(current, total, phase) {
  this.status.progress.current = current;
  this.status.progress.total = total;
  this.status.progress.phase = phase;
  this.status.progress.lastUpdate = new Date();

  // Avoid too frequent saves
  const lastUpdate = this.status.progress.lastUpdate;
  const now = new Date();
  if (!lastUpdate || now - lastUpdate > 5000) { // Update every 5 seconds
    await this.save();
  }

  return this;
};

auditExportSchema.methods.complete = async function(results) {
  this.status.state = 'completed';
  this.status.completedAt = new Date();
  this.status.progress.percentage = 100;
  this.results = {
    ...this.results,
    ...results
  };

  // Calculate summary statistics
  if (this.results.files?.length) {
    this.results.summary.totalSize = this.results.files.reduce((sum, f) => sum + f.size, 0);
  }

  if (this.status.startedAt) {
    this.results.summary.processingTime = this.status.completedAt - this.status.startedAt;
    if (this.results.recordCount.exported > 0) {
      this.results.summary.exportRate = Math.round(
        this.results.recordCount.exported / (this.results.summary.processingTime / 1000)
      );
    }
  }

  await this.save();
  
  logger.info('Audit export completed', {
    exportId: this._id,
    recordsExported: this.results.recordCount.exported,
    duration: this.results.summary.processingTime
  });

  return this;
};

auditExportSchema.methods.fail = async function(error) {
  this.status.state = 'failed';
  this.status.completedAt = new Date();
  this.status.error = {
    code: error.code || 'EXPORT_FAILED',
    message: error.message,
    details: error.details || {},
    occurredAt: new Date()
  };

  // Check if we should retry
  if (this.status.retries.count < this.status.retries.maxRetries) {
    this.status.retries.count++;
    this.status.retries.lastRetryAt = new Date();
    this.status.state = 'pending'; // Reset to pending for retry
    
    logger.warn('Audit export failed, will retry', {
      exportId: this._id,
      attempt: this.status.retries.count,
      error: error.message
    });
  } else {
    logger.error('Audit export failed permanently', {
      exportId: this._id,
      error: error.message
    });
  }

  await this.save();
  return this;
};

auditExportSchema.methods.generateSignedUrl = async function(expiryHours = 24) {
  if (!this.isAvailable) {
    throw new AppError('Export is not available', 400, 'EXPORT_NOT_AVAILABLE');
  }

  const signedUrl = await fileService.generateSignedUrl({
    bucket: this.results.storage.bucket,
    key: this.results.storage.path,
    expires: expiryHours * 3600
  });

  this.results.storage.signedUrl = signedUrl;
  this.results.storage.signedUrlExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await this.save();
  return signedUrl;
};

auditExportSchema.methods.addToChainOfCustody = async function(action, userId, notes) {
  if (!this.integrity.chainOfCustody) {
    this.integrity.chainOfCustody = [];
  }

  const currentHash = await this.generateIntegrityHash();

  this.integrity.chainOfCustody.push({
    action,
    performedBy: userId,
    timestamp: new Date(),
    hash: currentHash,
    notes
  });

  await this.save();
  return this;
};

auditExportSchema.methods.verify = async function(userId) {
  const currentHash = await this.generateIntegrityHash();
  const isValid = currentHash === this.integrity.hash.value;

  this.integrity.hash.verified = isValid;
  this.integrity.hash.verifiedAt = new Date();
  this.integrity.hash.verifiedBy = userId;

  await this.save();

  if (!isValid) {
    logger.security('Audit export integrity verification failed', {
      exportId: this._id,
      expectedHash: this.integrity.hash.value,
      actualHash: currentHash
    });
  }

  return isValid;
};

auditExportSchema.methods.extendRetention = async function(days, reason, authorizedBy) {
  const currentExpiry = this.compliance.retention.expiryDate;
  const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);

  if (!this.compliance.retention.extensionHistory) {
    this.compliance.retention.extensionHistory = [];
  }

  this.compliance.retention.extensionHistory.push({
    extendedBy: days,
    extendedAt: new Date(),
    reason,
    authorizedBy
  });

  this.compliance.retention.expiryDate = newExpiry;
  
  await this.save();
  
  logger.info('Export retention extended', {
    exportId: this._id,
    days,
    newExpiry
  });

  return this;
};

auditExportSchema.methods.markForDeletion = async function() {
  if (this.compliance.legalHold?.active) {
    throw new AppError('Cannot delete export under legal hold', 400, 'LEGAL_HOLD_ACTIVE');
  }

  this.status.state = 'deleted';
  this.status.completedAt = new Date();

  // Delete files from storage
  if (this.results.files?.length) {
    for (const file of this.results.files) {
      try {
        await fileService.deleteFile({
          bucket: this.results.storage.bucket,
          key: file.path
        });
      } catch (error) {
        logger.error('Failed to delete export file', {
          exportId: this._id,
          file: file.filename,
          error: error.message
        });
      }
    }
  }

  await this.save();
  
  logger.info('Export marked for deletion', {
    exportId: this._id
  });

  return this;
};

auditExportSchema.methods.logAccess = async function(userId, action, request) {
  if (!this.access.accessLog) {
    this.access.accessLog = [];
  }

  this.access.accessLog.push({
    userId,
    action,
    timestamp: new Date(),
    ip: request?.ip,
    userAgent: request?.headers?.['user-agent']
  });

  // Keep only last 100 access logs
  if (this.access.accessLog.length > 100) {
    this.access.accessLog = this.access.accessLog.slice(-100);
  }

  await this.save();
  return this;
};

auditExportSchema.methods.sendCompletionNotifications = async function() {
  const notificationService = require('../../../services/notification-service');
  
  const downloadUrl = this.configuration.notifications.onComplete.includeDownloadLink ? 
    await this.generateSignedUrl() : null;

  await notificationService.send({
    channel: 'email',
    recipients: this.configuration.notifications.onComplete.recipients,
    template: 'audit-export-complete',
    data: {
      export: this.toObject(),
      downloadUrl,
      expiryHours: 24
    }
  });
};

auditExportSchema.methods.sendFailureNotifications = async function() {
  const notificationService = require('../../../services/notification-service');
  
  await notificationService.send({
    channel: 'email',
    recipients: this.configuration.notifications.onFailure.recipients,
    template: 'audit-export-failed',
    priority: 'high',
    data: {
      export: this.toObject(),
      error: this.status.error
    }
  });
};

auditExportSchema.methods.triggerWebhooks = async function(event) {
  const webhookService = require('../../../services/webhook-service');
  
  const webhooks = this.configuration.notifications.webhooks.filter(
    w => w.events.includes(event) || w.events.includes('*')
  );

  for (const webhook of webhooks) {
    try {
      await webhookService.send({
        url: webhook.url,
        headers: webhook.headers,
        data: {
          event: `audit_export.${event}`,
          export: this.toObject(),
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to trigger export webhook', {
        exportId: this._id,
        webhook: webhook.url,
        error: error.message
      });
    }
  }
};

// ==================== Static Methods ====================
auditExportSchema.statics.createExport = async function(exportData) {
  const auditExport = new this(exportData);
  await auditExport.save();
  
  logger.info('Audit export created', {
    exportId: auditExport._id,
    type: auditExport.export.type,
    purpose: auditExport.compliance.purpose
  });
  
  return auditExport;
};

auditExportSchema.statics.findPendingExports = async function(limit = 10) {
  return await this.find({
    'status.state': 'pending',
    $or: [
      { 'configuration.schedule.nextRun': { $lte: new Date() } },
      { 'configuration.schedule.frequency': 'once' }
    ]
  })
  .sort({ 'configuration.processing.priority': -1, createdAt: 1 })
  .limit(limit);
};

auditExportSchema.statics.findExpiredExports = async function(batchSize = 100) {
  return await this.find({
    'compliance.retention.expiryDate': { $lte: new Date() },
    'compliance.retention.autoDelete': true,
    'compliance.legalHold.active': { $ne: true },
    'status.state': { $ne: 'deleted' }
  })
  .limit(batchSize);
};

auditExportSchema.statics.getExportStatistics = async function(organizationId, timeRange = '30d') {
  const timeRanges = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000
  };

  const startDate = new Date(Date.now() - (timeRanges[timeRange] || timeRanges['30d']));

  const stats = await this.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(organizationId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status.state', 'completed'] }, 1, 0] }
              },
              failed: {
                $sum: { $cond: [{ $eq: ['$status.state', 'failed'] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$status.state', 'pending'] }, 1, 0] }
              },
              totalRecords: { $sum: '$results.recordCount.exported' },
              totalSize: { $sum: '$results.summary.totalSize' },
              avgProcessingTime: { $avg: '$results.summary.processingTime' }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$export.type',
              count: { $sum: 1 },
              totalRecords: { $sum: '$results.recordCount.exported' },
              avgSize: { $avg: '$results.summary.totalSize' }
            }
          }
        ],
        byPurpose: [
          {
            $group: {
              _id: '$compliance.purpose',
              count: { $sum: 1 }
            }
          }
        ],
        byFormat: [
          {
            $group: {
              _id: '$export.format',
              count: { $sum: 1 },
              totalSize: { $sum: '$results.summary.totalSize' }
            }
          }
        ],
        timeline: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              },
              count: { $sum: 1 },
              records: { $sum: '$results.recordCount.exported' },
              size: { $sum: '$results.summary.totalSize' }
            }
          },
          { $sort: { _id: 1 } }
        ],
        topUsers: [
          {
            $group: {
              _id: '$access.requestedBy',
              exportCount: { $sum: 1 },
              totalRecords: { $sum: '$results.recordCount.exported' }
            }
          },
          { $sort: { exportCount: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);

  return stats[0];
};

auditExportSchema.statics.processScheduledExports = async function() {
  const pendingExports = await this.findPendingExports();
  const processed = [];
  const errors = [];

  for (const exportDoc of pendingExports) {
    try {
      await exportDoc.start();
      
      // Queue for processing
      const jobId = await this.queueExportJob(exportDoc);
      
      processed.push({
        exportId: exportDoc._id,
        jobId
      });
      
    } catch (error) {
      errors.push({
        exportId: exportDoc._id,
        error: error.message
      });
      
      logger.error('Failed to process scheduled export', {
        exportId: exportDoc._id,
        error: error.message
      });
    }
  }

  return { processed, errors };
};

auditExportSchema.statics.queueExportJob = async function(exportDoc) {
  // This would integrate with your job queue system
  // For now, returning a mock job ID
  const jobId = `JOB-${exportDoc._id}-${Date.now()}`;
  
  logger.info('Export job queued', {
    exportId: exportDoc._id,
    jobId
  });
  
  return jobId;
};

auditExportSchema.statics.cleanupExpiredExports = async function() {
  const expiredExports = await this.findExpiredExports();
  let deleted = 0;
  let errors = 0;

  for (const exportDoc of expiredExports) {
    try {
      await exportDoc.markForDeletion();
      deleted++;
    } catch (error) {
      errors++;
      logger.error('Failed to cleanup expired export', {
        exportId: exportDoc._id,
        error: error.message
      });
    }
  }

  logger.info('Export cleanup completed', {
    deleted,
    errors,
    total: expiredExports.length
  });

  return { deleted, errors, total: expiredExports.length };
};

// Create and export model
const AuditExportModel = BaseModel.createModel('AuditExport', auditExportSchema);

module.exports = AuditExportModel;