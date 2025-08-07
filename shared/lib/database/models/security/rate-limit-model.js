'use strict';

/**
 * @fileoverview Rate limit model for tracking rate limiting violations and data
 * @module shared/lib/database/models/rate-limit-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');

/**
 * Rate limit schema definition
 */
const rateLimitSchemaDefinition = {
  // ==================== Core Identity ====================
  key: {
    type: String,
    required: true,
    index: true,
    trim: true,
    maxlength: 500
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // ==================== Request Information ====================
  request: {
    ip: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(value) {
          // Basic IP validation (IPv4 and IPv6)
          const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
          return ipv4Regex.test(value) || ipv6Regex.test(value) || value === '::1' || value === 'localhost';
        },
        message: 'Invalid IP address format'
      }
    },
    userAgent: String,
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      index: true
    },
    path: {
      type: String,
      index: true
    },
    endpoint: String
  },

  // ==================== User Information ====================
  user: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    email: {
      type: String,
      validate: {
        validator: function(value) {
          return !value || validators.isEmail(value);
        },
        message: 'Invalid email address'
      }
    },
    role: String,
    permissions: [String]
  },

  // ==================== Rate Limit Configuration ====================
  config: {
    strategy: {
      type: String,
      enum: ['ip', 'user', 'apiKey', 'endpoint', 'tenant', 'combined', 'custom', 'cost-based', 'adaptive'],
      required: true,
      index: true
    },
    windowMs: {
      type: Number,
      required: true,
      min: 1000 // Minimum 1 second
    },
    limit: {
      type: Number,
      required: true,
      min: 1
    },
    algorithm: {
      type: String,
      enum: ['fixed_window', 'sliding_window', 'token_bucket', 'leaky_bucket', 'adaptive'],
      default: 'fixed_window'
    }
  },

  // ==================== Violation Details ====================
  violation: {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    count: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    current: {
      type: Number,
      required: true,
      min: 1
    },
    exceeded: {
      type: Boolean,
      required: true,
      default: true
    },
    burstDetected: {
      type: Boolean,
      default: false
    },
    consecutiveViolations: {
      type: Number,
      default: 1,
      min: 1
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  },

  // ==================== Cost-Based Limiting ====================
  cost: {
    requestCost: {
      type: Number,
      min: 0
    },
    totalCost: {
      type: Number,
      min: 0
    },
    budget: {
      type: Number,
      min: 0
    },
    operation: String,
    complexity: {
      type: String,
      enum: ['low', 'medium', 'high', 'very_high']
    }
  },

  // ==================== Geographical Information ====================
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // ==================== Response Information ====================
  response: {
    statusCode: {
      type: Number,
      required: true,
      default: 429
    },
    message: String,
    resetTime: Date,
    retryAfter: Number,
    headers: {
      type: Map,
      of: String
    }
  },

  // ==================== System Information ====================
  system: {
    serverInstance: String,
    processId: Number,
    memoryUsage: Number,
    cpuUsage: Number,
    systemLoad: Number,
    responseTime: Number
  },

  // ==================== Actions Taken ====================
  actions: {
    blocked: {
      type: Boolean,
      default: true
    },
    blacklisted: {
      type: Boolean,
      default: false
    },
    blacklistDuration: Number,
    alertSent: {
      type: Boolean,
      default: false
    },
    alertLevel: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical']
    },
    throttled: {
      type: Boolean,
      default: false
    },
    escalated: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Pattern Analysis ====================
  patterns: {
    suspicious: {
      type: Boolean,
      default: false
    },
    patternType: {
      type: String,
      enum: ['burst', 'gradual', 'sustained', 'distributed', 'coordinated']
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    indicators: [String],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },

  // ==================== Session Information ====================
  session: {
    sessionId: String,
    apiKey: String,
    tokenHash: String,
    authMethod: {
      type: String,
      enum: ['session', 'api_key', 'jwt', 'oauth', 'basic_auth', 'none']
    },
    authenticated: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Metadata ====================
  metadata: {
    correlationId: String,
    requestId: String,
    traceId: String,
    tags: [String],
    notes: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    source: {
      type: String,
      enum: ['middleware', 'api', 'manual', 'automated'],
      default: 'middleware'
    }
  },

  // ==================== Expiration ====================
  expiration: {
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }
    },
    retentionPeriod: {
      type: Number,
      default: 86400000 // 24 hours in milliseconds
    }
  }
};

