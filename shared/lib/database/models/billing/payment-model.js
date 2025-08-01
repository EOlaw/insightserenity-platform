'use strict';

/**
 * @fileoverview Payment model for transaction processing and tracking
 * @module shared/lib/database/models/billing/payment-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const encryptionService = require('../../../security/encryption/encryption-service');

/**
 * Payment schema definition
 */
const paymentSchemaDefinition = {
  // ==================== Core Identity ====================
  paymentId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  // ==================== Payment Details ====================
  type: {
    type: String,
    enum: ['charge', 'refund', 'partial_refund', 'chargeback', 'adjustment', 'payout'],
    required: true,
    default: 'charge',
    index: true
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'disputed'],
    required: true,
    default: 'pending',
    index: true
  },

  amount: {
    value: {
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
    exchangeRate: {
      type: Number,
      default: 1
    },
    originalAmount: {
      value: Number,
      currency: String
    }
  },

  // ==================== Related Entities ====================
  relations: {
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
    paymentMethodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      index: true
    },
    parentPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    refunds: [{
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
      },
      amount: Number,
      refundedAt: Date
    }]
  },

  // ==================== Payment Method Details ====================
  method: {
    type: {
      type: String,
      enum: ['card', 'bank_account', 'paypal', 'wire_transfer', 'check', 'cash', 'crypto', 'other'],
      required: true
    },
    brand: String,
    last4: String,
    expiryMonth: Number,
    expiryYear: Number,
    bankName: String,
    accountType: String,
    walletType: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Provider Information ====================
  provider: {
    name: {
      type: String,
      enum: ['stripe', 'paypal', 'square', 'authorize_net', 'manual', 'other'],
      required: true,
      index: true
    },
    transactionId: {
      type: String,
      index: true
    },
    chargeId: String,
    paymentIntentId: String,
    customerId: String,
    paymentMethodId: String,
    response: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    metadata: mongoose.Schema.Types.Mixed
  },

  // ==================== Transaction Details ====================
  transaction: {
    processedAt: Date,
    settledAt: Date,
    capturedAt: Date,
    description: String,
    statementDescriptor: String,
    receiptUrl: String,
    receiptNumber: String,
    authorizationCode: String,
    networkTransactionId: String,
    processingFees: {
      amount: {
        type: Number,
        default: 0
      },
      currency: String,
      percentage: Number,
      fixed: Number
    },
    net: {
      amount: Number,
      currency: String
    }
  },

  // ==================== Risk & Fraud ====================
  risk: {
    level: {
      type: String,
      enum: ['low', 'medium', 'high', 'blocked'],
      default: 'low'
    },
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    factors: [{
      factor: String,
      risk: String,
      details: String
    }],
    checks: {
      addressLine: String,
      addressPostalCode: String,
      cvcCheck: String,
      avsCheck: String,
      fraudCheck: String
    },
    outcome: {
      decision: String,
      reason: String,
      riskLevel: String,
      rule: String
    },
    ipAddress: String,
    ipCountry: String,
    userAgent: String,
    deviceFingerprint: String
  },

  // ==================== Customer Information ====================
  customer: {
    name: String,
    email: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return validators.isEmail(value);
        },
        message: 'Invalid email address'
      }
    },
    phone: String,
    billingAddress: {
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    shippingAddress: {
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    customerId: String
  },

  // ==================== Refund Information ====================
  refundInfo: {
    reason: {
      type: String,
      enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'not_received', 'defective', 'other']
    },
    description: String,
    amount: Number,
    refundedAt: Date,
    receiptNumber: String,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // ==================== Dispute Information ====================
  disputeInfo: {
    status: {
      type: String,
      enum: ['warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'charge_refunded', 'won', 'lost']
    },
    reason: {
      type: String,
      enum: ['duplicate', 'fraudulent', 'subscription_canceled', 'product_unacceptable', 'product_not_received', 'unrecognized', 'credit_not_processed', 'general', 'incorrect_account_details', 'insufficient_funds', 'bank_cannot_process', 'debit_not_authorized', 'customer_initiated']
    },
    amount: Number,
    currency: String,
    evidence: {
      submitted: Boolean,
      submittedAt: Date,
      dueBy: Date,
      documents: [{
        type: String,
        url: String,
        uploadedAt: Date
      }]
    },
    outcome: {
      status: String,
      reason: String,
      decidedAt: Date
    }
  },

  // ==================== Reconciliation ====================
  reconciliation: {
    status: {
      type: String,
      enum: ['pending', 'matched', 'unmatched', 'disputed', 'resolved'],
      default: 'pending'
    },
    matchedAt: Date,
    matchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bankReference: String,
    bankStatementDate: Date,
    notes: String,
    discrepancy: {
      amount: Number,
      reason: String,
      resolvedAt: Date
    }
  },

  // ==================== Notifications ====================
  notifications: {
    webhooks: [{
      event: String,
      sentAt: Date,
      success: Boolean,
      response: String
    }],
    emails: [{
      type: String,
      sentTo: [String],
      sentAt: Date,
      template: String
    }],
    retries: [{
      attemptNumber: Number,
      attemptedAt: Date,
      success: Boolean,
      error: String
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['web', 'api', 'mobile', 'recurring', 'manual', 'import'],
      default: 'web'
    },
    channel: String,
    campaign: String,
    referrer: String,
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
      internal: {
        type: Boolean,
        default: true
      }
    }]
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    pciCompliant: {
      type: Boolean,
      default: true
    },
    dataRetention: {
      retainUntil: Date,
      reason: String
    },
    regulations: {
      gdpr: {
        consented: Boolean,
        consentDate: Date
      },
      psd2: {
        strongAuthentication: Boolean,
        exemption: String
      }
    },
    audit: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      details: mongoose.Schema.Types.Mixed,
      ipAddress: String
    }]
  },

  // ==================== Error Handling ====================
  error: {
    code: String,
    message: String,
    type: {
      type: String,
      enum: ['card_error', 'invalid_request', 'api_error', 'authentication_error', 'rate_limit', 'payment_method_error', 'network_error']
    },
    declineCode: String,
    param: String,
    raw: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    attempts: [{
      attemptedAt: Date,
      errorCode: String,
      errorMessage: String
    }]
  }
};

