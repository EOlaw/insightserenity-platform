'use strict';

/**
 * @fileoverview Usage record model for tracking resource consumption and metered billing
 * @module shared/lib/database/models/billing/usage-record-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const dateHelper = require('../../../utils/helpers/date-helper');

/**
 * Usage record schema definition
 */
const usageRecordSchemaDefinition = {
  // ==================== Core Identity ====================
  recordId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `ur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    index: true
  },

  // ==================== Usage Details ====================
  metric: {
    name: {
      type: String,
      required: true,
      index: true,
      enum: [
        'api_calls',
        'bandwidth',
        'storage',
        'compute_time',
        'users',
        'projects',
        'transactions',
        'emails',
        'sms',
        'data_processed',
        'requests',
        'seats',
        'custom'
      ]
    },
    
    displayName: String,
    
    unit: {
      type: String,
      required: true,
      enum: ['count', 'bytes', 'seconds', 'minutes', 'hours', 'days', 'requests', 'units', 'custom']
    },
    
    customUnit: String,
    
    category: {
      type: String,
      enum: ['infrastructure', 'api', 'communication', 'storage', 'compute', 'platform', 'custom'],
      default: 'platform'
    }
  },

  // ==================== Measurement ====================
  measurement: {
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    
    previousQuantity: {
      type: Number,
      default: 0
    },
    
    delta: {
      type: Number,
      default: function() {
        return this.measurement.quantity - (this.measurement.previousQuantity || 0);
      }
    },
    
    aggregationType: {
      type: String,
      enum: ['sum', 'max', 'last', 'average', 'unique'],
      default: 'sum'
    },
    
    precision: {
      type: Number,
      default: 2,
      min: 0,
      max: 10
    }
  },

  // ==================== Time Period ====================
  period: {
    start: {
      type: Date,
      required: true,
      index: true
    },
    
    end: {
      type: Date,
      required: true,
      index: true
    },
    
    timezone: {
      type: String,
      default: 'UTC'
    },
    
    granularity: {
      type: String,
      enum: ['minute', 'hour', 'day', 'week', 'month', 'billing_period'],
      default: 'hour'
    },
    
    billingPeriod: {
      month: Number,
      year: Number,
      quarter: Number
    }
  },

  // ==================== Source & Context ====================
  source: {
    type: {
      type: String,
      enum: ['api', 'system', 'manual', 'import', 'calculated', 'estimated'],
      default: 'system'
    },
    
    service: String,
    
    endpoint: String,
    
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    apiKeyId: String,
    
    ipAddress: String,
    
    userAgent: String,
    
    requestId: String,
    
    sessionId: String
  },

  // ==================== Resource Information ====================
  resource: {
    type: {
      type: String,
      enum: ['project', 'user', 'api', 'database', 'storage', 'service', 'custom']
    },
    
    id: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'resource.model'
    },
    
    model: {
      type: String,
      enum: ['Project', 'User', 'Organization', 'Service', 'Custom']
    },
    
    name: String,
    
    tags: [String],
    
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Billing Information ====================
  billing: {
    status: {
      type: String,
      enum: ['unbilled', 'billed', 'invoiced', 'disputed', 'waived', 'credited'],
      default: 'unbilled',
      index: true
    },
    
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    
    lineItemId: String,
    
    rate: {
      amount: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        default: 'USD'
      },
      per: Number,
      minimum: Number
    },
    
    cost: {
      calculated: {
        type: Number,
        default: 0
      },
      adjusted: Number,
      final: {
        type: Number,
        default: function() {
          return this.billing.cost.adjusted || this.billing.cost.calculated;
        }
      },
      currency: {
        type: String,
        default: 'USD'
      }
    },
    
    discount: {
      percentage: Number,
      amount: Number,
      reason: String
    },
    
    included: {
      isIncluded: {
        type: Boolean,
        default: false
      },
      allowance: Number,
      remaining: Number
    }
  },

  // ==================== Aggregation & Rollup ====================
  aggregation: {
    isAggregate: {
      type: Boolean,
      default: false
    },
    
    parentRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UsageRecord'
    },
    
    childRecordIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UsageRecord'
    }],
    
    rollupLevel: {
      type: String,
      enum: ['raw', 'hourly', 'daily', 'weekly', 'monthly'],
      default: 'raw'
    },
    
    aggregatedAt: Date,
    
    stats: {
      min: Number,
      max: Number,
      avg: Number,
      sum: Number,
      count: Number,
      p95: Number,
      p99: Number
    }
  },

  // ==================== Limits & Alerts ====================
  limits: {
    threshold: {
      soft: Number,
      hard: Number
    },
    
    exceeded: {
      soft: {
        type: Boolean,
        default: false
      },
      hard: {
        type: Boolean,
        default: false
      },
      at: Date
    },
    
    action: {
      type: String,
      enum: ['none', 'alert', 'throttle', 'block', 'overage'],
      default: 'alert'
    },
    
    alerts: [{
      level: {
        type: String,
        enum: ['info', 'warning', 'critical']
      },
      threshold: Number,
      sentAt: Date,
      method: String
    }]
  },

  // ==================== Validation & Quality ====================
  validation: {
    status: {
      type: String,
      enum: ['pending', 'valid', 'invalid', 'anomaly', 'disputed'],
      default: 'pending'
    },
    
    checks: {
      rangeCheck: {
        passed: Boolean,
        min: Number,
        max: Number
      },
      
      deltaCheck: {
        passed: Boolean,
        maxDelta: Number,
        actualDelta: Number
      },
      
      duplicateCheck: {
        passed: Boolean,
        duplicateId: mongoose.Schema.Types.ObjectId
      }
    },
    
    anomaly: {
      detected: {
        type: Boolean,
        default: false
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      reason: String,
      baseline: {
        value: Number,
        deviation: Number
      }
    },
    
    reviewed: {
      status: Boolean,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      at: Date,
      notes: String
    }
  },

  // ==================== Processing & State ====================
  processing: {
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'retrying'],
      default: 'completed'
    },
    
    attempts: {
      type: Number,
      default: 1
    },
    
    lastAttemptAt: Date,
    
    completedAt: Date,
    
    error: {
      code: String,
      message: String,
      stack: String,
      retryable: Boolean
    },
    
    pipeline: [{
      stage: String,
      status: String,
      startedAt: Date,
      completedAt: Date,
      error: String
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'production'
    },
    
    version: {
      type: String,
      default: '1.0'
    },
    
    externalId: {
      type: String,
      index: true
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
        enum: ['info', 'warning', 'dispute', 'adjustment']
      }
    }]
  },

  // ==================== Audit & Compliance ====================
  audit: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    modifiedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      at: Date,
      action: String
    }],
    
    trail: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      changes: mongoose.Schema.Types.Mixed,
      reason: String
    }]
  },

  compliance: {
    retention: {
      retainUntil: Date,
      policy: String
    },
    
    encryption: {
      required: {
        type: Boolean,
        default: false
      },
      algorithm: String
    },
    
    jurisdiction: String,
    
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    }
  }
};

// Create schema
const usageRecordSchema = BaseModel.createSchema(usageRecordSchemaDefinition, {
  collection: 'usage_records',
  timestamps: true
});

// ==================== Indexes ====================
usageRecordSchema.index({ organizationId: 1, 'metric.name': 1, 'period.start': -1 });
usageRecordSchema.index({ tenantId: 1, 'billing.status': 1 });
usageRecordSchema.index({ subscriptionId: 1, 'period.start': -1 });
usageRecordSchema.index({ 'metric.name': 1, 'period.start': -1, 'period.end': -1 });
usageRecordSchema.index({ 'billing.invoiceId': 1 });
usageRecordSchema.index({ 'resource.type': 1, 'resource.id': 1 });
usageRecordSchema.index({ 'aggregation.parentRecordId': 1 });
usageRecordSchema.index({ 'validation.status': 1, 'billing.status': 1 });
usageRecordSchema.index({ 'metadata.externalId': 1 });

// Compound index for efficient usage queries
usageRecordSchema.index({
  organizationId: 1,
  'metric.name': 1,
  'period.start': -1,
  'billing.status': 1
});

// ==================== Virtual Fields ====================
usageRecordSchema.virtual('duration').get(function() {
  return this.period.end - this.period.start;
});

usageRecordSchema.virtual('durationHours').get(function() {
  return (this.period.end - this.period.start) / (1000 * 60 * 60);
});

usageRecordSchema.virtual('isBillable').get(function() {
  return this.billing.status === 'unbilled' && 
         this.validation.status === 'valid' &&
         !this.billing.included.isIncluded;
});

usageRecordSchema.virtual('isOverLimit').get(function() {
  return this.limits.exceeded.soft || this.limits.exceeded.hard;
});

usageRecordSchema.virtual('effectiveCost').get(function() {
  return this.billing.cost.final || 0;
});

usageRecordSchema.virtual('hasAnomaly').get(function() {
  return this.validation.anomaly.detected || this.validation.status === 'anomaly';
});

// ==================== Pre-save Middleware ====================
usageRecordSchema.pre('save', async function(next) {
  try {
    // Calculate delta if not set
    if (this.isModified('measurement.quantity') && !this.isModified('measurement.delta')) {
      this.measurement.delta = this.measurement.quantity - (this.measurement.previousQuantity || 0);
    }

    // Set billing period
    if (!this.period.billingPeriod && this.period.start) {
      const startDate = new Date(this.period.start);
      this.period.billingPeriod = {
        month: startDate.getMonth() + 1,
        year: startDate.getFullYear(),
        quarter: Math.floor(startDate.getMonth() / 3) + 1
      };
    }

    // Calculate cost if rate is provided
    if (this.billing.rate && this.billing.rate.amount && !this.billing.cost.calculated) {
      this.calculateCost();
    }

    // Check limits
    if (this.limits.threshold && this.isModified('measurement.quantity')) {
      this.checkLimits();
    }

    // Run validation checks
    if (this.isNew || this.isModified('measurement')) {
      await this.runValidation();
    }

    // Update processing status
    if (this.isModified('processing.status') && this.processing.status === 'completed') {
      this.processing.completedAt = new Date();
    }

    // Add to audit trail
    if (!this.isNew && this.isModified()) {
      if (!this.audit.trail) {
        this.audit.trail = [];
      }
      
      this.audit.trail.push({
        action: 'update',
        performedAt: new Date(),
        changes: {
          modifiedFields: this.modifiedPaths()
        }
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
usageRecordSchema.methods.calculateCost = function() {
  const { quantity } = this.measurement;
  const { rate, included } = this.billing;
  
  if (!rate || !rate.amount) {
    this.billing.cost.calculated = 0;
    return;
  }

  let billableQuantity = quantity;
  
  // Apply included allowance
  if (included.isIncluded && included.allowance) {
    billableQuantity = Math.max(0, quantity - included.allowance);
    included.remaining = Math.max(0, included.allowance - quantity);
  }

  // Calculate base cost
  const per = rate.per || 1;
  let cost = (billableQuantity / per) * rate.amount;
  
  // Apply minimum charge
  if (rate.minimum && cost < rate.minimum && billableQuantity > 0) {
    cost = rate.minimum;
  }

  // Apply discount
  if (this.billing.discount) {
    if (this.billing.discount.percentage) {
      cost *= (1 - this.billing.discount.percentage / 100);
    } else if (this.billing.discount.amount) {
      cost = Math.max(0, cost - this.billing.discount.amount);
    }
  }

  this.billing.cost.calculated = Math.round(cost * 100) / 100;
  this.billing.cost.final = this.billing.cost.adjusted || this.billing.cost.calculated;
};

usageRecordSchema.methods.checkLimits = function() {
  const { quantity } = this.measurement;
  const { threshold } = this.limits;
  
  if (threshold.soft && quantity >= threshold.soft) {
    this.limits.exceeded.soft = true;
    if (!this.limits.exceeded.at) {
      this.limits.exceeded.at = new Date();
    }
  }
  
  if (threshold.hard && quantity >= threshold.hard) {
    this.limits.exceeded.hard = true;
    this.limits.exceeded.at = new Date();
  }
};

usageRecordSchema.methods.runValidation = async function() {
  const checks = this.validation.checks;
  let isValid = true;
  
  // Range check
  if (checks.rangeCheck) {
    const { quantity } = this.measurement;
    checks.rangeCheck.passed = 
      (!checks.rangeCheck.min || quantity >= checks.rangeCheck.min) &&
      (!checks.rangeCheck.max || quantity <= checks.rangeCheck.max);
    
    if (!checks.rangeCheck.passed) isValid = false;
  }
  
  // Delta check
  if (checks.deltaCheck && this.measurement.previousQuantity !== undefined) {
    const actualDelta = Math.abs(this.measurement.delta);
    checks.deltaCheck.actualDelta = actualDelta;
    checks.deltaCheck.passed = !checks.deltaCheck.maxDelta || actualDelta <= checks.deltaCheck.maxDelta;
    
    if (!checks.deltaCheck.passed) isValid = false;
  }
  
  // Check for duplicates
  if (!this.isNew) {
    const duplicate = await this.constructor.findOne({
      _id: { $ne: this._id },
      organizationId: this.organizationId,
      'metric.name': this.metric.name,
      'period.start': this.period.start,
      'period.end': this.period.end,
      'resource.id': this.resource.id
    });
    
    if (duplicate) {
      checks.duplicateCheck = {
        passed: false,
        duplicateId: duplicate._id
      };
      isValid = false;
    }
  }
  
  // Anomaly detection (simplified)
  if (this.measurement.previousQuantity !== undefined) {
    const changePercent = Math.abs((this.measurement.delta / this.measurement.previousQuantity) * 100);
    
    if (changePercent > 200) {
      this.validation.anomaly.detected = true;
      this.validation.anomaly.score = Math.min(changePercent / 10, 100);
      this.validation.anomaly.reason = 'Significant change detected';
      this.validation.anomaly.baseline = {
        value: this.measurement.previousQuantity,
        deviation: changePercent
      };
    }
  }
  
  this.validation.status = isValid ? 'valid' : 'invalid';
  
  if (this.validation.anomaly.detected) {
    this.validation.status = 'anomaly';
  }
};

usageRecordSchema.methods.bill = async function(invoiceId, lineItemId) {
  if (this.billing.status !== 'unbilled') {
    throw new AppError('Usage record already billed', 400, 'ALREADY_BILLED');
  }

  if (this.validation.status !== 'valid') {
    throw new AppError('Cannot bill invalid usage record', 400, 'INVALID_RECORD');
  }

  this.billing.status = 'billed';
  this.billing.invoiceId = invoiceId;
  this.billing.lineItemId = lineItemId;

  await this.save();

  logger.info('Usage record billed', {
    recordId: this._id,
    invoiceId,
    amount: this.billing.cost.final
  });

  return this;
};

usageRecordSchema.methods.dispute = async function(reason, userId) {
  if (this.billing.status !== 'billed' && this.billing.status !== 'invoiced') {
    throw new AppError('Can only dispute billed records', 400, 'NOT_BILLED');
  }

  this.billing.status = 'disputed';
  this.validation.status = 'disputed';
  
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }
  
  this.metadata.notes.push({
    content: `Disputed: ${reason}`,
    addedBy: userId,
    addedAt: new Date(),
    type: 'dispute'
  });

  await this.save();

  logger.warn('Usage record disputed', {
    recordId: this._id,
    reason
  });

  return this;
};

usageRecordSchema.methods.waive = async function(reason, userId) {
  if (this.billing.status === 'invoiced') {
    throw new AppError('Cannot waive invoiced usage', 400, 'ALREADY_INVOICED');
  }

  const previousStatus = this.billing.status;
  this.billing.status = 'waived';
  this.billing.cost.adjusted = 0;
  this.billing.cost.final = 0;
  
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }
  
  this.metadata.notes.push({
    content: `Waived: ${reason}`,
    addedBy: userId,
    addedAt: new Date(),
    type: 'adjustment'
  });

  if (!this.audit.trail) {
    this.audit.trail = [];
  }
  
  this.audit.trail.push({
    action: 'waive',
    performedBy: userId,
    performedAt: new Date(),
    changes: {
      previousStatus,
      reason
    }
  });

  await this.save();

  logger.info('Usage record waived', {
    recordId: this._id,
    reason
  });

  return this;
};

usageRecordSchema.methods.adjustCost = async function(newCost, reason, userId) {
  this.billing.cost.adjusted = newCost;
  this.billing.cost.final = newCost;
  
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }
  
  this.metadata.notes.push({
    content: `Cost adjusted: ${reason}`,
    addedBy: userId,
    addedAt: new Date(),
    type: 'adjustment'
  });

  await this.save();

  logger.info('Usage record cost adjusted', {
    recordId: this._id,
    originalCost: this.billing.cost.calculated,
    newCost
  });

  return this;
};

usageRecordSchema.methods.aggregate = async function(childRecords) {
  if (!Array.isArray(childRecords) || childRecords.length === 0) {
    throw new AppError('No records to aggregate', 400, 'NO_RECORDS');
  }

  this.aggregation.isAggregate = true;
  this.aggregation.childRecordIds = childRecords.map(r => r._id);
  this.aggregation.aggregatedAt = new Date();

  // Calculate aggregated values based on aggregation type
  const quantities = childRecords.map(r => r.measurement.quantity);
  const stats = {
    min: Math.min(...quantities),
    max: Math.max(...quantities),
    sum: quantities.reduce((a, b) => a + b, 0),
    count: quantities.length,
    avg: quantities.reduce((a, b) => a + b, 0) / quantities.length
  };

  // Calculate percentiles
  const sorted = quantities.sort((a, b) => a - b);
  stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
  stats.p99 = sorted[Math.floor(sorted.length * 0.99)];

  this.aggregation.stats = stats;

  // Set measurement based on aggregation type
  switch (this.measurement.aggregationType) {
    case 'sum':
      this.measurement.quantity = stats.sum;
      break;
    case 'max':
      this.measurement.quantity = stats.max;
      break;
    case 'average':
      this.measurement.quantity = stats.avg;
      break;
    case 'last':
      this.measurement.quantity = childRecords[childRecords.length - 1].measurement.quantity;
      break;
    default:
      this.measurement.quantity = stats.sum;
  }

  // Update child records
  await this.constructor.updateMany(
    { _id: { $in: this.aggregation.childRecordIds } },
    { 
      'aggregation.parentRecordId': this._id,
      'billing.status': 'billed' // Mark as billed to prevent double billing
    }
  );

  // Recalculate cost
  if (this.billing.rate) {
    this.calculateCost();
  }

  await this.save();

  logger.info('Usage records aggregated', {
    parentRecordId: this._id,
    childCount: childRecords.length,
    quantity: this.measurement.quantity
  });

  return this;
};

usageRecordSchema.methods.sendAlert = async function(level, threshold) {
  if (!this.limits.alerts) {
    this.limits.alerts = [];
  }

  // Check if alert already sent for this threshold
  const alertExists = this.limits.alerts.some(
    a => a.level === level && a.threshold === threshold
  );

  if (alertExists) {
    return;
  }

  this.limits.alerts.push({
    level,
    threshold,
    sentAt: new Date(),
    method: 'email'
  });

  await this.save();

  logger.info('Usage alert sent', {
    recordId: this._id,
    level,
    threshold,
    quantity: this.measurement.quantity
  });

  return this;
};

// ==================== Static Methods ====================
usageRecordSchema.statics.recordUsage = async function(data) {
  const {
    organizationId,
    metric,
    quantity,
    resource,
    period,
    source
  } = data;

  // Get subscription if exists
  const Subscription = mongoose.model('Subscription');
  const subscription = await Subscription.findOne({
    organizationId,
    status: { $in: ['active', 'trialing'] }
  });

  const record = new this({
    organizationId,
    tenantId: data.tenantId,
    subscriptionId: subscription?._id,
    metric: {
      name: metric,
      unit: data.unit || 'count',
      category: data.category
    },
    measurement: {
      quantity,
      previousQuantity: data.previousQuantity
    },
    period: period || {
      start: new Date(),
      end: new Date()
    },
    source: source || {
      type: 'api'
    },
    resource
  });

  // Get billing rate from subscription plan if available
  if (subscription) {
    const SubscriptionPlan = mongoose.model('SubscriptionPlan');
    const plan = await SubscriptionPlan.findById(subscription.planId);
    
    if (plan && plan.pricing.overageRates && plan.pricing.overageRates[metric]) {
      record.billing.rate = {
        amount: plan.pricing.overageRates[metric].rate,
        per: 1,
        currency: subscription.billing.currency
      };
    }
  }

  await record.save();

  logger.info('Usage recorded', {
    recordId: record._id,
    organizationId,
    metric,
    quantity
  });

  return record;
};

usageRecordSchema.statics.getUsageSummary = async function(organizationId, options = {}) {
  const query = { organizationId };
  
  if (options.metric) {
    query['metric.name'] = options.metric;
  }
  
  if (options.dateRange) {
    query['period.start'] = {
      $gte: options.dateRange.start,
      $lte: options.dateRange.end
    };
  }
  
  if (options.resource) {
    query['resource.id'] = options.resource;
  }

  const summary = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          metric: '$metric.name',
          unit: '$metric.unit'
        },
        totalQuantity: { $sum: '$measurement.quantity' },
        totalCost: { $sum: '$billing.cost.final' },
        recordCount: { $sum: 1 },
        firstUsage: { $min: '$period.start' },
        lastUsage: { $max: '$period.end' },
        avgQuantity: { $avg: '$measurement.quantity' },
        maxQuantity: { $max: '$measurement.quantity' }
      }
    },
    {
      $project: {
        metric: '$_id.metric',
        unit: '$_id.unit',
        totalQuantity: 1,
        totalCost: 1,
        recordCount: 1,
        firstUsage: 1,
        lastUsage: 1,
        avgQuantity: { $round: ['$avgQuantity', 2] },
        maxQuantity: 1,
        _id: 0
      }
    }
  ]);

  return summary;
};

usageRecordSchema.statics.getUnbilledUsage = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    'billing.status': 'unbilled',
    'validation.status': 'valid'
  };
  
  if (options.endDate) {
    query['period.end'] = { $lte: options.endDate };
  }

  const usage = await this.find(query)
    .sort({ 'period.start': 1 });

  const summary = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalCost: { $sum: '$billing.cost.final' },
        recordCount: { $sum: 1 },
        metrics: {
          $addToSet: '$metric.name'
        }
      }
    }
  ]);

  return {
    records: usage,
    summary: summary[0] || {
      totalCost: 0,
      recordCount: 0,
      metrics: []
    }
  };
};

usageRecordSchema.statics.aggregateUsage = async function(options) {
  const {
    organizationId,
    metric,
    fromDate,
    toDate,
    granularity = 'daily'
  } = options;

  const match = {
    organizationId,
    'metric.name': metric,
    'period.start': {
      $gte: fromDate,
      $lte: toDate
    },
    'aggregation.isAggregate': false
  };

  // Define grouping based on granularity
  let groupBy;
  switch (granularity) {
    case 'hourly':
      groupBy = {
        year: { $year: '$period.start' },
        month: { $month: '$period.start' },
        day: { $dayOfMonth: '$period.start' },
        hour: { $hour: '$period.start' }
      };
      break;
    case 'daily':
      groupBy = {
        year: { $year: '$period.start' },
        month: { $month: '$period.start' },
        day: { $dayOfMonth: '$period.start' }
      };
      break;
    case 'weekly':
      groupBy = {
        year: { $year: '$period.start' },
        week: { $week: '$period.start' }
      };
      break;
    case 'monthly':
      groupBy = {
        year: { $year: '$period.start' },
        month: { $month: '$period.start' }
      };
      break;
  }

  const aggregated = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupBy,
        records: { $push: '$$ROOT' },
        totalQuantity: { $sum: '$measurement.quantity' },
        totalCost: { $sum: '$billing.cost.final' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
  ]);

  // Create parent records for each group
  const parentRecords = [];
  
  for (const group of aggregated) {
    const childRecords = group.records;
    const firstRecord = childRecords[0];
    
    const parentRecord = new this({
      organizationId,
      tenantId: firstRecord.tenantId,
      subscriptionId: firstRecord.subscriptionId,
      metric: firstRecord.metric,
      measurement: {
        quantity: group.totalQuantity,
        aggregationType: 'sum'
      },
      period: {
        start: new Date(Math.min(...childRecords.map(r => r.period.start))),
        end: new Date(Math.max(...childRecords.map(r => r.period.end))),
        granularity
      },
      source: {
        type: 'calculated'
      },
      aggregation: {
        rollupLevel: granularity
      },
      billing: firstRecord.billing
    });

    await parentRecord.aggregate(childRecords);
    parentRecords.push(parentRecord);
  }

  logger.info('Usage aggregated', {
    organizationId,
    metric,
    granularity,
    groupCount: parentRecords.length
  });

  return parentRecords;
};

usageRecordSchema.statics.detectAnomalies = async function(organizationId, metric, options = {}) {
  const lookbackDays = options.lookbackDays || 30;
  const threshold = options.threshold || 2; // Standard deviations

  // Get historical data
  const historicalData = await this.find({
    organizationId,
    'metric.name': metric,
    'period.start': {
      $gte: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    },
    'validation.status': 'valid'
  }).sort({ 'period.start': 1 });

  if (historicalData.length < 10) {
    return []; // Not enough data for anomaly detection
  }

  // Calculate statistics
  const quantities = historicalData.map(r => r.measurement.quantity);
  const mean = quantities.reduce((a, b) => a + b) / quantities.length;
  const variance = quantities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / quantities.length;
  const stdDev = Math.sqrt(variance);

  // Find anomalies
  const anomalies = historicalData.filter(record => {
    const zScore = Math.abs((record.measurement.quantity - mean) / stdDev);
    return zScore > threshold;
  });

  // Update records with anomaly information
  for (const anomaly of anomalies) {
    anomaly.validation.anomaly = {
      detected: true,
      score: Math.min(((anomaly.measurement.quantity - mean) / stdDev) * 10, 100),
      reason: 'Statistical anomaly detected',
      baseline: {
        value: mean,
        deviation: Math.abs(anomaly.measurement.quantity - mean)
      }
    };
    
    anomaly.validation.status = 'anomaly';
    await anomaly.save();
  }

  logger.info('Anomaly detection completed', {
    organizationId,
    metric,
    totalRecords: historicalData.length,
    anomaliesFound: anomalies.length
  });

  return anomalies;
};

usageRecordSchema.statics.generateBillingReport = async function(organizationId, billingPeriod) {
  const { month, year } = billingPeriod;
  
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const report = await this.aggregate([
    {
      $match: {
        organizationId,
        'period.start': { $gte: startDate, $lte: endDate },
        'billing.status': { $in: ['unbilled', 'billed'] },
        'validation.status': 'valid'
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalCost: { $sum: '$billing.cost.final' },
              totalRecords: { $sum: 1 },
              metrics: { $addToSet: '$metric.name' }
            }
          }
        ],
        byMetric: [
          {
            $group: {
              _id: '$metric.name',
              quantity: { $sum: '$measurement.quantity' },
              cost: { $sum: '$billing.cost.final' },
              unit: { $first: '$metric.unit' },
              records: { $sum: 1 }
            }
          }
        ],
        byResource: [
          {
            $group: {
              _id: {
                type: '$resource.type',
                name: '$resource.name'
              },
              cost: { $sum: '$billing.cost.final' },
              records: { $sum: 1 }
            }
          }
        ],
        dailyTrend: [
          {
            $group: {
              _id: { $dayOfMonth: '$period.start' },
              cost: { $sum: '$billing.cost.final' },
              quantity: { $sum: '$measurement.quantity' }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ]);

  const result = report[0];

  return {
    period: {
      month,
      year,
      startDate,
      endDate
    },
    summary: result.summary[0] || {
      totalCost: 0,
      totalRecords: 0,
      metrics: []
    },
    breakdown: {
      byMetric: result.byMetric,
      byResource: result.byResource
    },
    trends: {
      daily: result.dailyTrend
    }
  };
};

// Create and export model
const UsageRecordModel = BaseModel.createModel('UsageRecord', usageRecordSchema);

module.exports = {
  schema: usageRecordSchema,
  model: UsageRecordModel
};