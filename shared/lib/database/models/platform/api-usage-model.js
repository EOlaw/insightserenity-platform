'use strict';

/**
 * @fileoverview API usage tracking model for rate limiting, billing, and monitoring
 * @module shared/lib/database/models/platform/api-usage-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/analytics-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const dateHelper = require('../../../utils/helpers/date-helper');
const statusCodes = require('../../../utils/constants/status-codes');
const auditService = require('../../../security/audit/audit-service');
const analyticsService = require('../../../services/analytics-service');

/**
 * API usage schema definition for tracking and monitoring API calls
 */
const apiUsageSchemaDefinition = {
  // ==================== Multi-tenancy ====================
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

  // ==================== User & App Identification ====================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  apiKeyId: {
    type: String,
    index: true
  },

  clientAppId: {
    type: String,
    index: true
  },

  sessionId: {
    type: String,
    index: true
  },

  // ==================== Request Details ====================
  endpoint: {
    type: String,
    required: true,
    index: true
  },

  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    uppercase: true
  },

  resource: {
    type: String,
    required: true
  },

  version: {
    type: String,
    default: 'v1'
  },

  // ==================== Usage Metrics ====================
  count: {
    type: Number,
    default: 1,
    min: 0
  },

  responseTime: {
    type: Number,
    min: 0
  },

  requestSize: {
    type: Number,
    min: 0
  },

  responseSize: {
    type: Number,
    min: 0
  },

  statusCode: {
    type: Number,
    required: true
  },

  errorCode: String,

  // ==================== Time Window ====================
  timestampWindow: {
    type: Date,
    required: true,
    index: true
  },

  windowType: {
    type: String,
    enum: ['minute', 'hour', 'day', 'month'],
    default: 'hour'
  },

  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // ==================== Location & Device ====================
  ipAddress: {
    type: String,
    required: true,
    index: true
  },

  userAgent: String,

  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number
  },

  device: {
    type: String,
    os: String,
    browser: String,
    isMobile: Boolean
  },

  // ==================== Rate Limiting ====================
  rateLimiting: {
    applied: {
      type: Boolean,
      default: false
    },
    tier: String,
    limit: Number,
    remaining: Number,
    resetAt: Date,
    exceeded: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Billing & Cost ====================
  billing: {
    billable: {
      type: Boolean,
      default: true
    },
    cost: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    tier: String,
    overage: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Performance Metrics ====================
  performance: {
    cacheHit: {
      type: Boolean,
      default: false
    },
    cdnServed: {
      type: Boolean,
      default: false
    },
    serverRegion: String,
    latency: {
      dns: Number,
      tcp: Number,
      tls: Number,
      server: Number,
      transfer: Number,
      total: Number
    }
  },

  // ==================== Security & Compliance ====================
  security: {
    authenticated: {
      type: Boolean,
      default: true
    },
    authMethod: {
      type: String,
      enum: ['api_key', 'jwt', 'oauth', 'basic', 'session', 'none']
    },
    tlsVersion: String,
    blocked: {
      type: Boolean,
      default: false
    },
    blockReason: String,
    suspicious: {
      type: Boolean,
      default: false
    },
    threatScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },

  // ==================== Error Tracking ====================
  error: {
    occurred: {
      type: Boolean,
      default: false
    },
    type: String,
    message: String,
    stack: String,
    retryable: Boolean,
    userMessage: String
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    correlationId: String,
    parentRequestId: String,
    spanId: String,
    traceId: String
  },

  // ==================== Analytics ====================
  analytics: {
    processed: {
      type: Boolean,
      default: false
    },
    processedAt: Date,
    anomalyDetected: {
      type: Boolean,
      default: false
    },
    anomalyType: String,
    aggregated: {
      type: Boolean,
      default: false
    }
  }
};

// Create schema
const apiUsageSchema = BaseModel.createSchema(apiUsageSchemaDefinition, {
  collection: 'api_usage',
  timestamps: true,
  versionKey: false
});

// ==================== Indexes ====================
apiUsageSchema.index({ tenantId: 1, organizationId: 1, timestampWindow: -1 });
apiUsageSchema.index({ userId: 1, endpoint: 1, timestampWindow: -1 });
apiUsageSchema.index({ organizationId: 1, endpoint: 1, method: 1, timestampWindow: -1 });
apiUsageSchema.index({ ipAddress: 1, timestampWindow: -1 });
apiUsageSchema.index({ 'rateLimiting.exceeded': 1, timestampWindow: -1 });
apiUsageSchema.index({ 'billing.overage': 1, organizationId: 1 });
apiUsageSchema.index({ 'security.blocked': 1, 'security.suspicious': 1 });
apiUsageSchema.index({ 'error.occurred': 1, endpoint: 1 });
apiUsageSchema.index({ requestedAt: -1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

// ==================== Virtual Fields ====================
apiUsageSchema.virtual('isSuccessful').get(function() {
  return this.statusCode >= 200 && this.statusCode < 300;
});

apiUsageSchema.virtual('isClientError').get(function() {
  return this.statusCode >= 400 && this.statusCode < 500;
});

apiUsageSchema.virtual('isServerError').get(function() {
  return this.statusCode >= 500;
});

apiUsageSchema.virtual('totalDataTransfer').get(function() {
  return (this.requestSize || 0) + (this.responseSize || 0);
});

apiUsageSchema.virtual('costInCents').get(function() {
  return Math.round(this.billing.cost * 100);
});

// ==================== Pre-save Middleware ====================
apiUsageSchema.pre('save', async function(next) {
  try {
    // Set time window based on type
    if (!this.timestampWindow) {
      this.timestampWindow = dateHelper.getTimeWindow(this.requestedAt, this.windowType);
    }

    // Calculate billing cost if not set
    if (this.billing.billable && !this.billing.cost) {
      this.billing.cost = await this.calculateCost();
    }

    // Check for anomalies
    if (!this.analytics.anomalyDetected) {
      await this.detectAnomalies();
    }

    // Set error flag
    if (this.statusCode >= 400 || this.error.message) {
      this.error.occurred = true;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
apiUsageSchema.post('save', async function(doc) {
  try {
    // Emit events for monitoring
    if (doc.rateLimiting.exceeded) {
      await auditService.logSecurityEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        tenantId: doc.tenantId,
        organizationId: doc.organizationId,
        userId: doc.userId,
        details: {
          endpoint: doc.endpoint,
          ipAddress: doc.ipAddress,
          limit: doc.rateLimiting.limit
        }
      });
    }

    if (doc.security.blocked || doc.security.suspicious) {
      await auditService.logSecurityEvent({
        eventType: 'SUSPICIOUS_API_ACTIVITY',
        tenantId: doc.tenantId,
        organizationId: doc.organizationId,
        details: {
          endpoint: doc.endpoint,
          ipAddress: doc.ipAddress,
          threatScore: doc.security.threatScore,
          blocked: doc.security.blocked,
          reason: doc.security.blockReason
        }
      });
    }

    // Update analytics
    if (!doc.analytics.processed) {
      await analyticsService.processApiUsage(doc);
    }
  } catch (error) {
    logger.error('Error in API usage post-save hook', {
      error: error.message,
      documentId: doc._id
    });
  }
});

// ==================== Instance Methods ====================
apiUsageSchema.methods.calculateCost = async function() {
  // Base cost per 1000 requests
  const baseCostPer1k = 0.01; // $0.01 per 1000 requests
  
  // Additional costs based on features
  let cost = baseCostPer1k / 1000;
  
  // Data transfer cost (per GB)
  const dataTransferCostPerGB = 0.09; // $0.09 per GB
  const dataTransferGB = this.totalDataTransfer / (1024 * 1024 * 1024);
  cost += dataTransferGB * dataTransferCostPerGB;
  
  // Premium endpoint multiplier
  const premiumEndpoints = ['/api/v1/analytics', '/api/v1/ml', '/api/v1/reports'];
  if (premiumEndpoints.some(ep => this.endpoint.startsWith(ep))) {
    cost *= 2;
  }
  
  // Overage charges
  if (this.billing.overage) {
    cost *= 1.5;
  }
  
  return cost;
};

apiUsageSchema.methods.detectAnomalies = async function() {
  const anomalies = [];
  
  // Check for unusual response times
  if (this.responseTime > 5000) {
    anomalies.push('high_response_time');
  }
  
  // Check for large data transfers
  if (this.totalDataTransfer > 100 * 1024 * 1024) { // 100MB
    anomalies.push('large_data_transfer');
  }
  
  // Check for high error rates
  if (this.error.occurred && this.count > 10) {
    anomalies.push('high_error_rate');
  }
  
  // Check for suspicious patterns
  if (this.count > 1000 && this.windowType === 'minute') {
    anomalies.push('excessive_requests');
    this.security.suspicious = true;
  }
  
  if (anomalies.length > 0) {
    this.analytics.anomalyDetected = true;
    this.analytics.anomalyType = anomalies.join(',');
  }
  
  return anomalies;
};

apiUsageSchema.methods.applyRateLimit = async function(limits) {
  const currentUsage = await this.constructor.getCurrentUsage(
    this.organizationId,
    this.endpoint,
    this.windowType
  );
  
  this.rateLimiting.applied = true;
  this.rateLimiting.limit = limits.limit;
  this.rateLimiting.remaining = Math.max(0, limits.limit - currentUsage);
  this.rateLimiting.resetAt = dateHelper.getNextWindow(this.timestampWindow, this.windowType);
  
  if (currentUsage >= limits.limit) {
    this.rateLimiting.exceeded = true;
    this.statusCode = 429;
    this.error.occurred = true;
    this.error.type = 'RateLimitExceeded';
    this.error.message = 'API rate limit exceeded';
  }
  
  return this.rateLimiting;
};

// ==================== Static Methods ====================
apiUsageSchema.statics.trackUsage = async function(usageData) {
  const usage = new this(usageData);
  
  // Apply rate limiting if configured
  if (usageData.rateLimits) {
    await usage.applyRateLimit(usageData.rateLimits);
  }
  
  await usage.save();
  
  logger.info('API usage tracked', {
    endpoint: usage.endpoint,
    method: usage.method,
    organizationId: usage.organizationId,
    statusCode: usage.statusCode
  });
  
  return usage;
};

apiUsageSchema.statics.getCurrentUsage = async function(organizationId, endpoint, windowType = 'hour') {
  const window = dateHelper.getTimeWindow(new Date(), windowType);
  
  const result = await this.aggregate([
    {
      $match: {
        organizationId,
        endpoint,
        timestampWindow: window,
        windowType
      }
    },
    {
      $group: {
        _id: null,
        totalCount: { $sum: '$count' }
      }
    }
  ]);
  
  return result[0]?.totalCount || 0;
};

apiUsageSchema.statics.getUsageStatistics = async function(filters = {}) {
  const {
    tenantId,
    organizationId,
    userId,
    startDate,
    endDate,
    endpoint,
    groupBy = 'hour'
  } = filters;
  
  const match = {};
  if (tenantId) match.tenantId = tenantId;
  if (organizationId) match.organizationId = organizationId;
  if (userId) match.userId = userId;
  if (endpoint) match.endpoint = new RegExp(endpoint, 'i');
  if (startDate || endDate) {
    match.requestedAt = {};
    if (startDate) match.requestedAt.$gte = startDate;
    if (endDate) match.requestedAt.$lte = endDate;
  }
  
  const dateFormat = {
    minute: '%Y-%m-%d %H:%M',
    hour: '%Y-%m-%d %H:00',
    day: '%Y-%m-%d',
    month: '%Y-%m'
  }[groupBy] || '%Y-%m-%d %H:00';
  
  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          time: { $dateToString: { format: dateFormat, date: '$requestedAt' } },
          endpoint: '$endpoint',
          method: '$method'
        },
        count: { $sum: '$count' },
        totalRequests: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        totalDataTransfer: { $sum: { $add: ['$requestSize', '$responseSize'] } },
        totalCost: { $sum: '$billing.cost' },
        errors: { $sum: { $cond: ['$error.occurred', 1, 0] } },
        successRate: {
          $avg: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] }
        }
      }
    },
    { $sort: { '_id.time': -1 } }
  ];
  
  const stats = await this.aggregate(pipeline);
  
  // Calculate summary
  const summary = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: '$count' },
        uniqueEndpoints: { $addToSet: '$endpoint' },
        uniqueUsers: { $addToSet: '$userId' },
        totalCost: { $sum: '$billing.cost' },
        avgResponseTime: { $avg: '$responseTime' },
        errorRate: { $avg: { $cond: ['$error.occurred', 1, 0] } }
      }
    }
  ]);
  
  return {
    statistics: stats,
    summary: summary[0] || {},
    period: { startDate, endDate, groupBy }
  };
};