// Create schema
const rateLimitSchema = BaseModel.createSchema(rateLimitSchemaDefinition, {
  collection: 'rate_limits',
  timestamps: true
});

// ==================== Indexes ====================
rateLimitSchema.index({ key: 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'request.ip': 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'user.userId': 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ tenantId: 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'config.strategy': 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'violation.severity': 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'actions.blacklisted': 1, 'violation.timestamp': -1 });
rateLimitSchema.index({ 'patterns.suspicious': 1, 'patterns.riskScore': -1 });
rateLimitSchema.index({ 'violation.timestamp': -1 });

// Compound indexes for common queries
rateLimitSchema.index({ 
  'request.ip': 1, 
  'config.strategy': 1, 
  'violation.timestamp': -1 
});

rateLimitSchema.index({ 
  tenantId: 1, 
  'config.strategy': 1, 
  'violation.timestamp': -1 
});

// TTL index for automatic cleanup
rateLimitSchema.index({ 
  'expiration.expiresAt': 1 
}, { 
  expireAfterSeconds: 0 
});

// ==================== Virtual Fields ====================
rateLimitSchema.virtual('isRecent').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.violation.timestamp > fiveMinutesAgo;
});

rateLimitSchema.virtual('isHighRisk').get(function() {
  return this.patterns.riskScore > 70 || 
         this.violation.severity === 'critical' ||
         this.violation.consecutiveViolations > 5;
});

rateLimitSchema.virtual('shouldEscalate').get(function() {
  return this.violation.consecutiveViolations > 10 ||
         this.patterns.riskScore > 85 ||
         (this.violation.severity === 'critical' && this.violation.count > 3);
});

rateLimitSchema.virtual('formattedTimestamp').get(function() {
  return this.violation.timestamp.toISOString();
});

