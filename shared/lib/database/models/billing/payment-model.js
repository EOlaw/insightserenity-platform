'use strict';

/**
 * @fileoverview Payment model for processing and tracking payments
 * @module shared/lib/database/models/billing/payment-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const stringHelper = require('../../../utils/helpers/string-helper');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../../../utils/constants/status-codes');

/**
 * Payment schema definition
 */
const paymentSchemaDefinition = {
  // Payment Identification
  paymentId: {
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

  // Amount Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY']
  },

  exchangeRate: {
    type: Number,
    default: 1
  },

  amountInBaseCurrency: {
    type: Number,
    required: true
  },

  // Payment Method
  paymentMethodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentMethod',
    index: true
  },

  paymentMethodType: {
    type: String,
    required: true,
    enum: ['credit_card', 'debit_card', 'bank_account', 'paypal', 'stripe', 'check', 'cash', 'credit_balance', 'other']
  },

  paymentMethodDetails: {
    brand: String,
    last4: String,
    bankName: String,
    checkNumber: String
  },

  // Transaction Information
  type: {
    type: String,
    required: true,
    enum: ['charge', 'refund', 'partial_refund', 'chargeback', 'adjustment'],
    default: 'charge'
  },

  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'disputed'],
    default: 'pending',
    index: true
  },

  // Related Entities
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    index: true
  },

  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    index: true
  },

  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },

  // Provider Information
  provider: {
    type: String,
    enum: ['stripe', 'paypal', 'square', 'braintree', 'authorize_net', 'manual', 'internal']
  },

  providerPaymentId: {
    type: String,
    index: true
  },

  providerResponse: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  },

  // Processing Details
  processedAt: Date,
  processingStartedAt: Date,
  attempts: {
    type: Number,
    default: 0
  },

  lastAttemptAt: Date,
  nextRetryAt: Date,

  // Failure Information
  failureCode: String,
  failureMessage: String,
  declineCode: String,

  // Fee Information
  processingFee: {
    type: Number,
    default: 0
  },

  applicationFee: {
    type: Number,
    default: 0
  },

  netAmount: {
    type: Number,
    required: true
  },

  // Refund Information
  refundedAmount: {
    type: Number,
    default: 0
  },

  refunds: [{
    refundId: String,
    amount: Number,
    reason: String,
    status: String,
    createdAt: Date,
    processedAt: Date
  }],

  refundable: {
    type: Boolean,
    default: true
  },

  // Dispute Information
  dispute: {
    status: {
      type: String,
      enum: ['warning', 'needs_response', 'under_review', 'won', 'lost']
    },
    reason: String,
    amount: Number,
    currency: String,
    evidence: mongoose.Schema.Types.Mixed,
    dueBy: Date,
    createdAt: Date,
    resolvedAt: Date
  },

  // Settlement
  settlementStatus: {
    type: String,
    enum: ['pending', 'in_transit', 'settled', 'failed'],
    default: 'pending'
  },

  settlementDate: Date,
  settlementAmount: Number,

  // Risk Assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'blocked']
  },

  riskScore: {
    type: Number,
    min: 0,
    max: 100
  },

  fraudCheck: {
    checked: {
      type: Boolean,
      default: false
    },
    score: Number,
    outcome: String,
    flaggedReasons: [String]
  },

  // Metadata
  description: String,
  statementDescriptor: String,
  receiptEmail: String,
  receiptUrl: String,

  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'recurring', 'manual', 'admin']
    },
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    deviceId: String,
    referrer: String,
    campaignId: String,
    customData: mongoose.Schema.Types.Mixed,
    tags: [String]
  },

  // Billing Address
  billingAddress: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },

  // Shipping Information (if applicable)
  shipping: {
    name: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    carrier: String,
    trackingNumber: String
  },

  // 3D Secure
  threeDSecure: {
    required: Boolean,
    succeeded: Boolean,
    version: String,
    challengeRequired: Boolean
  },

  // Webhooks
  webhooks: [{
    event: String,
    sentAt: Date,
    response: mongoose.Schema.Types.Mixed,
    attempts: Number
  }],

  // Audit
  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['user', 'admin', 'system']
    }
  },

  capturedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    capturedAt: Date
  },

  voidedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    voidedAt: Date,
    reason: String
  }
};

// Create schema
const paymentSchema = BaseModel.createSchema(paymentSchemaDefinition, {
  collection: 'payments',
  timestamps: true
});

