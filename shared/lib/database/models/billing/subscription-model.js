'use strict';

/**
 * @fileoverview Subscription model for managing recurring billing
 * @module shared/lib/database/models/billing/subscription-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const dateHelper = require('../../../utils/helpers/date-helper');
const { SUBSCRIPTION_STATUS } = require('../../../utils/constants/status-codes');

/**
 * Subscription schema definition
 */
const subscriptionSchemaDefinition = {
  // Subscription Identification
  subscriptionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Customer Information
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  customerType: {
    type: String,
    required: true,
    enum: ['user', 'organization', 'tenant']
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // Plan Information
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
    index: true
  },

  planSnapshot: {
    name: String,
    code: String,
    price: Number,
    currency: String,
    interval: String,
    intervalCount: Number,
    features: [String],
    limits: mongoose.Schema.Types.Mixed
  },

  // Pricing
  price: {
    type: Number,
    required: true,
    min: 0
  },

  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD'
  },

  // Billing Cycle
  billingInterval: {
    type: String,
    required: true,
    enum: ['day', 'week', 'month', 'year'],
    default: 'month'
  },

  billingIntervalCount: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },

  // Subscription Dates
  startDate: {
    type: Date,
    required: true,
    index: true
  },

  currentPeriodStart: {
    type: Date,
    required: true
  },

  currentPeriodEnd: {
    type: Date,
    required: true,
    index: true
  },

  endDate: Date,
  endedAt: Date,

  // Trial Information
  trialStart: Date,
  trialEnd: {
    type: Date,
    index: true
  },

  trialDays: {
    type: Number,
    default: 0
  },

  // Status
  status: {
    type: String,
    required: true,
    enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused', 'pending'],
    default: 'pending',
    index: true
  },

  previousStatus: String,

  // Cancellation
  cancelAt: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },

  cancelledAt: Date,
  cancellationReason: String,
  cancellationFeedback: String,
  cancelledBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: String
  },

  // Pause
  pausedAt: Date,
  pausedUntil: Date,
  pauseReason: String,
  pausedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: String
  },

  // Payment Information
  paymentMethodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentMethod'
  },

  defaultPaymentMethod: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentMethod'
  },

  lastPaymentStatus: String,
  lastPaymentDate: Date,
  lastPaymentAmount: Number,
  
  nextPaymentDate: {
    type: Date,
    index: true
  },

  nextPaymentAmount: Number,

  // Payment Retry
  paymentRetries: {
    type: Number,
    default: 0
  },

  maxPaymentRetries: {
    type: Number,
    default: 3
  },

  nextRetryDate: Date,

  // Discounts and Promotions
  discounts: [{
    discountId: mongoose.Schema.Types.ObjectId,
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'trial_extension']
    },
    value: Number,
    duration: {
      type: String,
      enum: ['once', 'repeating', 'forever']
    },
    durationInMonths: Number,
    appliedAt: Date,
    expiresAt: Date,
    code: String
  }],

  currentDiscount: {
    amount: Number,
    percentage: Number,
    expiresAt: Date
  },

  // Add-ons
  addOns: [{
    addOnId: mongoose.Schema.Types.ObjectId,
    name: String,
    quantity: Number,
    price: Number,
    addedAt: Date
  }],

  // Usage-based Billing
  usageRecords: [{
    recordId: mongoose.Schema.Types.ObjectId,
    metric: String,
    quantity: Number,
    unitPrice: Number,
    totalAmount: Number,
    period: {
      start: Date,
      end: Date
    }
  }],

  // Quantity
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },

  seats: {
    included: Number,
    additional: Number,
    pricePerSeat: Number
  },

  // Invoice Settings
  invoiceSettings: {
    autoAdvance: {
      type: Boolean,
      default: true
    },
    daysUntilDue: {
      type: Number,
      default: 7
    },
    footer: String,
    customFields: [{
      name: String,
      value: String
    }]
  },

  // Billing Details
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    taxId: String,
    companyName: String
  },

  // Tax Information
  taxRates: [{
    taxRateId: mongoose.Schema.Types.ObjectId,
    percentage: Number,
    inclusive: Boolean,
    jurisdiction: String
  }],

  taxExempt: {
    type: Boolean,
    default: false
  },

  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'admin', 'migration', 'import']
    },
    referrer: String,
    campaignId: String,
    affiliateId: String,
    salesRepId: mongoose.Schema.Types.ObjectId,
    customData: mongoose.Schema.Types.Mixed,
    tags: [String]
  },

  // Webhooks and Notifications
  webhookEvents: [{
    event: String,
    sentAt: Date,
    response: mongoose.Schema.Types.Mixed
  }],

  notifications: {
    renewal: {
      type: Boolean,
      default: true
    },
    paymentFailed: {
      type: Boolean,
      default: true
    },
    usageAlert: {
      type: Boolean,
      default: true
    }
  },

  // Provider Information
  provider: {
    type: String,
    enum: ['stripe', 'paypal', 'internal', 'manual']
  },

  providerSubscriptionId: {
    type: String,
    index: true
  },

  providerCustomerId: String,

  // History
  statusHistory: [{
    status: String,
    changedAt: Date,
    changedBy: mongoose.Schema.Types.ObjectId,
    reason: String
  }],

  planHistory: [{
    planId: mongoose.Schema.Types.ObjectId,
    planName: String,
    startDate: Date,
    endDate: Date,
    price: Number
  }],

  // Metrics
  metrics: {
    totalRevenue: {
      type: Number,
      default: 0
    },
    totalPayments: {
      type: Number,
      default: 0
    },
    averageRevenuePerPeriod: Number,
    lifetimeValue: Number,
    churnProbability: Number
  },

  // Audit
  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['user', 'admin', 'system']
    }
  },

  lastModifiedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    modifiedAt: Date
  }
};

