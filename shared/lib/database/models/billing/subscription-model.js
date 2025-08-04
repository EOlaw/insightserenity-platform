'use strict';

/**
 * @fileoverview Subscription model for managing active subscriptions
 * @module shared/lib/database/models/billing/subscription-model
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
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const dateHelper = require('../../../utils/helpers/date-helper');

/**
 * Subscription schema definition
 */
const subscriptionSchemaDefinition = {
  // ==================== Core Identity ====================
  subscriptionId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
    index: true
  },

  // ==================== Subscription Details ====================
  billing: {
    amount: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },

    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      validate: {
        validator: function(value) {
          return /^[A-Z]{3}$/.test(value);
        },
        message: 'Invalid currency code'
      }
    },

    interval: {
      type: String,
      enum: ['monthly', 'quarterly', 'semi-annual', 'annual', 'biennial', 'custom'],
      required: true
    },

    intervalCount: {
      type: Number,
      default: 1,
      min: 1
    },

    discounts: [{
      type: {
        type: String,
        enum: ['percentage', 'fixed', 'trial', 'promotional']
      },
      value: Number,
      code: String,
      description: String,
      appliedAt: Date,
      expiresAt: Date
    }],

    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    state: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused', 'pending'],
      required: true,
      default: 'pending',
      index: true
    },

    previousState: String,

    stateHistory: [{
      state: String,
      changedAt: Date,
      reason: String,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],

    trial: {
      isTrialing: {
        type: Boolean,
        default: false
      },
      startDate: Date,
      endDate: Date,
      daysRemaining: Number,
      convertedAt: Date
    },

    cancellation: {
      requestedAt: Date,
      effectiveDate: Date,
      reason: String,
      feedback: String,
      preventable: Boolean,
      offeredRetention: Boolean,
      byUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },

    pause: {
      pausedAt: Date,
      resumeDate: Date,
      reason: String,
      byUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },

  // ==================== Billing Periods ====================
  periods: {
    current: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      billingDate: Date,
      amount: Number,
      paid: {
        type: Boolean,
        default: false
      },
      invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
      }
    },

    next: {
      startDate: Date,
      endDate: Date,
      billingDate: Date,
      amount: Number
    },

    history: [{
      periodId: String,
      startDate: Date,
      endDate: Date,
      billingDate: Date,
      amount: Number,
      paid: Boolean,
      invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
      },
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
      }
    }]
  },

  // ==================== Payment Information ====================
  payment: {
    methodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod'
    },

    lastPaymentDate: Date,
    lastPaymentAmount: Number,
    
    failedAttempts: {
      type: Number,
      default: 0
    },

    lastFailureDate: Date,
    lastFailureReason: String,

    retrySchedule: [{
      attemptNumber: Number,
      scheduledDate: Date,
      attempted: Boolean,
      result: String
    }],

    autoRenew: {
      type: Boolean,
      default: true
    },

    requiresPaymentUpdate: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Features & Usage ====================
  features: {
    inherited: {
      type: Boolean,
      default: true
    },

    overrides: {
      users: {
        limit: Number
      },
      projects: {
        limit: Number
      },
      storage: {
        limit: Number
      },
      apiCalls: {
        monthlyLimit: Number
      },
      customFeatures: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    },

    usage: {
      users: {
        current: {
          type: Number,
          default: 0
        },
        peak: Number,
        lastUpdated: Date
      },
      projects: {
        current: {
          type: Number,
          default: 0
        },
        peak: Number,
        lastUpdated: Date
      },
      storage: {
        current: {
          type: Number,
          default: 0
        },
        peak: Number,
        lastUpdated: Date
      },
      apiCalls: {
        current: {
          type: Number,
          default: 0
        },
        resetDate: Date
      }
    },

    addons: [{
      addonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Addon'
      },
      name: String,
      quantity: Number,
      price: Number,
      addedAt: Date,
      expiresAt: Date
    }]
  },

  // ==================== Renewal & Upgrade ====================
  renewal: {
    nextRenewalDate: {
      type: Date,
      index: true
    },

    remindersSent: [{
      type: {
        type: String,
        enum: ['email', 'in-app', 'sms']
      },
      sentAt: Date,
      daysBeforeRenewal: Number
    }],

    settings: {
      autoRenew: {
        type: Boolean,
        default: true
      },
      reminderDays: {
        type: [Number],
        default: [7, 3, 1]
      },
      gracePeriodDays: {
        type: Number,
        default: 3
      }
    }
  },

  upgrade: {
    history: [{
      fromPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      toPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      upgradedAt: Date,
      prorationAmount: Number,
      reason: String,
      byUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],

    pendingUpgrade: {
      toPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      effectiveDate: Date,
      prorationAmount: Number
    }
  },

  // ==================== Provider Integration ====================
  providers: {
    stripe: {
      customerId: String,
      subscriptionId: String,
      priceId: String,
      latestInvoiceId: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    paypal: {
      subscriberId: String,
      subscriptionId: String,
      planId: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    custom: mongoose.Schema.Types.Mixed
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    lifetimeValue: {
      type: Number,
      default: 0
    },
    totalPayments: {
      type: Number,
      default: 0
    },
    averagePaymentAmount: {
      type: Number,
      default: 0
    },
    paymentCount: {
      type: Number,
      default: 0
    },
    churnRisk: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      factors: [{
        factor: String,
        weight: Number,
        value: Number
      }],
      lastCalculated: Date
    },
    engagement: {
      lastLoginDate: Date,
      monthlyActiveUsers: Number,
      featureAdoption: {
        type: Map,
        of: Number
      }
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    dataRetention: {
      retainUntil: Date,
      reason: String
    },
    gdpr: {
      consentDate: Date,
      consentVersion: String,
      dataExportRequests: [{
        requestedAt: Date,
        completedAt: Date,
        exportUrl: String
      }]
    },
    taxExempt: {
      isExempt: {
        type: Boolean,
        default: false
      },
      exemptionId: String,
      verifiedAt: Date
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      channel: String,
      campaign: String,
      referrer: String
    },
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
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
        enum: ['general', 'billing', 'support', 'retention']
      }
    }]
  }
};

