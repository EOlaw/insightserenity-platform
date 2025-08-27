'use strict';

/**
 * @fileoverview User activity model for tracking user actions and behavior
 * @module shared/lib/database/models/users/user-activity-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const dateHelper = require('../../../utils/helpers/date-helper');

/**
 * User activity schema definition
 */
const userActivitySchemaDefinition = {
  // User and context
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  sessionId: {
    type: String,
    index: true
  },

  // Activity details
  activityType: {
    type: String,
    required: true,
    enum: [
      'page_view',
      'action',
      'api_call',
      'data_access',
      'data_modification',
      'file_operation',
      'search',
      'export',
      'import',
      'authentication',
      'authorization',
      'configuration',
      'integration',
      'workflow',
      'communication',
      'system'
    ],
    index: true
  },

  category: {
    type: String,
    required: true,
    enum: [
      'navigation',
      'crud',
      'authentication',
      'administration',
      'collaboration',
      'reporting',
      'integration',
      'system'
    ],
    index: true
  },

  action: {
    type: String,
    required: true,
    index: true
  },

  resource: {
    type: String,
    required: true,
    index: true
  },

  resourceId: {
    type: String,
    index: true
  },

  // Activity metadata
  details: {
    method: String,
    endpoint: String,
    query: mongoose.Schema.Types.Mixed,
    payload: mongoose.Schema.Types.Mixed,
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changes: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }],
    affectedRecords: Number,
    searchQuery: String,
    filters: mongoose.Schema.Types.Mixed,
    exportFormat: String,
    importSource: String
  },

  // Result and performance
  status: {
    type: String,
    enum: ['success', 'failure', 'partial', 'pending', 'cancelled'],
    default: 'success',
    index: true
  },

  errorCode: String,
  errorMessage: String,
  
  duration: {
    type: Number, // in milliseconds
    index: true
  },

  // Context information
  context: {
    userAgent: String,
    ipAddress: {
      type: String,
      index: true
    },
    location: {
      country: String,
      region: String,
      city: String
    },
    device: {
      type: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'api', 'unknown']
      },
      os: String,
      browser: String
    },
    referrer: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'system', 'integration']
    }
  },

  // Risk and security
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    index: true
  },

  securityFlags: [{
    type: String,
    enum: [
      'suspicious_pattern',
      'unusual_time',
      'unusual_location',
      'high_volume',
      'sensitive_data',
      'privilege_escalation',
      'unauthorized_attempt',
      'data_exfiltration'
    ]
  }],

  // Impact and importance
  impact: {
    type: String,
    enum: ['none', 'low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },

  dataClassification: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'restricted'],
    default: 'internal'
  },

  // Tracking and correlation
  correlationId: {
    type: String,
    index: true
  },

  parentActivityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserActivity'
  },

  workflowId: String,

  // User experience metrics
  uxMetrics: {
    pageLoadTime: Number,
    renderTime: Number,
    interactionDelay: Number,
    errorCount: Number,
    retryCount: Number
  },

  // Compliance and audit
  compliance: {
    requiresAudit: {
      type: Boolean,
      default: false
    },
    auditLevel: {
      type: String,
      enum: ['basic', 'detailed', 'full']
    },
    frameworks: [{
      type: String,
      enum: ['gdpr', 'hipaa', 'sox', 'pci']
    }],
    retentionPeriod: Number // in days
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  processedAt: Date,

  // Archival
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: Date
};

// Create schema
const userActivitySchema = BaseModel.createSchema(userActivitySchemaDefinition, {
  collection: 'user_activities',
  timestamps: true
});

// Indexes
userActivitySchema.index({ userId: 1, timestamp: -1 });
userActivitySchema.index({ organizationId: 1, timestamp: -1 });
userActivitySchema.index({ resource: 1, action: 1, timestamp: -1 });
userActivitySchema.index({ activityType: 1, status: 1, timestamp: -1 });
userActivitySchema.index({ riskScore: -1, timestamp: -1 });
userActivitySchema.index({ correlationId: 1, timestamp: 1 });
userActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

// Virtual fields
userActivitySchema.virtual('isHighRisk').get(function() {
  return this.riskScore >= 70 || this.securityFlags.length > 0;
});

userActivitySchema.virtual('requiresReview').get(function() {
  return this.impact === 'high' || 
         this.impact === 'critical' || 
         this.isHighRisk ||
         this.status === 'failure' && this.securityFlags.length > 0;
});

