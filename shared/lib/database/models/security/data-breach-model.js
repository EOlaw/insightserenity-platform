'use strict';

/**
 * @fileoverview Data breach tracking model for GDPR Article 33 & 34 compliance
 * @module shared/lib/database/models/data-breach-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');

/**
 * Data breach schema definition for GDPR compliance
 */
const dataBreachSchemaDefinition = {
  // Breach identifier
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Breach timeline
  timeline: {
    discoveredAt: {
      type: Date,
      required: true,
      index: true
    },
    reportedAt: {
      type: Date,
      required: true
    },
    containedAt: Date,
    resolvedAt: Date,
    notificationDeadline: {
      type: Date,
      required: true // Must notify within 72 hours
    }
  },

  // Affected data and users
  impact: {
    affectedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    affectedUserCount: {
      type: Number,
      required: true,
      min: 0
    },
    dataCategories: [{
      type: String,
      enum: ['personal-data', 'sensitive-personal-data', 'criminal-conviction-data', 'children-data', 'biometric-data', 'genetic-data', 'health-data', 'financial-data', 'authentication-data']
    }],
    recordsAffected: Number,
    estimatedImpact: String
  },

  // Breach details
  breachDetails: {
    type: {
      type: String,
      required: true,
      enum: ['confidentiality', 'integrity', 'availability', 'mixed']
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
      index: true
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000
    },
    cause: {
      type: String,
      enum: ['external-attack', 'internal-mistake', 'system-failure', 'third-party', 'lost-device', 'unauthorized-access', 'malware', 'phishing', 'other']
    },
    vector: String,
    vulnerabilityExploited: String
  },

  // Risk assessment
  riskAssessment: {
    likelihoodOfHarm: {
      type: String,
      enum: ['unlikely', 'possible', 'likely', 'highly-likely']
    },
    severityOfHarm: {
      type: String,
      enum: ['minimal', 'moderate', 'significant', 'severe']
    },
    riskToRights: {
      physicalHarm: Boolean,
      materialDamage: Boolean,
      reputationalDamage: Boolean,
      financialLoss: Boolean,
      identityTheft: Boolean,
      discrimination: Boolean,
      otherSignificantHarm: String
    },
    overallRiskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'very-high']
    }
  },

  // Containment and mitigation
  response: {
    containmentMeasures: [{
      measure: String,
      implementedAt: Date,
      effectiveness: String
    }],
    mitigationActions: [{
      action: String,
      status: {
        type: String,
        enum: ['planned', 'in-progress', 'completed']
      },
      completedAt: Date,
      responsibleParty: String
    }],
    preventiveMeasures: [String],
    technicalMeasures: [String],
    organizationalMeasures: [String]
  },

  // Notification tracking
  notifications: {
    authorities: {
      required: {
        type: Boolean,
        default: false
      },
      notified: {
        type: Boolean,
        default: false
      },
      notifiedAt: Date,
      authorityName: String,
      referenceNumber: String,
      feedback: String,
      additionalInfoRequested: Boolean
    },
    dataSubjects: {
      required: {
        type: Boolean,
        default: false
      },
      notified: {
        type: Boolean,
        default: false
      },
      notifiedAt: Date,
      notificationMethod: {
        type: String,
        enum: ['email', 'postal', 'website', 'direct-communication', 'public-communication']
      },
      notificationContent: String,
      recipientCount: Number
    },
    thirdParties: [{
      name: String,
      type: String,
      notifiedAt: Date,
      response: String
    }],
    media: {
      required: Boolean,
      notified: Boolean,
      notifiedAt: Date,
      pressRelease: String
    }
  },

  // Investigation details
  investigation: {
    status: {
      type: String,
      enum: ['pending', 'ongoing', 'completed', 'closed'],
      default: 'pending'
    },
    leadInvestigator: String,
    team: [String],
    findings: String,
    rootCause: String,
    lessonsLearned: [String],
    reportUrl: String
  },

  // Compliance tracking
  compliance: {
    gdprCompliant: {
      type: Boolean,
      default: true
    },
    notificationWithinDeadline: Boolean,
    documentationComplete: Boolean,
    dpaRequirementsMet: Boolean,
    crossBorderBreach: Boolean,
    affectedCountries: [String]
  },

  // Status tracking
  status: {
    current: {
      type: String,
      required: true,
      enum: ['reported', 'assessing', 'containing', 'investigating', 'notifying', 'monitoring', 'resolved', 'closed'],
      default: 'reported',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    closureReason: String,
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Organization context
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // Documentation
  documentation: {
    internalReport: String,
    externalReport: String,
    evidenceFiles: [{
      filename: String,
      uploadedAt: Date,
      type: String
    }],
    communicationLogs: [{
      date: Date,
      party: String,
      summary: String
    }]
  },

  // Additional metadata
  metadata: {
    reportingUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String],
    relatedIncidents: [String],
    version: {
      type: String,
      default: '1.0'
    },
    lastReviewDate: Date,
    nextReviewDate: Date
  }
};

// Create schema
const dataBreachSchema = BaseModel.createSchema(dataBreachSchemaDefinition, {
  collection: 'data_breaches',
  timestamps: true
});