// Create schema
const subscriptionSchema = BaseModel.createSchema(subscriptionSchemaDefinition, {
  collection: 'subscriptions',
  timestamps: true
});

// ==================== Indexes ====================
subscriptionSchema.index({ organizationId: 1, 'status.state': 1 });
subscriptionSchema.index({ tenantId: 1, 'status.state': 1 });
subscriptionSchema.index({ planId: 1, 'status.state': 1 });
subscriptionSchema.index({ 'status.state': 1, 'renewal.nextRenewalDate': 1 });
subscriptionSchema.index({ 'payment.requiresPaymentUpdate': 1 });
subscriptionSchema.index({ 'providers.stripe.subscriptionId': 1 });
subscriptionSchema.index({ 'providers.stripe.customerId': 1 });
subscriptionSchema.index({ createdAt: -1 });

// ==================== Virtual Fields ====================
subscriptionSchema.virtual('isActive').get(function() {
  return ['active', 'trialing'].includes(this.status.state);
});

subscriptionSchema.virtual('isPastDue').get(function() {
  return this.status.state === 'past_due';
});

subscriptionSchema.virtual('isCancelled').get(function() {
  return this.status.state === 'cancelled';
});

subscriptionSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.renewal.nextRenewalDate) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((this.renewal.nextRenewalDate - new Date()) / msPerDay);
  return Math.max(0, daysRemaining);
});