// Pre-save middleware
userActivitySchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      // Calculate risk score if not set
      if (!this.riskScore) {
        this.riskScore = await this.calculateRiskScore();
      }

      // Set impact level based on activity
      if (!this.impact) {
        this.impact = this.calculateImpactLevel();
      }

      // Set compliance requirements
      this.setComplianceRequirements();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userActivitySchema.methods.calculateRiskScore = async function() {
  let score = 0;

  // Activity type risk
  const highRiskActivities = ['data_modification', 'export', 'configuration', 'authorization'];
  if (highRiskActivities.includes(this.activityType)) {
    score += 20;
  }

  // Resource sensitivity
  const sensitiveResources = ['users', 'permissions', 'roles', 'billing', 'security'];
  if (sensitiveResources.some(r => this.resource.toLowerCase().includes(r))) {
    score += 25;
  }

  // Action risk
  const riskyActions = ['delete', 'bulk_delete', 'export', 'download', 'grant', 'revoke'];
  if (riskyActions.some(a => this.action.toLowerCase().includes(a))) {
    score += 20;
  }

  // Failed attempts
  if (this.status === 'failure') {
    score += 15;
  }

  // Check for unusual patterns
  const recentActivities = await this.model('UserActivity').find({
    userId: this.userId,
    timestamp: { $gte: new Date(Date.now() - 3600000) } // Last hour
  }).limit(50);

  // High volume detection
  if (recentActivities.length > 30) {
    score += 10;
    this.securityFlags.push('high_volume');
  }

  // Unusual time detection (assuming business hours 8 AM - 6 PM)
  const hour = new Date(this.timestamp).getHours();
  if (hour < 8 || hour > 18) {
    score += 5;
    this.securityFlags.push('unusual_time');
  }

  return Math.min(score, 100);
};

userActivitySchema.methods.calculateImpactLevel = function() {
  // Critical impact activities
  if (['delete', 'bulk_delete', 'purge'].some(a => this.action.includes(a))) {
    return 'critical';
  }

  // High impact activities
  if (['configuration', 'authorization', 'billing'].includes(this.activityType)) {
    return 'high';
  }

  // Medium impact activities
  if (['data_modification', 'export', 'import'].includes(this.activityType)) {
    return 'medium';
  }

  // Low impact activities
  if (['page_view', 'search', 'data_access'].includes(this.activityType)) {
    return 'low';
  }

  return 'none';
};

userActivitySchema.methods.setComplianceRequirements = function() {
  // Set audit requirements based on activity
  const auditRequired = [
    'data_modification',
    'export',
    'authorization',
    'configuration'
  ].includes(this.activityType);

  if (auditRequired) {
    this.compliance.requiresAudit = true;
    this.compliance.auditLevel = this.impact === 'critical' ? 'full' : 'detailed';
  }

  // Set retention period based on compliance needs
  if (this.resource.includes('billing') || this.resource.includes('financial')) {
    this.compliance.frameworks.push('sox');
    this.compliance.retentionPeriod = 2555; // 7 years
  }

  if (this.resource.includes('health') || this.resource.includes('medical')) {
    this.compliance.frameworks.push('hipaa');
    this.compliance.retentionPeriod = 2190; // 6 years
  }

  if (this.resource.includes('user') || this.resource.includes('personal')) {
    this.compliance.frameworks.push('gdpr');
    this.compliance.retentionPeriod = 1095; // 3 years
  }
};

userActivitySchema.methods.linkToWorkflow = async function(workflowId) {
  this.workflowId = workflowId;
  await this.save();
  return this;
};

userActivitySchema.methods.flagForReview = async function(reason) {
  if (!this.securityFlags.includes(reason)) {
    this.securityFlags.push(reason);
    this.riskScore = Math.min(this.riskScore + 20, 100);
    await this.save();
  }
  return this;
};

userActivitySchema.methods.archive = async function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  await this.save();
  return this;
};

// Static methods
userActivitySchema.statics.logActivity = async function(activityData) {
  const activity = new this(activityData);
  await activity.save();

  // Check for security patterns
  await this.detectSecurityPatterns(activity);

  return activity;
};

userActivitySchema.statics.detectSecurityPatterns = async function(currentActivity) {
  const patterns = [];

  // Detect rapid export attempts
  const recentExports = await this.countDocuments({
    userId: currentActivity.userId,
    activityType: 'export',
    timestamp: { $gte: new Date(Date.now() - 600000) } // 10 minutes
  });

  if (recentExports > 5) {
    patterns.push('data_exfiltration');
  }

  // Detect privilege escalation attempts
  const recentAuthChanges = await this.countDocuments({
    userId: currentActivity.userId,
    activityType: 'authorization',
    action: { $in: ['grant', 'assign_role', 'add_permission'] },
    timestamp: { $gte: new Date(Date.now() - 1800000) } // 30 minutes
  });

  if (recentAuthChanges > 3) {
    patterns.push('privilege_escalation');
  }

  // Detect unauthorized access attempts
  const failedAttempts = await this.countDocuments({
    userId: currentActivity.userId,
    status: 'failure',
    errorCode: { $in: ['UNAUTHORIZED', 'FORBIDDEN'] },
    timestamp: { $gte: new Date(Date.now() - 900000) } // 15 minutes
  });

  if (failedAttempts > 10) {
    patterns.push('unauthorized_attempt');
  }

  if (patterns.length > 0) {
    currentActivity.securityFlags.push(...patterns);
    currentActivity.riskScore = Math.min(currentActivity.riskScore + (patterns.length * 15), 100);
    await currentActivity.save();

    logger.warn('Security patterns detected', {
      userId: currentActivity.userId,
      patterns,
      activityId: currentActivity._id
    });
  }

  return patterns;
};

