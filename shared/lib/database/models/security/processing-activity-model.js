'use strict';

/**
 * @fileoverview Data processing activity model for GDPR Article 30 compliance
 * @module shared/lib/database/models/processing-activity-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');

/**
 * Processing activity schema definition for GDPR compliance
 */
const processingActivitySchemaDefinition = {
  // Activity identifier
  activityId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // User whose data is being processed
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Organization performing the processing
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // Processing details
  processingDetails: {
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000
    },
    purpose: {
      type: String,
      required: true,
      maxlength: 1000
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    completedAt: Date,
    status: {
      type: String,
      enum: ['active', 'completed', 'paused', 'cancelled'],
      default: 'active',
      index: true
    }
  },

  // Legal basis for processing
  legalBasis: {
    basis: {
      type: String,
      required: true,
      enum: ['consent', 'contract', 'legal-obligation', 'vital-interests', 'public-task', 'legitimate-interests']
    },
    description: String,
    legitimateInterest: {
      assessment: String,
      balancingTest: String,
      safeguards: [String]
    }
  },

  // Data categories being processed
  dataCategories: [{
    category: {
      type: String,
      enum: ['personal-data', 'sensitive-personal-data', 'criminal-conviction-data', 'children-data', 'biometric-data', 'genetic-data', 'health-data']
    },
    specificTypes: [String],
    volume: String,
    sources: [String]
  }],

  // Data subjects
  dataSubjects: {
    categories: [{
      type: String,
      enum: ['employees', 'customers', 'prospects', 'suppliers', 'website-visitors', 'children', 'vulnerable-adults']
    }],
    estimatedNumber: Number,
    geographicScope: [String]
  },

  // Recipients of data
  recipients: [{
    name: String,
    type: {
      type: String,
      enum: ['internal', 'processor', 'controller', 'third-party', 'public-authority']
    },
    country: String,
    safeguards: String,
    purpose: String
  }],

  // Data transfers
  internationalTransfers: {
    hasTransfers: {
      type: Boolean,
      default: false
    },
    countries: [String],
    transferMechanism: {
      type: String,
      enum: ['adequacy-decision', 'sccs', 'bcrs', 'derogation', 'consent']
    },
    safeguards: String
  },

  // Retention
  retention: {
    period: {
      type: String,
      required: true
    },
    criteria: String,
    reviewDate: Date
  },

  // Security measures
  securityMeasures: {
    technical: [String],
    organizational: [String],
    encryptionUsed: Boolean,
    pseudonymizationUsed: Boolean,
    accessControls: String
  },

  // Data Protection Impact Assessment (DPIA)
  dpia: {
    required: Boolean,
    conductedAt: Date,
    outcome: String,
    mitigationMeasures: [String],
    residualRisk: {
      type: String,
      enum: ['low', 'medium', 'high']
    }
  },

  // Compliance information
  compliance: {
    dataProtectionOfficer: {
      notified: Boolean,
      notifiedAt: Date,
      feedback: String
    },
    supervisoryAuthority: {
      notified: Boolean,
      notifiedAt: Date,
      registrationNumber: String
    },
    lastReviewDate: Date,
    nextReviewDate: Date
  },

  // Audit trail
  auditTrail: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: Date,
    changes: mongoose.Schema.Types.Mixed
  }],

  // Additional metadata
  metadata: {
    version: {
      type: String,
      default: '1.0'
    },
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed
  }
};

// Create schema
const processingActivitySchema = BaseModel.createSchema(processingActivitySchemaDefinition, {
  collection: 'processing_activities',
  timestamps: true
});

// Indexes
processingActivitySchema.index({ 'processingDetails.startedAt': -1 });
processingActivitySchema.index({ organizationId: 1, 'processingDetails.status': 1 });
processingActivitySchema.index({ 'retention.reviewDate': 1 });
processingActivitySchema.index({ 'compliance.nextReviewDate': 1 });

// Instance methods
processingActivitySchema.methods.complete = async function() {
  this.processingDetails.status = 'completed';
  this.processingDetails.completedAt = new Date();
  await this.save();
  return this;
};

processingActivitySchema.methods.addAuditEntry = async function(action, userId, changes) {
  this.auditTrail.push({
    action,
    performedBy: userId,
    performedAt: new Date(),
    changes
  });
  await this.save();
  return this;
};

processingActivitySchema.methods.requiresDPIA = function() {
  // DPIA required for high-risk processing
  const highRiskCategories = ['sensitive-personal-data', 'biometric-data', 'genetic-data', 'health-data', 'criminal-conviction-data'];
  const hasHighRiskData = this.dataCategories.some(cat => highRiskCategories.includes(cat.category));
  const largeScale = this.dataSubjects.estimatedNumber > 5000;
  const systematicMonitoring = this.processingDetails.purpose.toLowerCase().includes('monitoring');
  
  return hasHighRiskData || largeScale || systematicMonitoring;
};

// Static methods
processingActivitySchema.statics.findActiveByOrganization = async function(organizationId) {
  return await this.find({
    organizationId,
    'processingDetails.status': 'active'
  });
};

processingActivitySchema.statics.findRequiringReview = async function() {
  return await this.find({
    'compliance.nextReviewDate': { $lte: new Date() }
  });
};

processingActivitySchema.statics.generateReport = async function(organizationId, startDate, endDate) {
  const match = { organizationId };
  if (startDate || endDate) {
    match['processingDetails.startedAt'] = {};
    if (startDate) match['processingDetails.startedAt'].$gte = startDate;
    if (endDate) match['processingDetails.startedAt'].$lte = endDate;
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          status: '$processingDetails.status',
          legalBasis: '$legalBasis.basis'
        },
        count: { $sum: 1 },
        activities: { $push: '$activityId' }
      }
    }
  ]);
};

// Create and export model
const ProcessingActivityModel = BaseModel.createModel('ProcessingActivity', processingActivitySchema);

module.exports = ProcessingActivityModel;