// Create schema
const paymentSchema = BaseModel.createSchema(paymentSchemaDefinition, {
  collection: 'payments',
  timestamps: true
});

// ==================== Indexes ====================
paymentSchema.index({ organizationId: 1, status: 1 });
paymentSchema.index({ tenantId: 1, status: 1 });
paymentSchema.index({ 'provider.name': 1, 'provider.transactionId': 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ 'relations.invoiceId': 1 });
paymentSchema.index({ 'relations.subscriptionId': 1 });
paymentSchema.index({ 'transaction.processedAt': -1 });
paymentSchema.index({ 'reconciliation.status': 1 });

// ==================== Virtual Fields ====================
paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'succeeded';
});

paymentSchema.virtual('isFailed').get(function() {
  return ['failed', 'cancelled'].includes(this.status);
});

paymentSchema.virtual('isRefunded').get(function() {
  return this.status === 'refunded' || 
         (this.relations.refunds && this.relations.refunds.length > 0);
});

paymentSchema.virtual('refundedAmount').get(function() {
  if (!this.relations.refunds || this.relations.refunds.length === 0) return 0;
  return this.relations.refunds.reduce((sum, refund) => sum + refund.amount, 0);
});

paymentSchema.virtual('netAmount').get(function() {
  const refunded = this.refundedAmount;
  const fees = this.transaction.processingFees?.amount || 0;
  return this.amount.value - refunded - fees;
});

paymentSchema.virtual('canRefund').get(function() {
  return this.status === 'succeeded' && 
         this.refundedAmount < this.amount.value &&
         this.type === 'charge';
});