subscriptionSchema.virtual('trialDaysRemaining').get(function() {
  if (!this.status.trial.isTrialing || !this.status.trial.endDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((this.status.trial.endDate - new Date()) / msPerDay);
  return Math.max(0, daysRemaining);
});

subscriptionSchema.virtual('currentPeriodProgress').get(function() {
  if (!this.periods.current.startDate || !this.periods.current.endDate) return 0;
  
  const now = new Date();
  const start = this.periods.current.startDate;
  const end = this.periods.current.endDate;
  
  if (now < start) return 0;
  if (now > end) return 100;
  
  const total = end - start;
  const elapsed = now - start;
  
  return Math.round((elapsed / total) * 100);
});

// ==================== Pre-save Middleware ====================
subscriptionSchema.pre('save', async function(next) {
  try {
    // Update state history
    if (this.isModified('status.state')) {
      if (!this.status.stateHistory) {
        this.status.stateHistory = [];
      }
      
      this.status.stateHistory.push({
        state: this.status.state,
        changedAt: new Date(),
        previousState: this.status.previousState
      });
      
      this.status.previousState = this.status.state;
    }

    // Calculate next renewal date if not set
    if (!this.renewal.nextRenewalDate && this.periods.current.endDate) {
      this.renewal.nextRenewalDate = new Date(this.periods.current.endDate);
    }

    // Update trial days remaining
    if (this.status.trial.isTrialing && this.status.trial.endDate) {
      this.status.trial.daysRemaining = this.trialDaysRemaining;
    }

    // Calculate churn risk
    if (this.isModified('analytics') || this.isModified('payment') || this.isModified('status')) {
      await this.calculateChurnRisk();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
subscriptionSchema.methods.activate = async function() {
  if (this.status.state === 'active') {
    throw new AppError('Subscription is already active', 400, 'ALREADY_ACTIVE');
  }

  this.status.state = 'active';
  
  if (this.status.trial.isTrialing) {
    this.status.trial.isTrialing = false;
    this.status.trial.convertedAt = new Date();
  }
  
  await this.save();
  
  logger.info('Subscription activated', {
    subscriptionId: this._id,
    organizationId: this.organizationId
  });
  
  return this;
};

subscriptionSchema.methods.cancel = async function(reason, feedback, userId, immediate = false) {
  if (this.status.state === 'cancelled') {
    throw new AppError('Subscription is already cancelled', 400, 'ALREADY_CANCELLED');
  }

  this.status.state = 'cancelled';
  this.status.cancellation = {
    requestedAt: new Date(),
    effectiveDate: immediate ? new Date() : this.periods.current.endDate,
    reason,
    feedback,
    byUserId: userId
  };
  
  // Disable auto-renewal
  this.payment.autoRenew = false;
  this.renewal.settings.autoRenew = false;
  
  await this.save();
  
  logger.info('Subscription cancelled', {
    subscriptionId: this._id,
    organizationId: this.organizationId,
    reason,
    immediate
  });
  
  return this;
};

subscriptionSchema.methods.pause = async function(resumeDate, reason, userId) {
  if (this.status.state !== 'active') {
    throw new AppError('Only active subscriptions can be paused', 400, 'INVALID_STATE');
  }

  this.status.state = 'paused';
  this.status.pause = {
    pausedAt: new Date(),
    resumeDate,
    reason,
    byUserId: userId
  };
  
  await this.save();
  
  logger.info('Subscription paused', {
    subscriptionId: this._id,
    organizationId: this.organizationId,
    resumeDate
  });
  
  return this;
};

subscriptionSchema.methods.resume = async function() {
  if (this.status.state !== 'paused') {
    throw new AppError('Only paused subscriptions can be resumed', 400, 'NOT_PAUSED');
  }

  this.status.state = 'active';
  this.status.pause = undefined;
  
  // Recalculate billing dates
  await this.recalculateBillingPeriods();
  
  await this.save();
  
  logger.info('Subscription resumed', {
    subscriptionId: this._id,
    organizationId: this.organizationId
  });
  
  return this;
};

subscriptionSchema.methods.upgradePlan = async function(newPlanId, immediate = true) {
  const SubscriptionPlan = mongoose.model('SubscriptionPlan');
  const newPlan = await SubscriptionPlan.findById(newPlanId);
  
  if (!newPlan || newPlan.status.state !== 'active') {
    throw new AppError('Invalid or inactive plan', 400, 'INVALID_PLAN');
  }
  
  const currentPlan = await SubscriptionPlan.findById(this.planId);
  
  // Calculate proration
  const prorationAmount = this.calculateProration(currentPlan, newPlan);
  
  if (immediate) {
    // Record upgrade history
    if (!this.upgrade.history) this.upgrade.history = [];
    this.upgrade.history.push({
      fromPlanId: this.planId,
      toPlanId: newPlanId,
      upgradedAt: new Date(),
      prorationAmount
    });
    
    // Update plan
    this.planId = newPlanId;
    this.billing.amount = newPlan.pricing.amount;
    this.billing.interval = newPlan.pricing.interval;
    
    // Update features if inherited
    if (this.features.inherited) {
      this.features.overrides = {};
    }
    
    await this.save();
    
    logger.info('Subscription upgraded immediately', {
      subscriptionId: this._id,
      fromPlan: currentPlan.name,
      toPlan: newPlan.name
    });
  } else {
    // Schedule upgrade for next billing period
    this.upgrade.pendingUpgrade = {
      toPlanId: newPlanId,
      effectiveDate: this.periods.current.endDate,
      prorationAmount
    };
    
    await this.save();
    
    logger.info('Subscription upgrade scheduled', {
      subscriptionId: this._id,
      effectiveDate: this.periods.current.endDate
    });
  }
  
  return this;
};

subscriptionSchema.methods.calculateProration = function(currentPlan, newPlan) {
  if (!this.periods.current.startDate || !this.periods.current.endDate) {
    return 0;
  }
  
  const now = new Date();
  const periodStart = this.periods.current.startDate;
  const periodEnd = this.periods.current.endDate;
  
  // Calculate remaining days in current period
  const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
  
  if (remainingDays <= 0) return 0;
  
  // Calculate daily rates
  const currentDailyRate = currentPlan.pricing.amount / totalDays;
  const newDailyRate = newPlan.pricing.amount / totalDays;
  
  // Calculate proration (positive means customer owes money)
  const proration = (newDailyRate - currentDailyRate) * remainingDays;
  
  return Math.round(proration * 100) / 100;
};

subscriptionSchema.methods.recordPayment = async function(paymentId, amount) {
  // Update payment info
  this.payment.lastPaymentDate = new Date();
  this.payment.lastPaymentAmount = amount;
  this.payment.failedAttempts = 0;
  this.payment.requiresPaymentUpdate = false;
  
  // Update analytics
  this.analytics.lifetimeValue += amount;
  this.analytics.totalPayments += amount;
  this.analytics.paymentCount += 1;
  this.analytics.averagePaymentAmount = this.analytics.totalPayments / this.analytics.paymentCount;
  
  // Mark current period as paid
  if (this.periods.current) {
    this.periods.current.paid = true;
    this.periods.current.paymentId = paymentId;
  }
  
  // Update status if was past due
  if (this.status.state === 'past_due') {
    this.status.state = 'active';
  }
  
  await this.save();
  
  logger.info('Payment recorded for subscription', {
    subscriptionId: this._id,
    amount,
    paymentId
  });
  
  return this;
};

subscriptionSchema.methods.recordFailedPayment = async function(reason) {
  this.payment.failedAttempts += 1;
  this.payment.lastFailureDate = new Date();
  this.payment.lastFailureReason = reason;
  
  // Mark as past due after certain attempts
  if (this.payment.failedAttempts >= 3 && this.status.state === 'active') {
    this.status.state = 'past_due';
    this.payment.requiresPaymentUpdate = true;
  }
  
  // Schedule retry
  if (this.payment.failedAttempts < 5) {
    const retryDelays = [1, 3, 5, 7, 10]; // Days
    const delay = retryDelays[this.payment.failedAttempts - 1] || 10;
    
    if (!this.payment.retrySchedule) this.payment.retrySchedule = [];
    
    this.payment.retrySchedule.push({
      attemptNumber: this.payment.failedAttempts,
      scheduledDate: new Date(Date.now() + delay * 24 * 60 * 60 * 1000),
      attempted: false
    });
  }
  
  await this.save();
  
  logger.warn('Failed payment recorded for subscription', {
    subscriptionId: this._id,
    reason,
    attempts: this.payment.failedAttempts
  });
  
  return this;
};

subscriptionSchema.methods.updateUsage = async function(metric, value) {
  if (!this.features.usage[metric]) {
    throw new AppError('Invalid usage metric', 400, 'INVALID_METRIC');
  }
  
  this.features.usage[metric].current = value;
  this.features.usage[metric].lastUpdated = new Date();
  
  // Update peak if necessary
  if (!this.features.usage[metric].peak || value > this.features.usage[metric].peak) {
    this.features.usage[metric].peak = value;
  }
  
  await this.save();
  
  return this;
};

subscriptionSchema.methods.checkUsageLimits = async function() {
  const SubscriptionPlan = mongoose.model('SubscriptionPlan');
  const plan = await SubscriptionPlan.findById(this.planId);
  
  if (!plan) {
    throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  }
  
  const limits = {};
  const overages = {};
  
  ['users', 'projects', 'storage', 'apiCalls'].forEach(metric => {
    const planLimit = plan.features[metric]?.limit || plan.features[metric]?.monthlyLimit;
    const override = this.features.overrides?.[metric]?.limit;
    const limit = override !== undefined ? override : planLimit;
    
    if (limit && limit !== -1) {
      limits[metric] = limit;
      const current = this.features.usage[metric]?.current || 0;
      
      if (current > limit) {
        overages[metric] = {
          limit,
          current,
          overage: current - limit,
          percentage: Math.round((current / limit) * 100)
        };
      }
    }
  });
  
  return { limits, overages, hasOverages: Object.keys(overages).length > 0 };
};

subscriptionSchema.methods.addAddon = async function(addonId, quantity = 1) {
  if (!this.features.addons) this.features.addons = [];
  
  const existingAddon = this.features.addons.find(
    a => a.addonId.toString() === addonId.toString()
  );
  
  if (existingAddon) {
    existingAddon.quantity += quantity;
  } else {
    this.features.addons.push({
      addonId,
      quantity,
      addedAt: new Date()
    });
  }
  
  await this.save();
  
  logger.info('Addon added to subscription', {
    subscriptionId: this._id,
    addonId,
    quantity
  });
  
  return this;
};

subscriptionSchema.methods.removeAddon = async function(addonId) {
  if (!this.features.addons) return this;
  
  this.features.addons = this.features.addons.filter(
    a => a.addonId.toString() !== addonId.toString()
  );
  
  await this.save();
  
  logger.info('Addon removed from subscription', {
    subscriptionId: this._id,
    addonId
  });
  
  return this;
};

subscriptionSchema.methods.calculateChurnRisk = async function() {
  const factors = [];
  let totalScore = 0;
  
  // Payment failures
  if (this.payment.failedAttempts > 0) {
    const failureScore = Math.min(this.payment.failedAttempts * 10, 30);
    factors.push({ factor: 'payment_failures', weight: 0.3, value: failureScore });
    totalScore += failureScore * 0.3;
  }
  
  // Days since last login
  if (this.analytics.engagement.lastLoginDate) {
    const daysSinceLogin = Math.floor((Date.now() - this.analytics.engagement.lastLoginDate) / (1000 * 60 * 60 * 24));
    const loginScore = Math.min(daysSinceLogin * 2, 40);
    factors.push({ factor: 'inactive_days', weight: 0.2, value: loginScore });
    totalScore += loginScore * 0.2;
  }
  
  // Usage vs limits
  const usageLimits = await this.checkUsageLimits();
  if (usageLimits.hasOverages) {
    factors.push({ factor: 'usage_overages', weight: 0.1, value: 20 });
    totalScore += 20 * 0.1;
  }
  
  // Support tickets (would need integration)
  // Feature adoption
  // Contract length remaining
  
  this.analytics.churnRisk = {
    score: Math.min(Math.round(totalScore), 100),
    factors,
    lastCalculated: new Date()
  };
};

subscriptionSchema.methods.recalculateBillingPeriods = async function() {
  const now = new Date();
  
  // If current period has ended, create new period
  if (this.periods.current.endDate < now) {
    // Move current to history
    if (!this.periods.history) this.periods.history = [];
    this.periods.history.push({
      periodId: `period_${Date.now()}`,
      ...this.periods.current.toObject()
    });
    
    // Calculate new period based on interval
    const intervalDays = {
      monthly: 30,
      quarterly: 90,
      'semi-annual': 180,
      annual: 365,
      biennial: 730
    };
    
    const days = intervalDays[this.billing.interval] || 30;
    const startDate = new Date(this.periods.current.endDate);
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    this.periods.current = {
      startDate,
      endDate,
      billingDate: startDate,
      amount: this.billing.amount,
      paid: false
    };
    
    this.periods.next = {
      startDate: endDate,
      endDate: new Date(endDate.getTime() + days * 24 * 60 * 60 * 1000),
      billingDate: endDate,
      amount: this.billing.amount
    };
    
    this.renewal.nextRenewalDate = endDate;
  }
};

// ==================== Static Methods ====================
subscriptionSchema.statics.createSubscription = async function(data) {
  const { organizationId, planId, paymentMethodId, trialDays } = data;
  
  // Get plan details
  const SubscriptionPlan = mongoose.model('SubscriptionPlan');
  const plan = await SubscriptionPlan.findById(planId);
  
  if (!plan || plan.status.state !== 'active') {
    throw new AppError('Invalid or inactive plan', 400, 'INVALID_PLAN');
  }
  
  // Get organization
  const Organization = mongoose.model('Organization');
  const organization = await Organization.findById(organizationId);
  
  if (!organization) {
    throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
  }
  
  // Calculate billing periods
  const now = new Date();
  const isTrialing = trialDays > 0 || plan.pricing.trialDays > 0;
  const trialLength = trialDays || plan.pricing.trialDays || 0;
  
  let startDate = now;
  let endDate;
  
  if (isTrialing) {
    endDate = new Date(now.getTime() + trialLength * 24 * 60 * 60 * 1000);
  } else {
    const intervalDays = {
      monthly: 30,
      quarterly: 90,
      'semi-annual': 180,
      annual: 365,
      biennial: 730
    };
    
    const days = intervalDays[plan.pricing.interval] || 30;
    endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }
  
  const subscription = new this({
    organizationId,
    tenantId: organization.tenancy?.tenantId,
    planId,
    billing: {
      amount: isTrialing ? 0 : plan.pricing.amount,
      currency: plan.pricing.currency,
      interval: plan.pricing.interval,
      intervalCount: plan.pricing.intervalCount
    },
    status: {
      state: isTrialing ? 'trialing' : 'active',
      trial: isTrialing ? {
        isTrialing: true,
        startDate: now,
        endDate,
        daysRemaining: trialLength
      } : {}
    },
    periods: {
      current: {
        startDate,
        endDate,
        billingDate: isTrialing ? endDate : now,
        amount: isTrialing ? 0 : plan.pricing.amount,
        paid: isTrialing
      }
    },
    payment: {
      methodId: paymentMethodId,
      autoRenew: true
    },
    renewal: {
      nextRenewalDate: endDate
    }
  });
  
  await subscription.save();
  
  // Update organization subscription info
  organization.subscription = {
    status: subscription.status.state,
    tier: plan.tier,
    planId: plan._id
  };
  
  await organization.save();
  
  logger.info('Subscription created', {
    subscriptionId: subscription._id,
    organizationId,
    planName: plan.name,
    isTrialing
  });
  
  return subscription;
};

subscriptionSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { organizationId };
  
  if (options.activeOnly) {
    query['status.state'] = { $in: ['active', 'trialing', 'past_due'] };
  }
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .populate('planId');
};

subscriptionSchema.statics.findExpiringTrials = async function(daysAhead = 3) {
  const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  return await this.find({
    'status.state': 'trialing',
    'status.trial.endDate': {
      $gte: new Date(),
      $lte: targetDate
    }
  }).populate('organizationId planId');
};

subscriptionSchema.statics.findDueForRenewal = async function(daysAhead = 0) {
  const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  return await this.find({
    'status.state': 'active',
    'renewal.nextRenewalDate': {
      $lte: targetDate
    },
    'payment.autoRenew': true
  }).populate('organizationId planId payment.methodId');
};

subscriptionSchema.statics.findPastDue = async function(options = {}) {
  const query = {
    'status.state': 'past_due'
  };
  
  if (options.minDaysPastDue) {
    const cutoffDate = new Date(Date.now() - options.minDaysPastDue * 24 * 60 * 60 * 1000);
    query['payment.lastFailureDate'] = { $lte: cutoffDate };
  }
  
  return await this.find(query)
    .sort({ 'payment.lastFailureDate': 1 })
    .populate('organizationId planId');
};

subscriptionSchema.statics.getSubscriptionMetrics = async function(filters = {}) {
  const match = {};
  
  if (filters.tenantId) {
    match.tenantId = filters.tenantId;
  }
  
  if (filters.dateRange) {
    match.createdAt = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
    };
  }
  
  const metrics = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
              },
              trialing: {
                $sum: { $cond: [{ $eq: ['$status.state', 'trialing'] }, 1, 0] }
              },
              pastDue: {
                $sum: { $cond: [{ $eq: ['$status.state', 'past_due'] }, 1, 0] }
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ['$status.state', 'cancelled'] }, 1, 0] }
              }
            }
          }
        ],
        revenue: [
          {
            $match: { 'status.state': { $in: ['active', 'past_due'] } }
          },
          {
            $group: {
              _id: null,
              mrr: { $sum: '$billing.amount' },
              arr: { $sum: { $multiply: ['$billing.amount', 12] } },
              avgRevenue: { $avg: '$billing.amount' }
            }
          }
        ],
        churn: [
          {
            $match: {
              'status.state': 'cancelled',
              'status.cancellation.requestedAt': {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              }
            }
          },
          {
            $group: {
              _id: '$status.cancellation.reason',
              count: { $sum: 1 }
            }
          }
        ],
        byPlan: [
          {
            $group: {
              _id: '$planId',
              count: { $sum: 1 },
              revenue: { $sum: '$billing.amount' }
            }
          }
        ]
      }
    }
  ]);
  
  const result = metrics[0];
  
  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      trialing: 0,
      pastDue: 0,
      cancelled: 0
    },
    revenue: result.revenue[0] || {
      mrr: 0,
      arr: 0,
      avgRevenue: 0
    },
    churnReasons: result.churn,
    byPlan: result.byPlan
  };
};

// Create and export model
const SubscriptionModel = BaseModel.createModel('Subscription', subscriptionSchema);

module.exports = {
  schema: subscriptionSchema,
  model: SubscriptionModel
};