apiUsageSchema.statics.getTopEndpoints = async function(organizationId, limit = 10, period = 'day') {
  const startDate = dateHelper.subtractPeriod(new Date(), 1, period);
  
  const topEndpoints = await this.aggregate([
    {
      $match: {
        organizationId,
        requestedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          endpoint: '$endpoint',
          method: '$method'
        },
        count: { $sum: '$count' },
        avgResponseTime: { $avg: '$responseTime' },
        errorRate: { $avg: { $cond: ['$error.occurred', 1, 0] } },
        totalCost: { $sum: '$billing.cost' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
  
  return topEndpoints;
};

apiUsageSchema.statics.detectAnomalousUsage = async function(organizationId, threshold = 2) {
  // Get average usage over past 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  
  const historicalAvg = await this.aggregate([
    {
      $match: {
        organizationId,
        requestedAt: { $gte: weekAgo, $lt: today }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$requestedAt' } },
        dailyCount: { $sum: '$count' }
      }
    },
    {
      $group: {
        _id: null,
        avgDailyCount: { $avg: '$dailyCount' },
        stdDev: { $stdDevPop: '$dailyCount' }
      }
    }
  ]);
  
  if (!historicalAvg[0]) return [];
  
  const { avgDailyCount, stdDev } = historicalAvg[0];
  const upperBound = avgDailyCount + (threshold * stdDev);
  
  // Check today's usage
  const todayUsage = await this.aggregate([
    {
      $match: {
        organizationId,
        requestedAt: { $gte: dateHelper.startOfDay(today) }
      }
    },
    {
      $group: {
        _id: null,
        todayCount: { $sum: '$count' }
      }
    }
  ]);
  
  const currentCount = todayUsage[0]?.todayCount || 0;
  
  if (currentCount > upperBound) {
    return [{
      type: 'excessive_usage',
      currentCount,
      expectedMax: upperBound,
      deviation: (currentCount - avgDailyCount) / stdDev
    }];
  }
  
  return [];
};

apiUsageSchema.statics.cleanupOldRecords = async function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    requestedAt: { $lt: cutoffDate },
    'analytics.aggregated': true
  });
  
  logger.info('Cleaned up old API usage records', {
    deletedCount: result.deletedCount,
    cutoffDate
  });
  
  return result.deletedCount;
};

// Create and export model
const ApiUsageModel = BaseModel.createModel('ApiUsage', apiUsageSchema);

module.exports = {
  schema: apiUsageSchema,
  model: ApiUsageModel
};