// ==================== Pre-save Middleware ====================
rateLimitSchema.pre('save', function(next) {
  try {
    // Set expiration if not provided
    if (!this.expiration.expiresAt) {
      const expirationMs = this.expiration.retentionPeriod || 86400000; // 24 hours default
      this.expiration.expiresAt = new Date(Date.now() + expirationMs);
    }

    // Calculate risk score if not set
    if (!this.patterns.riskScore) {
      this.patterns.riskScore = this.calculateRiskScore();
    }

    // Set severity based on violation count and pattern
    if (!this.violation.severity || this.isModified('violation.count')) {
      this.violation.severity = this.calculateSeverity();
    }

    // Set pattern analysis
    if (this.violation.consecutiveViolations > 1) {
      this.analyzePatterns();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
rateLimitSchema.methods.calculateRiskScore = function() {
  let score = 0;

  // Base score from violation count
  score += Math.min(this.violation.count * 5, 30);

  // Consecutive violations penalty
  score += Math.min(this.violation.consecutiveViolations * 8, 40);

  // Burst detection penalty
  if (this.violation.burstDetected) {
    score += 20;
  }

  // High request rate penalty
  if (this.violation.current > this.config.limit * 2) {
    score += 15;
  }

  // Suspicious patterns penalty
  if (this.patterns.suspicious) {
    score += 25;
  }

  // Time-based scoring (recent violations are worse)
  const hoursAgo = (Date.now() - this.violation.timestamp.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) {
    score += 10;
  } else if (hoursAgo < 6) {
    score += 5;
  }

  return Math.min(score, 100);
};

rateLimitSchema.methods.calculateSeverity = function() {
  const riskScore = this.patterns.riskScore || this.calculateRiskScore();
  
  if (riskScore >= 85 || this.violation.consecutiveViolations > 15) {
    return 'critical';
  } else if (riskScore >= 60 || this.violation.consecutiveViolations > 8) {
    return 'high';
  } else if (riskScore >= 30 || this.violation.consecutiveViolations > 3) {
    return 'medium';
  } else {
    return 'low';
  }
};

rateLimitSchema.methods.analyzePatterns = function() {
  // Burst pattern detection
  if (this.violation.burstDetected || this.violation.count > this.config.limit * 3) {
    this.patterns.patternType = 'burst';
    this.patterns.suspicious = true;
    this.patterns.indicators.push('burst_detected');
  }

  // Sustained attack pattern
  if (this.violation.consecutiveViolations > 10) {
    this.patterns.patternType = 'sustained';
    this.patterns.suspicious = true;
    this.patterns.indicators.push('sustained_violations');
  }

  // High confidence if multiple indicators
  if (this.patterns.indicators.length > 2) {
    this.patterns.confidence = 0.9;
  } else if (this.patterns.indicators.length > 1) {
    this.patterns.confidence = 0.7;
  } else {
    this.patterns.confidence = 0.5;
  }
};

rateLimitSchema.methods.escalate = async function(reason, userId) {
  this.actions.escalated = true;
  this.actions.alertLevel = 'critical';
  
  // Add escalation note
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }
  
  this.metadata.notes.push(`Escalated: ${reason} by ${userId} at ${new Date().toISOString()}`);
  
  await this.save();
  
  logger.warn('Rate limit violation escalated', {
    rateLimitId: this._id,
    key: this.key,
    ip: this.request.ip,
    reason,
    riskScore: this.patterns.riskScore
  });
  
  return this;
};

rateLimitSchema.methods.addToBlacklist = async function(duration) {
  this.actions.blacklisted = true;
  this.actions.blacklistDuration = duration || 86400000; // 24 hours default
  
  await this.save();
  
  logger.warn('IP/User blacklisted due to rate limit violations', {
    rateLimitId: this._id,
    key: this.key,
    ip: this.request.ip,
    userId: this.user.userId,
    duration
  });
  
  return this;
};

rateLimitSchema.methods.sendAlert = async function(notificationService) {
  if (this.actions.alertSent) {
    return; // Already sent
  }
  
  this.actions.alertSent = true;
  this.actions.alertLevel = this.violation.severity;
  
  const alertData = {
    type: 'rate_limit_violation',
    severity: this.violation.severity,
    title: `Rate Limit Violation - ${this.violation.severity.toUpperCase()}`,
    message: `Multiple violations detected for ${this.config.strategy} strategy`,
    metadata: {
      key: this.key,
      ip: this.request.ip,
      count: this.violation.count,
      consecutiveViolations: this.violation.consecutiveViolations,
      riskScore: this.patterns.riskScore,
      timestamp: this.violation.timestamp
    }
  };
  
  try {
    if (notificationService) {
      await notificationService.sendNotification(alertData);
    }
    
    await this.save();
    
    logger.info('Rate limit alert sent', {
      rateLimitId: this._id,
      alertLevel: this.actions.alertLevel
    });
  } catch (error) {
    logger.error('Failed to send rate limit alert', {
      error: error.message,
      rateLimitId: this._id
    });
  }
  
  return this;
};

// ==================== Static Methods ====================
rateLimitSchema.statics.recordViolation = async function(violationData) {
  const {
    key,
    ip,
    userId,
    strategy,
    windowMs,
    limit,
    current,
    config = {}
  } = violationData;

  // Check for recent violations from same source
  const recentViolation = await this.findOne({
    key,
    'violation.timestamp': {
      $gte: new Date(Date.now() - 60000) // Last minute
    }
  }).sort({ 'violation.timestamp': -1 });

  let consecutiveViolations = 1;
  if (recentViolation) {
    consecutiveViolations = recentViolation.violation.consecutiveViolations + 1;
  }

  const violation = new this({
    key,
    request: {
      ip,
      method: config.method,
      path: config.path,
      userAgent: config.userAgent
    },
    user: {
      userId
    },
    config: {
      strategy,
      windowMs,
      limit,
      algorithm: config.algorithm || 'fixed_window'
    },
    violation: {
      timestamp: new Date(),
      count: current,
      current,
      exceeded: true,
      consecutiveViolations,
      burstDetected: config.burstDetected || false
    },
    cost: config.cost || {},
    response: {
      statusCode: 429,
      message: config.message || 'Rate limit exceeded',
      resetTime: config.resetTime,
      retryAfter: config.retryAfter
    },
    metadata: {
      correlationId: config.correlationId,
      requestId: config.requestId,
      source: 'middleware'
    }
  });

  await violation.save();
  
  logger.info('Rate limit violation recorded', {
    rateLimitId: violation._id,
    key,
    consecutiveViolations
  });

  return violation;
};

rateLimitSchema.statics.getViolationsByKey = async function(key, timeRange = 3600000) {
  const since = new Date(Date.now() - timeRange);
  
  return await this.find({
    key,
    'violation.timestamp': { $gte: since }
  })
  .sort({ 'violation.timestamp': -1 })
  .limit(100);
};

rateLimitSchema.statics.getViolationsByIP = async function(ip, timeRange = 3600000) {
  const since = new Date(Date.now() - timeRange);
  
  return await this.find({
    'request.ip': ip,
    'violation.timestamp': { $gte: since }
  })
  .sort({ 'violation.timestamp': -1 })
  .limit(100);
};

rateLimitSchema.statics.getHighRiskViolations = async function(options = {}) {
  const query = {
    $or: [
      { 'patterns.riskScore': { $gte: options.minRiskScore || 70 } },
      { 'violation.severity': { $in: ['high', 'critical'] } },
      { 'violation.consecutiveViolations': { $gte: options.minConsecutive || 5 } }
    ]
  };

  if (options.timeRange) {
    query['violation.timestamp'] = {
      $gte: new Date(Date.now() - options.timeRange)
    };
  }

  if (options.tenantId) {
    query.tenantId = options.tenantId;
  }

  return await this.find(query)
    .sort({ 'patterns.riskScore': -1, 'violation.timestamp': -1 })
    .limit(options.limit || 50);
};

rateLimitSchema.statics.getViolationMetrics = async function(filters = {}) {
  const match = {};

  if (filters.tenantId) {
    match.tenantId = filters.tenantId;
  }

  if (filters.timeRange) {
    match['violation.timestamp'] = {
      $gte: new Date(Date.now() - filters.timeRange)
    };
  }

  const metrics = await this.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalViolations: { $sum: 1 },
              uniqueIPs: { $addToSet: '$request.ip' },
              uniqueUsers: { $addToSet: '$user.userId' },
              avgRiskScore: { $avg: '$patterns.riskScore' },
              criticalCount: {
                $sum: { $cond: [{ $eq: ['$violation.severity', 'critical'] }, 1, 0] }
              },
              highCount: {
                $sum: { $cond: [{ $eq: ['$violation.severity', 'high'] }, 1, 0] }
              }
            }
          }
        ],
        byStrategy: [
          {
            $group: {
              _id: '$config.strategy',
              count: { $sum: 1 },
              avgRiskScore: { $avg: '$patterns.riskScore' }
            }
          }
        ],
        byHour: [
          {
            $group: {
              _id: {
                hour: { $hour: '$violation.timestamp' },
                date: { $dateToString: { format: '%Y-%m-%d', date: '$violation.timestamp' } }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.date': -1, '_id.hour': -1 } },
          { $limit: 24 }
        ],
        topIPs: [
          {
            $group: {
              _id: '$request.ip',
              count: { $sum: 1 },
              maxRiskScore: { $max: '$patterns.riskScore' },
              lastViolation: { $max: '$violation.timestamp' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);

  const result = metrics[0];
  const summary = result.summary[0] || {};

  return {
    summary: {
      totalViolations: summary.totalViolations || 0,
      uniqueIPs: summary.uniqueIPs ? summary.uniqueIPs.length : 0,
      uniqueUsers: summary.uniqueUsers ? summary.uniqueUsers.filter(u => u).length : 0,
      avgRiskScore: Math.round((summary.avgRiskScore || 0) * 100) / 100,
      criticalCount: summary.criticalCount || 0,
      highCount: summary.highCount || 0
    },
    byStrategy: result.byStrategy,
    byHour: result.byHour.reverse(),
    topIPs: result.topIPs
  };
};

rateLimitSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    'expiration.expiresAt': { $lt: new Date() }
  });

  logger.info('Cleaned up expired rate limit records', {
    deletedCount: result.deletedCount
  });

  return result;
};

rateLimitSchema.statics.findSuspiciousPatterns = async function(options = {}) {
  const timeRange = options.timeRange || 3600000; // 1 hour
  const minViolations = options.minViolations || 5;

  const suspiciousIPs = await this.aggregate([
    {
      $match: {
        'violation.timestamp': { $gte: new Date(Date.now() - timeRange) }
      }
    },
    {
      $group: {
        _id: '$request.ip',
        violationCount: { $sum: 1 },
        strategies: { $addToSet: '$config.strategy' },
        avgRiskScore: { $avg: '$patterns.riskScore' },
        maxConsecutive: { $max: '$violation.consecutiveViolations' },
        lastViolation: { $max: '$violation.timestamp' }
      }
    },
    {
      $match: {
        $or: [
          { violationCount: { $gte: minViolations } },
          { avgRiskScore: { $gte: 70 } },
          { maxConsecutive: { $gte: 5 } }
        ]
      }
    },
    { $sort: { violationCount: -1, avgRiskScore: -1 } },
    { $limit: options.limit || 20 }
  ]);

  return suspiciousIPs;
};

// Create and export model
const RateLimitModel = BaseModel.createModel('RateLimit', rateLimitSchema);

module.exports = RateLimitModel;