// ==================== Pre-save Middleware ====================
paymentSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive data
    if (this.isModified('provider.response') && this.provider.response) {
      this.provider.response = await encryptionService.encrypt(
        JSON.stringify(this.provider.response)
      );
    }

    // Calculate net amount
    if (this.isModified('amount') || this.isModified('transaction.processingFees')) {
      const fees = this.transaction.processingFees?.amount || 0;
      this.transaction.net = {
        amount: this.amount.value - fees,
        currency: this.amount.currency
      };
    }

    // Update processed timestamp
    if (this.isModified('status')) {
      if (this.status === 'succeeded' && !this.transaction.processedAt) {
        this.transaction.processedAt = new Date();
      }
    }

    // Add to audit log
    if (!this.isNew && this.isModified()) {
      if (!this.compliance.audit) {
        this.compliance.audit = [];
      }
      
      this.compliance.audit.push({
        action: 'update',
        performedAt: new Date(),
        details: {
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
paymentSchema.methods.process = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Payment is not in pending status', 400, 'INVALID_STATUS');
  }

  this.status = 'processing';
  await this.save();

  try {
    // Process with provider (would integrate with actual payment provider)
    // This is a placeholder for actual payment processing logic
    
    this.status = 'succeeded';
    this.transaction.processedAt = new Date();
    
    // Generate receipt number
    this.transaction.receiptNumber = await this.constructor.generateReceiptNumber();
    
    await this.save();
    
    logger.info('Payment processed successfully', {
      paymentId: this._id,
      amount: this.amount.value,
      provider: this.provider.name
    });
    
    // Update related invoice if exists
    if (this.relations.invoiceId) {
      const Invoice = mongoose.model('Invoice');
      const invoice = await Invoice.findById(this.relations.invoiceId);
      if (invoice) {
        await invoice.recordPayment({
          amount: this.amount.value,
          paymentId: this._id,
          method: this.method.type,
          reference: this.provider.transactionId
        });
      }
    }
    
    // Update subscription if exists
    if (this.relations.subscriptionId) {
      const Subscription = mongoose.model('Subscription');
      const subscription = await Subscription.findById(this.relations.subscriptionId);
      if (subscription) {
        await subscription.recordPayment(this._id, this.amount.value);
      }
    }
    
  } catch (error) {
    this.status = 'failed';
    this.error = {
      code: error.code || 'processing_error',
      message: error.message,
      type: 'api_error'
    };
    
    await this.save();
    
    logger.error('Payment processing failed', {
      paymentId: this._id,
      error: error.message
    });
    
    throw error;
  }
  
  return this;
};

paymentSchema.methods.refund = async function(amount, reason, userId) {
  if (!this.canRefund) {
    throw new AppError('Payment cannot be refunded', 400, 'CANNOT_REFUND');
  }

  const refundAmount = amount || this.amount.value - this.refundedAmount;
  
  if (refundAmount > this.amount.value - this.refundedAmount) {
    throw new AppError('Refund amount exceeds available amount', 400, 'EXCESS_REFUND');
  }

  // Create refund payment
  const refundPayment = new this.constructor({
    organizationId: this.organizationId,
    tenantId: this.tenantId,
    type: amount < this.amount.value ? 'partial_refund' : 'refund',
    status: 'pending',
    amount: {
      value: refundAmount,
      currency: this.amount.currency
    },
    relations: {
      parentPaymentId: this._id,
      invoiceId: this.relations.invoiceId,
      subscriptionId: this.relations.subscriptionId,
      paymentMethodId: this.relations.paymentMethodId
    },
    method: this.method,
    provider: {
      name: this.provider.name,
      customerId: this.provider.customerId
    },
    refundInfo: {
      reason,
      description: `Refund for payment ${this.paymentId}`,
      processedBy: userId,
      refundedAt: new Date()
    },
    customer: this.customer
  });

  await refundPayment.save();

  // Update original payment
  if (!this.relations.refunds) {
    this.relations.refunds = [];
  }
  
  this.relations.refunds.push({
    paymentId: refundPayment._id,
    amount: refundAmount,
    refundedAt: new Date()
  });

  if (this.refundedAmount >= this.amount.value) {
    this.status = 'refunded';
  }

  await this.save();

  // Process the refund
  await refundPayment.process();

  logger.info('Payment refunded', {
    originalPaymentId: this._id,
    refundPaymentId: refundPayment._id,
    amount: refundAmount,
    reason
  });

  return refundPayment;
};

paymentSchema.methods.dispute = async function(disputeData) {
  if (this.status !== 'succeeded') {
    throw new AppError('Only successful payments can be disputed', 400, 'INVALID_STATUS');
  }

  this.status = 'disputed';
  this.disputeInfo = {
    ...disputeData,
    status: 'needs_response'
  };

  await this.save();

  logger.warn('Payment disputed', {
    paymentId: this._id,
    reason: disputeData.reason
  });

  return this;
};

paymentSchema.methods.submitEvidence = async function(evidence) {
  if (this.status !== 'disputed') {
    throw new AppError('Payment is not disputed', 400, 'NOT_DISPUTED');
  }

  if (!this.disputeInfo.evidence) {
    this.dispute.evidence = {
      documents: []
    };
  }

  this.disputeInfo.evidence.documents.push(...evidence.documents);
  this.disputeInfo.vidence.submitted = true;
  this.disputeInfo.evidence.submittedAt = new Date();
  this.disputeInfo.status = 'under_review';

  await this.save();

  logger.info('Dispute evidence submitted', {
    paymentId: this._id,
    documentsCount: evidence.documents.length
  });

  return this;
};

paymentSchema.methods.reconcile = async function(bankReference, userId) {
  this.reconciliation.status = 'matched';
  this.reconciliation.matchedAt = new Date();
  this.reconciliation.matchedBy = userId;
  this.reconciliation.bankReference = bankReference;

  await this.save();

  logger.info('Payment reconciled', {
    paymentId: this._id,
    bankReference
  });

  return this;
};

paymentSchema.methods.addNote = async function(content, userId, internal = true) {
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }

  this.metadata.notes.push({
    content,
    addedBy: userId,
    addedAt: new Date(),
    internal
  });

  await this.save();

  return this;
};

paymentSchema.methods.retry = async function() {
  if (!['failed', 'cancelled'].includes(this.status)) {
    throw new AppError('Only failed payments can be retried', 400, 'INVALID_STATUS');
  }

  // Record retry attempt
  if (!this.error.attempts) {
    this.error.attempts = [];
  }

  this.error.attempts.push({
    attemptedAt: new Date(),
    errorCode: this.error.code,
    errorMessage: this.error.message
  });

  // Reset status and try again
  this.status = 'pending';
  this.error = {};

  await this.save();

  // Process the payment
  return await this.process();
};

// ==================== Static Methods ====================
paymentSchema.statics.generateReceiptNumber = async function() {
  const prefix = 'RCP';
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  
  return `${prefix}-${year}${month}-${random}`;
};

paymentSchema.statics.createPayment = async function(data) {
  const {
    organizationId,
    amount,
    currency = 'USD',
    paymentMethodId,
    invoiceId,
    subscriptionId,
    description
  } = data;

  // Get organization
  const Organization = mongoose.model('Organization');
  const organization = await Organization.findById(organizationId);
  
  if (!organization) {
    throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
  }

  // Get payment method
  const PaymentMethod = mongoose.model('PaymentMethod');
  const paymentMethod = await PaymentMethod.findById(paymentMethodId);
  
  if (!paymentMethod || paymentMethod.organizationId.toString() !== organizationId.toString()) {
    throw new AppError('Invalid payment method', 400, 'INVALID_PAYMENT_METHOD');
  }

  const payment = new this({
    organizationId,
    tenantId: organization.tenancy?.tenantId,
    type: 'charge',
    status: 'pending',
    amount: {
      value: amount,
      currency
    },
    relations: {
      paymentMethodId,
      invoiceId,
      subscriptionId
    },
    method: {
      type: paymentMethod.type,
      brand: paymentMethod.details.brand,
      last4: paymentMethod.details.last4
    },
    provider: {
      name: paymentMethod.provider,
      customerId: paymentMethod.providerCustomerId
    },
    transaction: {
      description: description || `Payment from ${organization.name}`
    },
    customer: {
      name: organization.contact.name || organization.name,
      email: organization.contact.email,
      billingAddress: organization.address
    }
  });

  await payment.save();

  logger.info('Payment created', {
    paymentId: payment._id,
    organizationId,
    amount,
    currency
  });

  return payment;
};

paymentSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { organizationId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.dateRange) {
    query.createdAt = {
      $gte: options.dateRange.start,
      $lte: options.dateRange.end
    };
  }

  const payments = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .populate('relations.invoiceId relations.subscriptionId');

  const total = await this.countDocuments(query);

  return {
    payments,
    total,
    hasMore: total > (options.skip || 0) + payments.length
  };
};