// Create schema
const subscriptionSchema = BaseModel.createSchema(subscriptionSchemaDefinition, {
  collection: 'subscriptions',
  timestamps: true
});

// Indexes
subscriptionSchema.index({ customerId: 1, status: 1 });
subscriptionSchema.index({ organizationId: 1, status: 1 });
subscriptionSchema.index({ nextPaymentDate: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1, status: 1 });
subscriptionSchema.index({ 'statusHistory.changedAt': -1 });

// Virtual fields
subscriptionSchema.virtual('isActive').get(function() {
  return ['active', 'trialing'].includes(this.status);
});

subscriptionSchema.virtual('isInTrial').get(function() {
  return this.status === 'trialing' && this.trialEnd > new Date();
});

subscriptionSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.isActive || !this.currentPeriodEnd) return null;
  
  const now = new Date();
  const diffTime = this.currentPeriodEnd - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

subscriptionSchema.virtual('totalPrice').get(function() {
  let total = this.price * this.quantity;
  
  // Add add-ons
  if (this.addOns && this.addOns.length > 0) {
    total += this.addOns.reduce((sum, addon) => sum + (addon.price * addon.quantity), 0);
  }

  // Add seat overage
  if (this.seats && this.seats.additional > 0) {
    total += this.seats.additional * this.seats.pricePerSeat;
  }

  // Apply discount
  if (this.currentDiscount) {
    if (this.currentDiscount.percentage) {
      total -= total * (this.currentDiscount.percentage / 100);
    } else if (this.currentDiscount.amount) {
      total -= this.currentDiscount.amount;
    }
  }

  return Math.max(0, total);
});