// Indexes
dataBreachSchema.index({ 'timeline.discoveredAt': -1 });
dataBreachSchema.index({ organizationId: 1, 'status.current': 1 });
dataBreachSchema.index({ 'breachDetails.severity': 1, 'status.isActive': 1 });
dataBreachSchema.index({ 'timeline.notificationDeadline': 1 });
dataBreachSchema.index({ 'compliance.crossBorderBreach': 1 });

// Instance methods
dataBreachSchema.methods.assessNotificationRequirement = function() {
  const highRiskCategories = ['sensitive-personal-data', 'financial-data', 'authentication-data', 'health-data', 'biometric-data'];
  const hasHighRiskData = this.impact.dataCategories.some(cat => highRiskCategories.includes(cat));
  const highSeverity = ['high', 'critical'].includes(this.breachDetails.severity);
  const likelyHarm = ['likely', 'highly-likely'].includes(this.riskAssessment.likelihoodOfHarm);
  
  // Authority notification always required unless exception applies
  this.notifications.authorities.required = true;
  
  // Data subject notification required for high risk
  this.notifications.dataSubjects.required = hasHighRiskData || highSeverity || likelyHarm;
  
  return {
    authorityNotification: this.notifications.authorities.required,
    dataSubjectNotification: this.notifications.dataSubjects.required,
    reasons: {
      highRiskData: hasHighRiskData,
      highSeverity,
      likelyHarm
    }
  };
};

dataBreachSchema.methods.updateStatus = async function(newStatus, userId) {
  const previousStatus = this.status.current;
  this.status.current = newStatus;
  
  if (newStatus === 'resolved' || newStatus === 'closed') {
    this.timeline.resolvedAt = new Date();
    this.status.isActive = false;
    this.status.closedBy = userId;
  }
  
  await this.save();
  
  return {
    previousStatus,
    newStatus,
    updatedAt: new Date()
  };
};

dataBreachSchema.methods.addContainmentMeasure = async function(measure) {
  this.response.containmentMeasures.push({
    measure,
    implementedAt: new Date()
  });
  
  if (!this.timeline.containedAt) {
    this.timeline.containedAt = new Date();
  }
  
  await this.save();
  return this;
};

dataBreachSchema.methods.isWithinNotificationDeadline = function() {
  return new Date() <= this.timeline.notificationDeadline;
};

// Static methods
dataBreachSchema.statics.findActiveBreaches = async function(organizationId) {
  const query = { 'status.isActive': true };
  if (organizationId) {
    query.organizationId = organizationId;
  }
  
  return await this.find(query).sort({ 'timeline.discoveredAt': -1 });
};

dataBreachSchema.statics.findOverdueNotifications = async function() {
  return await this.find({
    'status.isActive': true,
    'timeline.notificationDeadline': { $lt: new Date() },
    $or: [
      { 'notifications.authorities.notified': false },
      { 
        'notifications.dataSubjects.required': true,
        'notifications.dataSubjects.notified': false
      }
    ]
  });
};

dataBreachSchema.statics.getBreachStatistics = async function(organizationId, period) {
  const match = {};
  if (organizationId) match.organizationId = organizationId;
  
  if (period) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - period);
    match['timeline.discoveredAt'] = { $gte: startDate };
  }

  return await this.aggregate([
    { $match: match },
    {
      $facet: {
        bySeverity: [
          {
            $group: {
              _id: '$breachDetails.severity',
              count: { $sum: 1 },
              avgResolutionTime: {
                $avg: {
                  $subtract: ['$timeline.resolvedAt', '$timeline.discoveredAt']
                }
              }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$breachDetails.type',
              count: { $sum: 1 }
            }
          }
        ],
        byCause: [
          {
            $group: {
              _id: '$breachDetails.cause',
              count: { $sum: 1 }
            }
          }
        ],
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalAffectedUsers: { $sum: '$impact.affectedUserCount' },
              avgAffectedUsers: { $avg: '$impact.affectedUserCount' },
              notifiedOnTime: {
                $sum: {
                  $cond: ['$compliance.notificationWithinDeadline', 1, 0]
                }
              }
            }
          }
        ]
      }
    }
  ]);
};

dataBreachSchema.statics.generateComplianceReport = async function(breachId) {
  const breach = await this.findOne({ id: breachId });
  if (!breach) return null;

  return {
    breachId: breach.id,
    timeline: breach.timeline,
    affectedDataSubjects: breach.impact.affectedUserCount,
    dataCategories: breach.impact.dataCategories,
    notificationStatus: {
      authorities: breach.notifications.authorities,
      dataSubjects: breach.notifications.dataSubjects,
      withinDeadline: breach.compliance.notificationWithinDeadline
    },
    measuresTaken: {
      containment: breach.response.containmentMeasures,
      mitigation: breach.response.mitigationActions,
      preventive: breach.response.preventiveMeasures
    },
    gdprCompliant: breach.compliance.gdprCompliant
  };
};

// Create and export model
const DataBreach = BaseModel.createModel('DataBreach', dataBreachSchema);

module.exports = DataBreach;