paymentSchema.statics.findFailedPayments = async function(options = {}) {
  const query = {
    status: 'failed',
    type: 'charge'
  };
  
  if (options.tenantId) {
    query.tenantId = options.tenantId;
  }
  
  if (options.retriable) {
    query['error.type'] = { $ne: 'card_error' };
    query['error.attempts'] = { $size: { $lt: 3 } };
  }

  return await this.find(query)
    .sort({ createdAt: -1 })
    .populate('organizationId relations.invoiceId');
};

paymentSchema.statics.getPaymentMetrics = async function(filters = {}) {
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
              totalVolume: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', 'succeeded'] },
                    '$amount.value',
                    0
                  ]
                }
              },
              successCount: {
                $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] }
              },
              failedCount: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
              },
              refundedVolume: {
                $sum: {
                  $cond: [
                    { $in: ['$type', ['refund', 'partial_refund']] },
                    '$amount.value',
                    0
                  ]
                }
              },
              averageAmount: {
                $avg: {
                  $cond: [
                    { $eq: ['$status', 'succeeded'] },
                    '$amount.value',
                    null
                  ]
                }
              }
            }
          }
        ],
        byMethod: [
          {
            $match: { status: 'succeeded' }
          },
          {
            $group: {
              _id: '$method.type',
              volume: { $sum: '$amount.value' },
              count: { $sum: 1 }
            }
          }
        ],
        byProvider: [
          {
            $group: {
              _id: '$provider.name',
              volume: { $sum: '$amount.value' },
              count: { $sum: 1 },
              successRate: {
                $avg: {
                  $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0]
                }
              }
            }
          }
        ],
        hourlyVolume: [
          {
            $match: {
              status: 'succeeded',
              createdAt: {
                $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
              }
            }
          },
          {
            $group: {
              _id: {
                hour: { $hour: '$createdAt' }
              },
              volume: { $sum: '$amount.value' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.hour': 1 } }
        ],
        failureReasons: [
          {
            $match: { status: 'failed' }
          },
          {
            $group: {
              _id: '$error.code',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);

  const result = metrics[0];

  return {
    overview: result.overview[0] || {
      totalVolume: 0,
      successCount: 0,
      failedCount: 0,
      refundedVolume: 0,
      averageAmount: 0
    },
    successRate: result.overview[0] ? 
      (result.overview[0].successCount / (result.overview[0].successCount + result.overview[0].failedCount) * 100).toFixed(2) : 0,
    byMethod: result.byMethod,
    byProvider: result.byProvider,
    hourlyVolume: result.hourlyVolume,
    failureReasons: result.failureReasons
  };
};

// Create and export model
const PaymentModel = BaseModel.createModel('Payment', paymentSchema);

module.exports = {
  schema: paymentSchema,
  model: PaymentModel
};