// Pre-save middleware
subscriptionSchema.pre('save', async function(next) {
  try {
    // Generate subscription ID if not provided
    if (!this.subscriptionId && this.isNew) {
      this.subscriptionId = await this.constructor.generateSubscriptionId();
    }

    // Set trial dates if applicable
    if (this.isNew && this.trialDays > 0) {
      this.trialStart = this.startDate || new Date();
      this.trialEnd = new Date(this.trialStart);
      this.trialEnd.setDate(this.trialEnd.getDate() + this.trialDays);
      this.status = 'trialing';
    }

    // Calculate billing periods
    if (this.isModified('startDate') || this.isModified('currentPeriodEnd')) {
      this.calculateNextPeriod();
    }

    // Update status history
    if (this.isModified('status')) {
      if (!this.statusHistory) {
        this.statusHistory = [];
      }
      
      this.statusHistory.push({
        status: this.status,
        changedAt: new Date(),
        changedBy: this.lastModifiedBy?.userId,
        reason: this.cancellationReason || this.pauseReason
      });

      // Keep previous status
      if (this.status !== this.previousStatus) {
        this.previousStatus = this._original?.status;
      }
    }

    // Handle cancellation
    if (this.cancelAtPeriodEnd && !this.cancelAt) {
      this.cancelAt = this.currentPeriodEnd;
    }

    // Calculate next payment amount
    this.nextPaymentAmount = this.totalPrice;

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
subscriptionSchema.methods.calculateNextPeriod = function() {
  if (!this.currentPeriodEnd) {
    this.currentPeriodStart = this.startDate;
    this.currentPeriodEnd = this.calculatePeriodEnd(this.currentPeriodStart);
  }

  // Calculate next payment date
  if (this.isActive && !this.cancelAtPeriodEnd) {
    this.nextPaymentDate = new Date(this.currentPeriodEnd);
    this.nextPaymentDate.setDate(this.nextPaymentDate.getDate() + 1);
  }
};

subscriptionSchema.methods.calculatePeriodEnd = function(periodStart) {
  const start = new Date(periodStart);
  
  switch (this.billingInterval) {
    case 'day':
      start.setDate(start.getDate() + this.billingIntervalCount);
      break;
    case 'week':
      start.setDate(start.getDate() + (7 * this.billingIntervalCount));
      break;
    case 'month':
      start.setMonth(start.getMonth() + this.billingIntervalCount);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() + this.billingIntervalCount);
      break;
  }
  
  return start;
};

subscriptionSchema.methods.activate = async function() {
  if (this.status === 'active') {
    return this;
  }

  this.status = 'active';
  
  if (this.status === 'trialing') {
    this.trialEnd = new Date();
  }

  await this.save();
  
  logger.info('Subscription activated', {
    subscriptionId: this.subscriptionId,
    customerId: this.customerId
  });
  
  return this;
};

subscriptionSchema.methods.cancel = async function(options = {}) {
  const { 
    atPeriodEnd = true, 
    reason, 
    feedback, 
    cancelledBy 
  } = options;

  if (['cancelled', 'expired'].includes(this.status)) {
    throw new AppError('Subscription is already cancelled', 400, 'ALREADY_CANCELLED');
  }

  if (atPeriodEnd) {
    this.cancelAtPeriodEnd = true;
    this.cancelAt = this.currentPeriodEnd;
  } else {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.endedAt = new Date();
  }

  this.cancellationReason = reason;
  this.cancellationFeedback = feedback;
  this.cancelledBy = cancelledBy;

  await this.save();
  
  // Send cancellation webhook
  await this.sendWebhook('subscription.cancelled');
  
  return this;
};

subscriptionSchema.methods.reactivate = async function() {
  if (!['cancelled', 'paused'].includes(this.status)) {
    throw new AppError('Subscription cannot be reactivated', 400, 'INVALID_STATUS');
  }

  if (this.cancelAtPeriodEnd) {
    this.cancelAtPeriodEnd = false;
    this.cancelAt = null;
  } else {
    this.status = 'active';
  }

  this.cancellationReason = null;
  this.cancellationFeedback = null;
  this.pausedAt = null;
  this.pausedUntil = null;

  await this.save();
  
  // Send reactivation webhook
  await this.sendWebhook('subscription.reactivated');
  
  return this;
};

subscriptionSchema.methods.pause = async function(options = {}) {
  const { until, reason, pausedBy } = options;

  if (this.status !== 'active') {
    throw new AppError('Only active subscriptions can be paused', 400, 'INVALID_STATUS');
  }

  this.previousStatus = this.status;
  this.status = 'paused';
  this.pausedAt = new Date();
  this.pausedUntil = until;
  this.pauseReason = reason;
  this.pausedBy = pausedBy;

  await this.save();
  
  // Send pause webhook
  await this.sendWebhook('subscription.paused');
  
  return this;
};

subscriptionSchema.methods.resume = async function() {
  if (this.status !== 'paused') {
    throw new AppError('Subscription is not paused', 400, 'NOT_PAUSED');
  }

  this.status = this.previousStatus || 'active';
  this.pausedAt = null;
  this.pausedUntil = null;
  this.pauseReason = null;

  await this.save();
  
  // Send resume webhook
  await this.sendWebhook('subscription.resumed');
  
  return this;
};

subscriptionSchema.methods.changePlan = async function(newPlanId, options = {}) {
  const { 
    prorated = true, 
    atPeriodEnd = false 
  } = options;

  const SubscriptionPlan = mongoose.model('SubscriptionPlan');
  const newPlan = await SubscriptionPlan.findById(newPlanId);
  
  if (!newPlan) {
    throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  }

  // Record plan history
  if (!this.planHistory) {
    this.planHistory = [];
  }
  
  this.planHistory.push({
    planId: this.planId,
    planName: this.planSnapshot.name,
    startDate: this.currentPeriodStart,
    endDate: new Date(),
    price: this.price
  });

  if (atPeriodEnd) {
    // Schedule plan change for next period
    this.pendingPlanChange = {
      planId: newPlanId,
      scheduledFor: this.currentPeriodEnd
    };
  } else {
    // Change plan immediately
    this.planId = newPlanId;
    this.planSnapshot = {
      name: newPlan.name,
      code: newPlan.code,
      price: newPlan.price,
      currency: newPlan.currency,
      interval: newPlan.billingInterval,
      intervalCount: newPlan.billingIntervalCount,
      features: newPlan.features,
      limits: newPlan.limits
    };
    this.price = newPlan.price;
    this.billingInterval = newPlan.billingInterval;
    this.billingIntervalCount = newPlan.billingIntervalCount;

    if (prorated) {
      // Calculate proration
      await this.calculateProration();
    }
  }

  await this.save();
  
  // Send plan change webhook
  await this.sendWebhook('subscription.plan_changed');
  
  return this;
};

subscriptionSchema.methods.calculateProration = async function() {
  const now = new Date();
  const periodStart = new Date(this.currentPeriodStart);
  const periodEnd = new Date(this.currentPeriodEnd);
  
  const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
  
  const unusedAmount = (this.price * remainingDays) / totalDays;
  
  // This would create a credit transaction
  logger.info('Proration calculated', {
    subscriptionId: this.subscriptionId,
    unusedAmount,
    remainingDays
  });
  
  return unusedAmount;
};

subscriptionSchema.methods.addDiscount = async function(discount) {
  if (!this.discounts) {
    this.discounts = [];
  }

  discount.appliedAt = new Date();
  
  if (discount.duration === 'repeating' && discount.durationInMonths) {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + discount.durationInMonths);
    discount.expiresAt = expiryDate;
  }

  this.discounts.push(discount);
  
  // Update current discount
  this.updateCurrentDiscount();
  
  await this.save();
  
  return this;
};

subscriptionSchema.methods.updateCurrentDiscount = function() {
  const now = new Date();
  
  // Find active discount
  const activeDiscount = this.discounts?.find(d => 
    !d.expiresAt || d.expiresAt > now
  );

  if (activeDiscount) {
    this.currentDiscount = {
      amount: activeDiscount.type === 'fixed' ? activeDiscount.value : null,
      percentage: activeDiscount.type === 'percentage' ? activeDiscount.value : null,
      expiresAt: activeDiscount.expiresAt
    };
  } else {
    this.currentDiscount = null;
  }
};

subscriptionSchema.methods.updateQuantity = async function(newQuantity) {
  const oldQuantity = this.quantity;
  this.quantity = newQuantity;

  // Calculate proration if quantity increased mid-cycle
  if (newQuantity > oldQuantity) {
    await this.calculateProration();
  }

  await this.save();
  
  // Send quantity update webhook
  await this.sendWebhook('subscription.quantity_updated');
  
  return this;
};

subscriptionSchema.methods.updatePaymentMethod = async function(paymentMethodId) {
  const PaymentMethod = mongoose.model('PaymentMethod');
  const paymentMethod = await PaymentMethod.findById(paymentMethodId);
  
  if (!paymentMethod) {
    throw new AppError('Payment method not found', 404, 'PAYMENT_METHOD_NOT_FOUND');
  }

  if (paymentMethod.customerId.toString() !== this.customerId.toString()) {
    throw new AppError('Payment method does not belong to customer', 403, 'INVALID_PAYMENT_METHOD');
  }

  this.paymentMethodId = paymentMethodId;
  this.defaultPaymentMethod = paymentMethodId;
  
  await this.save();
  
  return this;
};

subscriptionSchema.methods.recordPayment = async function(payment) {
  this.lastPaymentStatus = payment.status;
  this.lastPaymentDate = payment.processedAt || new Date();
  this.lastPaymentAmount = payment.amount;

  if (payment.status === 'succeeded') {
    this.paymentRetries = 0;
    this.nextRetryDate = null;
    
    // Update metrics
    this.metrics.totalRevenue += payment.amount;
    this.metrics.totalPayments += 1;
    
    // Advance to next period
    await this.advancePeriod();
  } else {
    this.paymentRetries += 1;
    
    if (this.paymentRetries >= this.maxPaymentRetries) {
      this.status = 'past_due';
    }
    
    // Schedule retry
    const retryDelay = Math.pow(2, this.paymentRetries) * 24 * 60 * 60 * 1000;
    this.nextRetryDate = new Date(Date.now() + retryDelay);
  }

  await this.save();
  
  return this;
};

subscriptionSchema.methods.advancePeriod = async function() {
  this.currentPeriodStart = new Date(this.currentPeriodEnd);
  this.currentPeriodStart.setDate(this.currentPeriodStart.getDate() + 1);
  this.currentPeriodEnd = this.calculatePeriodEnd(this.currentPeriodStart);
  
  // Check if subscription should end
  if (this.cancelAtPeriodEnd && this.cancelAt <= new Date()) {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.endedAt = new Date();
  } else {
    this.calculateNextPeriod();
  }

  // Clear usage records for new period
  this.usageRecords = [];
  
  await this.save();
  
  return this;
};

subscriptionSchema.methods.recordUsage = async function(metric, quantity, unitPrice) {
  if (!this.usageRecords) {
    this.usageRecords = [];
  }

  const usageRecord = {
    metric,
    quantity,
    unitPrice,
    totalAmount: quantity * unitPrice,
    period: {
      start: this.currentPeriodStart,
      end: this.currentPeriodEnd
    }
  };

  this.usageRecords.push(usageRecord);
  
  await this.save();
  
  return usageRecord;
};

subscriptionSchema.methods.sendWebhook = async function(event) {
  if (!this.webhookEvents) {
    this.webhookEvents = [];
  }

  const webhook = {
    event,
    sentAt: new Date()
  };

  try {
    // Send webhook to configured endpoints
    logger.info('Sending subscription webhook', {
      subscriptionId: this.subscriptionId,
      event
    });
    
    webhook.response = { status: 'success' };
  } catch (error) {
    webhook.response = { status: 'failed', error: error.message };
  }

  this.webhookEvents.push(webhook);
  await this.save();
};

// Static methods
subscriptionSchema.statics.generateSubscriptionId = async function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sub_${timestamp}${random}`.toUpperCase();
};

subscriptionSchema.statics.findExpiringTrials = async function(daysBefore = 3) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  
  return await this.find({
    status: 'trialing',
    trialEnd: {
      $gte: new Date(),
      $lte: targetDate
    }
  }).populate('customerId', 'email profile.fullName');
};

subscriptionSchema.statics.processScheduledChanges = async function() {
  const now = new Date();
  
  // Process scheduled plan changes
  const subscriptionsWithPendingChanges = await this.find({
    'pendingPlanChange.scheduledFor': { $lte: now }
  });

  for (const subscription of subscriptionsWithPendingChanges) {
    await subscription.changePlan(subscription.pendingPlanChange.planId);
    subscription.pendingPlanChange = undefined;
    await subscription.save();
  }

  // Process paused subscriptions that should resume
  const pausedSubscriptions = await this.find({
    status: 'paused',
    pausedUntil: { $lte: now }
  });

  for (const subscription of pausedSubscriptions) {
    await subscription.resume();
  }

  return {
    planChanges: subscriptionsWithPendingChanges.length,
    resumed: pausedSubscriptions.length
  };
};

subscriptionSchema.statics.getUpcomingRenewals = async function(days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  return await this.find({
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('customerId', 'email profile.fullName')
    .populate('planId', 'name price');
};

subscriptionSchema.statics.getChurnStatistics = async function(organizationId, period) {
  const { startDate, endDate } = period;
  
  const matchQuery = {
    status: 'cancelled',
    cancelledAt: { $gte: startDate, $lte: endDate }
  };

  if (organizationId) {
    matchQuery.organizationId = organizationId;
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$cancellationReason',
        count: { $sum: 1 },
        totalRevenueLost: { $sum: '$metrics.totalRevenue' },
        avgLifetime: { $avg: '$metrics.totalPayments' }
      }
    },
    {
      $project: {
        reason: '$_id',
        count: 1,
        totalRevenueLost: { $round: ['$totalRevenueLost', 2] },
        avgLifetime: { $round: ['$avgLifetime', 0] },
        percentage: { $round: [{ $multiply: [{ $divide: ['$count', { $sum: '$count' }] }, 100] }, 2] }
      }
    },
    { $sort: { count: -1 } }
  ]);

  return stats;
};

subscriptionSchema.statics.getMRR = async function(organizationId) {
  const matchQuery = {
    status: { $in: ['active', 'trialing'] }
  };

  if (organizationId) {
    matchQuery.organizationId = organizationId;
  }

  const [result] = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        monthlyRecurring: {
          $sum: {
            $cond: [
              { $eq: ['$billingInterval', 'month'] },
              '$totalPrice',
              {
                $cond: [
                  { $eq: ['$billingInterval', 'year'] },
                  { $divide: ['$totalPrice', 12] },
                  0
                ]
              }
            ]
          }
        },
        yearlyRecurring: {
          $sum: {
            $cond: [
              { $eq: ['$billingInterval', 'year'] },
              '$totalPrice',
              0
            ]
          }
        },
        activeSubscriptions: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        mrr: { $round: ['$monthlyRecurring', 2] },
        arr: { $round: [{ $multiply: ['$monthlyRecurring', 12] }, 2] },
        yearlyRevenue: { $round: ['$yearlyRecurring', 2] },
        activeSubscriptions: 1
      }
    }
  ]);

  return result || {
    mrr: 0,
    arr: 0,
    yearlyRevenue: 0,
    activeSubscriptions: 0
  };
};

// Create and export model
const SubscriptionModel = BaseModel.createModel('Subscription', subscriptionSchema);

module.exports = {
  schema: subscriptionSchema,
  model: SubscriptionModel
};