'use strict';

/**
 * @fileoverview Erasure log model for tracking GDPR Article 17 (Right to Erasure) requests
 * @module shared/lib/database/models/erasure-log-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');

/**
 * Erasure log schema definition for GDPR compliance
 */
const erasureLogSchemaDefinition = {
  // Erasure request identifier
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // User whose data was erased
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Type of GDPR right exercised
  type: {
    type: String,
    default: 'right-to-erasure',
    enum: ['right-to-erasure', 'right-to-be-forgotten']
  },

  // Reason for erasure
  reason: {
    type: String,
    required: true,
    maxlength: 1000
  },

  // Request details
  requestDetails: {
    requestedAt: {
      type: Date,
      required: true,
      index: true
    },
    requestedBy: {
      type: String,
      enum: ['data-subject', 'legal-guardian', 'authorized-representative', 'admin', 'system'],
      required: true
    },
    requestMethod: {
      type: String,
      enum: ['web-form', 'email', 'phone', 'postal', 'api', 'admin-panel']
    },
    verificationMethod: String,
    ticketId: String,
    ipAddress: String
  },

  // Erasure timeline
  timeline: {
    startedAt: {
      type: Date,
      required: true
    },
    completedAt: Date,
    duration: Number, // in milliseconds
    deadlineDate: Date // GDPR requires completion within 30 days
  },

  // Data that was erased
  erasedData: {
    type: Map,
    of: {
      recordCount: Number,
      collections: [String],
      method: String,
      verificationHash: String
    }
  },

  // Data retained for legal reasons
  retainedData: {
    type: Map,
    of: {
      reason: String,
      legalBasis: String,
      retentionPeriod: String,
      categories: [String]
    }
  },

  // Processing status
  status: {
    success: {
      type: Boolean,
      required: true
    },
    partialSuccess: Boolean,
    errors: [{
      category: String,
      error: String,
      timestamp: Date
    }]
  },

  // Verification details
  verification: {
    preErasureBackup: {
      created: Boolean,
      location: String,
      expiresAt: Date
    },
    postErasureCheck: {
      performed: Boolean,
      performedAt: Date,
      result: String
    },
    certificateGenerated: Boolean,
    certificateId: String
  },

  // Systems and services affected
  affectedSystems: [{
    system: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed']
    },
    erasedAt: Date,
    recordCount: Number
  }],

  // Legal and compliance tracking
  compliance: {
    gdprCompliant: {
      type: Boolean,
      default: true
    },
    withinDeadline: Boolean,
    exceptions: [{
      article: String,
      reason: String
    }],
    notifications: {
      dataSubject: {
        sent: Boolean,
        sentAt: Date,
        method: String
      },
      thirdParties: [{
        name: String,
        notifiedAt: Date,
        response: String
      }]
    }
  },

  // Organization context
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // Approval workflow
  approval: {
    required: Boolean,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    comments: String
  },

  // Additional metadata
  metadata: {
    automatedErasure: Boolean,
    manualInterventionRequired: Boolean,
    cascadeErasure: Boolean,
    version: {
      type: String,
      default: '1.0'
    },
    tags: [String]
  }
};

// Create schema
const erasureLogSchema = BaseModel.createSchema(erasureLogSchemaDefinition, {
  collection: 'erasure_logs',
  timestamps: true
});

// Indexes
erasureLogSchema.index({ 'timeline.completedAt': -1 });
erasureLogSchema.index({ organizationId: 1, 'status.success': 1 });
erasureLogSchema.index({ 'requestDetails.requestedAt': -1 });
erasureLogSchema.index({ 'timeline.deadlineDate': 1 });

// Instance methods
erasureLogSchema.methods.markCompleted = async function() {
  this.timeline.completedAt = new Date();
  this.timeline.duration = this.timeline.completedAt - this.timeline.startedAt;
  this.compliance.withinDeadline = this.timeline.completedAt <= this.timeline.deadlineDate;
  await this.save();
  return this;
};

erasureLogSchema.methods.addError = async function(category, error) {
  if (!this.status.errors) {
    this.status.errors = [];
  }
  this.status.errors.push({
    category,
    error,
    timestamp: new Date()
  });
  this.status.partialSuccess = true;
  await this.save();
  return this;
};

erasureLogSchema.methods.generateCertificate = function() {
  const certificate = {
    erasureId: this.id,
    userId: this.userId,
    completedAt: this.timeline.completedAt,
    dataCategories: Array.from(this.erasedData.keys()),
    retainedCategories: Array.from(this.retainedData.keys()),
    verificationHash: this.generateVerificationHash()
  };
  this.verification.certificateGenerated = true;
  this.verification.certificateId = `CERT-${this.id}`;
  return certificate;
};

erasureLogSchema.methods.generateVerificationHash = function() {
  const crypto = require('crypto');
  const data = {
    id: this.id,
    userId: this.userId,
    completedAt: this.timeline.completedAt,
    erasedData: Object.fromEntries(this.erasedData)
  };
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

// Static methods
erasureLogSchema.statics.findPendingRequests = async function() {
  return await this.find({
    'timeline.completedAt': { $exists: false }
  }).sort({ 'timeline.deadlineDate': 1 });
};

erasureLogSchema.statics.findOverdueRequests = async function() {
  return await this.find({
    'timeline.completedAt': { $exists: false },
    'timeline.deadlineDate': { $lt: new Date() }
  });
};

erasureLogSchema.statics.getErasureStatistics = async function(startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match['timeline.completedAt'] = {};
    if (startDate) match['timeline.completedAt'].$gte = startDate;
    if (endDate) match['timeline.completedAt'].$lte = endDate;
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        successfulRequests: {
          $sum: { $cond: ['$status.success', 1, 0] }
        },
        partialRequests: {
          $sum: { $cond: ['$status.partialSuccess', 1, 0] }
        },
        withinDeadline: {
          $sum: { $cond: ['$compliance.withinDeadline', 1, 0] }
        },
        averageDuration: { $avg: '$timeline.duration' }
      }
    }
  ]);
};

// Create and export model
const ErasureLog = BaseModel.createModel('ErasureLog', erasureLogSchema);

module.exports = ErasureLog;