userActivitySchema.statics.getUserActivitySummary = async function(userId, options = {}) {
  const {
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours
    endDate = new Date(),
    groupBy = 'hour'
  } = options;

  const dateFormat = {
    hour: '%Y-%m-%d %H:00',
    day: '%Y-%m-%d',
    week: '%Y-W%V',
    month: '%Y-%m'
  };

  const summary = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          time: { $dateToString: { format: dateFormat[groupBy], date: '$timestamp' } },
          activityType: '$activityType'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failureCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
        }
      }
    },
    {
      $group: {
        _id: '$_id.time',
        activities: {
          $push: {
            type: '$_id.activityType',
            count: '$count',
            avgDuration: '$avgDuration',
            successRate: {
              $multiply: [
                { $divide: ['$successCount', '$count'] },
                100
              ]
            }
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return summary;
};

userActivitySchema.statics.getResourceAccessPattern = async function(userId, resourceType) {
  const pattern = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        resource: resourceType,
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          dayOfWeek: { $dayOfWeek: '$timestamp' },
          hour: { $hour: '$timestamp' }
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }
    },
    {
      $group: {
        _id: '$_id.action',
        accessPatterns: {
          $push: {
            dayOfWeek: '$_id.dayOfWeek',
            hour: '$_id.hour',
            frequency: '$count',
            avgDuration: '$avgDuration'
          }
        },
        totalAccess: { $sum: '$count' }
      }
    },
    { $sort: { totalAccess: -1 } }
  ]);

  return pattern;
};

userActivitySchema.statics.getAnomalousActivities = async function(organizationId, options = {}) {
  const {
    riskThreshold = 70,
    limit = 100,
    includeArchived = false
  } = options;

  const query = {
    organizationId,
    $or: [
      { riskScore: { $gte: riskThreshold } },
      { securityFlags: { $exists: true, $ne: [] } },
      { impact: { $in: ['high', 'critical'] } }
    ]
  };

  if (!includeArchived) {
    query.isArchived = false;
  }

  const activities = await this.find(query)
    .populate('userId', 'username email profile.fullName')
    .sort({ timestamp: -1 })
    .limit(limit);

  return activities;
};

userActivitySchema.statics.generateActivityReport = async function(filters = {}) {
  const {
    organizationId,
    userId,
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    activityTypes,
    minRiskScore
  } = filters;

  const match = {
    timestamp: { $gte: startDate, $lte: endDate }
  };

  if (organizationId) match.organizationId = organizationId;
  if (userId) match.userId = userId;
  if (activityTypes) match.activityType = { $in: activityTypes };
  if (minRiskScore) match.riskScore = { $gte: minRiskScore };

  const report = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalActivities: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' },
              avgRiskScore: { $avg: '$riskScore' },
              highRiskCount: {
                $sum: { $cond: [{ $gte: ['$riskScore', 70] }, 1, 0] }
              },
              failureRate: {
                $avg: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
              }
            }
          },
          {
            $project: {
              _id: 0,
              totalActivities: 1,
              uniqueUserCount: { $size: '$uniqueUsers' },
              avgRiskScore: { $round: ['$avgRiskScore', 2] },
              highRiskCount: 1,
              failureRate: { $multiply: ['$failureRate', 100] }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$activityType',
              count: { $sum: 1 },
              avgDuration: { $avg: '$duration' },
              failureCount: {
                $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
              }
            }
          },
          { $sort: { count: -1 } }
        ],
        byResource: [
          {
            $group: {
              _id: '$resource',
              count: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' },
              actions: { $addToSet: '$action' }
            }
          },
          {
            $project: {
              resource: '$_id',
              accessCount: '$count',
              userCount: { $size: '$uniqueUsers' },
              actionCount: { $size: '$actions' }
            }
          },
          { $sort: { accessCount: -1 } },
          { $limit: 10 }
        ],
        securityEvents: [
          {
            $match: {
              $or: [
                { riskScore: { $gte: 70 } },
                { securityFlags: { $exists: true, $ne: [] } }
              ]
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              flags: { $push: '$securityFlags' }
            }
          }
        ],
        timeline: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              count: { $sum: 1 },
              avgRiskScore: { $avg: '$riskScore' }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ]);

  return report[0];
};

userActivitySchema.statics.cleanupOldActivities = async function(retentionDays = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  
  // Archive activities that need longer retention
  const toArchive = await this.find({
    timestamp: { $lt: cutoffDate },
    isArchived: false,
    'compliance.requiresAudit': true
  });

  let archived = 0;
  for (const activity of toArchive) {
    await activity.archive();
    archived++;
  }

  // Delete activities that don't need retention
  const deleteResult = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
    isArchived: false,
    'compliance.requiresAudit': { $ne: true }
  });

  logger.info('Cleaned up old activities', {
    archived,
    deleted: deleteResult.deletedCount,
    retentionDays
  });

  return {
    archived,
    deleted: deleteResult.deletedCount
  };
};

// Create and export model
const UserActivityModel = BaseModel.createModel('UserActivity', userActivitySchema);

module.exports = UserActivityModel;