// Indexes
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ organizationId: 1, status: 1 });
paymentSchema.index({ invoiceId: 1, status: 1 });
paymentSchema.index({ processedAt: -1 });
paymentSchema.index({ settlementDate: 1, settlementStatus: 1 });

// Virtual fields
paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'succeeded';
});

paymentSchema.virtual('isPending').get(function() {
  return ['pending', 'processing'].includes(this.status);
});

paymentSchema.virtual('canBeRefunded').get(function() {
  return this.status === 'succeeded' && 
         this.refundable && 
         this.refundedAmount < this.amount;
});

paymentSchema.virtual('remainingRefundableAmount').get(function() {
  return Math.max(0, this.amount - this.refundedAmount);
});

// Pre-save middleware
paymentSchema.pre('save', async function(next) {
  try {
    // Generate payment ID if not provided
    if (!this.paymentId && this.isNew) {
      this.paymentId = await this.constructor.generatePaymentId();
    }

    // Calculate net amount
    if (this.isModified('amount') || this.isModified('processingFee') || this.isModified('applicationFee')) {
      this.netAmount = this.amount - this.processingFee - this.applicationFee;
    }

    // Convert to base currency
    if (this.isModified('amount') || this.isModified('exchangeRate')) {
      this.amountInBaseCurrency = this.amount * (this.exchangeRate || 1);
    }

    // Update refunded amount
    if (this.isModified('refunds')) {
      this.refundedAmount = this.refunds.reduce((total, refund) => {
        return total + (refund.status === 'succeeded' ? refund.amount : 0);
      }, 0);

      if (this.refundedAmount >= this.amount) {
        this.status = 'refunded';
      } else if (this.refundedAmount > 0) {
        this.status = 'partially_refunded';
      }
    }

    // Set processing timestamps
    if (this.isModified('status')) {
      if (this.status === 'processing' && !this.processingStartedAt) {
        this.processingStartedAt = new Date();
      } else if (this.status === 'succeeded' && !this.processedAt) {
        this.processedAt = new Date();
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
paymentSchema.post('save', async function() {
  try {
    // Update invoice if linked
    if (this.invoiceId && this.status === 'succeeded') {
      const Invoice = mongoose.model('Invoice');
      await Invoice.findByIdAndUpdate(this.invoiceId, {
        $push: {
          payments: {
            paymentId: this._id,
            amount: this.amount,
            paymentDate: this.processedAt,
            paymentMethod: this.paymentMethodType,
            transactionId: this.providerPaymentId
          }
        },
        $inc: { amountPaid: this.amount }
      });
    }
  } catch (error) {
    logger.error('Error in payment post-save', error);
  }
});

// Instance methods
paymentSchema.methods.process = async function() {
  if (!this.isPending) {
    throw new AppError('Payment is not in pending status', 400, 'INVALID_STATUS');
  }

  this.status = 'processing';
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  
  await this.save();

  try {
    // Process with payment provider
    const result = await this.processWithProvider();
    
    if (result.success) {
      await this.markAsSucceeded(result);
    } else {
      await this.markAsFailed(result);
    }
  } catch (error) {
    await this.markAsFailed({
      code: 'processing_error',
      message: error.message
    });
    throw error;
  }

  return this;
};

paymentSchema.methods.processWithProvider = async function() {
  // This would integrate with actual payment providers
  // Placeholder implementation
  logger.info('Processing payment with provider', {
    paymentId: this.paymentId,
    provider: this.provider,
    amount: this.amount
  });

  // Simulate processing
  return {
    success: true,
    transactionId: `txn_${Date.now()}`,
    fee: this.amount * 0.029 + 0.30 // Typical credit card fee
  };
};

paymentSchema.methods.markAsSucceeded = async function(result) {
  this.status = 'succeeded';
  this.processedAt = new Date();
  this.providerPaymentId = result.transactionId;
  this.processingFee = result.fee || 0;
  this.settlementStatus = 'pending';
  
  if (result.response) {
    this.providerResponse = result.response;
  }

  await this.save();
  
  // Send success webhook
  await this.sendWebhook('payment.succeeded');
  
  return this;
};

paymentSchema.methods.markAsFailed = async function(result) {
  this.status = 'failed';
  this.failureCode = result.code;
  this.failureMessage = result.message;
  this.declineCode = result.declineCode;

  // Schedule retry if applicable
  if (this.attempts < 3 && this.shouldRetry(result.code)) {
    const retryDelay = Math.pow(2, this.attempts) * 3600000; // Exponential backoff
    this.nextRetryAt = new Date(Date.now() + retryDelay);
    this.status = 'pending';
  }

  await this.save();
  
  // Send failure webhook
  await this.sendWebhook('payment.failed');
  
  return this;
};

paymentSchema.methods.shouldRetry = function(failureCode) {
  const retryableCodes = [
    'network_error',
    'timeout',
    'provider_error',
    'processing_error'
  ];
  
  return retryableCodes.includes(failureCode);
};

paymentSchema.methods.refund = async function(amount, reason) {
  if (!this.canBeRefunded) {
    throw new AppError('Payment cannot be refunded', 400, 'NOT_REFUNDABLE');
  }

  if (amount > this.remainingRefundableAmount) {
    throw new AppError('Refund amount exceeds remaining refundable amount', 400, 'EXCESSIVE_REFUND');
  }

  const refundId = `ref_${Date.now()}`;
  
  if (!this.refunds) {
    this.refunds = [];
  }

  this.refunds.push({
    refundId,
    amount,
    reason,
    status: 'pending',
    createdAt: new Date()
  });

  await this.save();

  // Process refund with provider
  try {
    const result = await this.processRefundWithProvider(refundId, amount);
    
    const refund = this.refunds.find(r => r.refundId === refundId);
    refund.status = 'succeeded';
    refund.processedAt = new Date();
    
    await this.save();
    
    // Send refund webhook
    await this.sendWebhook('payment.refunded');
    
  } catch (error) {
    const refund = this.refunds.find(r => r.refundId === refundId);
    refund.status = 'failed';
    await this.save();
    throw error;
  }

  return this;
};

paymentSchema.methods.processRefundWithProvider = async function(refundId, amount) {
  // This would integrate with actual payment providers
  logger.info('Processing refund with provider', {
    paymentId: this.paymentId,
    refundId,
    amount
  });

  return { success: true };
};

paymentSchema.methods.void = async function(reason, voidedBy) {
  if (this.status !== 'pending') {
    throw new AppError('Only pending payments can be voided', 400, 'INVALID_STATUS');
  }

  this.status = 'cancelled';
  this.voidedBy = {
    userId: voidedBy,
    voidedAt: new Date(),
    reason
  };

  await this.save();
  
  // Send cancellation webhook
  await this.sendWebhook('payment.cancelled');
  
  return this;
};

paymentSchema.methods.capture = async function(amount, capturedBy) {
  if (this.status !== 'authorized') {
    throw new AppError('Payment is not authorized', 400, 'NOT_AUTHORIZED');
  }

  const captureAmount = amount || this.amount;
  
  if (captureAmount > this.amount) {
    throw new AppError('Capture amount exceeds authorized amount', 400, 'EXCESSIVE_CAPTURE');
  }

  // Process capture with provider
  const result = await this.processCaptureWithProvider(captureAmount);
  
  this.status = 'succeeded';
  this.amount = captureAmount;
  this.processedAt = new Date();
  this.capturedBy = {
    userId: capturedBy,
    capturedAt: new Date()
  };

  await this.save();
  
  return this;
};

paymentSchema.methods.processCaptureWithProvider = async function(amount) {
  // This would integrate with actual payment providers
  logger.info('Capturing payment with provider', {
    paymentId: this.paymentId,
    amount
  });

  return { success: true };
};

paymentSchema.methods.createDispute = async function(disputeData) {
  this.status = 'disputed';
  this.dispute = {
    ...disputeData,
    status: 'needs_response',
    createdAt: new Date()
  };

  await this.save();
  
  // Send dispute webhook
  await this.sendWebhook('payment.disputed');
  
  return this;
};

paymentSchema.methods.submitDisputeEvidence = async function(evidence) {
  if (!this.dispute) {
    throw new AppError('No dispute found', 400, 'NO_DISPUTE');
  }

  this.dispute.evidence = evidence;
  this.dispute.status = 'under_review';

  await this.save();
  
  return this;
};

paymentSchema.methods.resolveDispute = async function(outcome) {
  if (!this.dispute) {
    throw new AppError('No dispute found', 400, 'NO_DISPUTE');
  }

  this.dispute.status = outcome; // 'won' or 'lost'
  this.dispute.resolvedAt = new Date();

  if (outcome === 'lost') {
    this.status = 'refunded';
  } else {
    this.status = 'succeeded';
  }

  await this.save();
  
  // Send dispute resolution webhook
  await this.sendWebhook('payment.dispute_resolved');
  
  return this;
};

paymentSchema.methods.performFraudCheck = async function() {
  // Integrate with fraud detection service
  const fraudScore = Math.random() * 100; // Placeholder
  
  this.fraudCheck = {
    checked: true,
    score: fraudScore,
    outcome: fraudScore > 80 ? 'high_risk' : fraudScore > 50 ? 'medium_risk' : 'low_risk',
    flaggedReasons: []
  };

  if (fraudScore > 80) {
    this.fraudCheck.flaggedReasons.push('high_risk_score');
    this.riskLevel = 'high';
  }

  this.riskScore = fraudScore;
  
  await this.save();
  
  return this.fraudCheck;
};

paymentSchema.methods.sendWebhook = async function(event) {
  if (!this.webhooks) {
    this.webhooks = [];
  }

  const webhook = {
    event,
    sentAt: new Date(),
    attempts: 1
  };

  try {
    // Send webhook to configured endpoints
    logger.info('Sending payment webhook', {
      paymentId: this.paymentId,
      event
    });
    
    webhook.response = { status: 'success' };
  } catch (error) {
    webhook.response = { status: 'failed', error: error.message };
  }

  this.webhooks.push(webhook);
  await this.save();
};

// Static methods
paymentSchema.statics.generatePaymentId = async function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pay_${timestamp}${random}`.toUpperCase();
};

paymentSchema.statics.processScheduledPayments = async function() {
  const now = new Date();
  
  const scheduledPayments = await this.find({
    status: 'pending',
    nextRetryAt: { $lte: now }
  }).limit(100);

  let processed = 0;
  
  for (const payment of scheduledPayments) {
    try {
      await payment.process();
      processed++;
    } catch (error) {
      logger.error('Failed to process scheduled payment', {
        paymentId: payment.paymentId,
        error: error.message
      });
    }
  }

  return processed;
};

paymentSchema.statics.getPaymentStatistics = async function(customerId, period) {
  const { startDate, endDate } = period;
  
  const matchQuery = {
    customerId,
    createdAt: { $gte: startDate, $lte: endDate }
  };

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        successfulPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] }
        },
        successfulAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, '$amount', 0] }
        },
        failedPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        refundedAmount: { $sum: '$refundedAmount' },
        processingFees: { $sum: '$processingFee' },
        averagePaymentAmount: { $avg: '$amount' },
        largestPayment: { $max: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        totalPayments: 1,
        totalAmount: { $round: ['$totalAmount', 2] },
        successfulPayments: 1,
        successfulAmount: { $round: ['$successfulAmount', 2] },
        failedPayments: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successfulPayments', '$totalPayments'] },
            100
          ]
        },
        refundedAmount: { $round: ['$refundedAmount', 2] },
        processingFees: { $round: ['$processingFees', 2] },
        averagePaymentAmount: { $round: ['$averagePaymentAmount', 2] },
        largestPayment: { $round: ['$largestPayment', 2] }
      }
    }
  ]);

  return stats[0] || {
    totalPayments: 0,
    totalAmount: 0,
    successfulPayments: 0,
    successfulAmount: 0,
    failedPayments: 0,
    successRate: 0,
    refundedAmount: 0,
    processingFees: 0,
    averagePaymentAmount: 0,
    largestPayment: 0
  };
};

paymentSchema.statics.getSettlementBatch = async function(settlementDate) {
  const startOfDay = new Date(settlementDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(settlementDate);
  endOfDay.setHours(23, 59, 59, 999);

  return await this.find({
    status: 'succeeded',
    settlementStatus: 'pending',
    processedAt: { $gte: startOfDay, $lte: endOfDay }
  });
};

paymentSchema.statics.updateSettlementStatus = async function(paymentIds, status, settlementAmount) {
  return await this.updateMany(
    { _id: { $in: paymentIds } },
    {
      settlementStatus: status,
      settlementDate: new Date(),
      settlementAmount
    }
  );
};

// Create and export model
const PaymentModel = BaseModel.createModel('Payment', paymentSchema);

module.exports = {
  schema: paymentSchema,
  model: PaymentModel
};