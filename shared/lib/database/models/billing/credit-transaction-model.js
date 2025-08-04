'use strict';

/**
 * @fileoverview Credit transaction model for managing account credits and balances
 * @module shared/lib/database/models/billing/credit-transaction-model
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
 * Credit transaction schema definition
 */
const creditTransactionSchemaDefinition = {
  // ==================== Core Identity ====================
  transactionId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `ct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  // ==================== Transaction Details ====================
  type: {
    type: String,
    enum: [
      'credit',      // Adding credits
      'debit',       // Using credits
      'adjustment',  // Manual adjustment
      'refund',      // Refund as credit
      'transfer',    // Transfer between accounts
      'expire',      // Credits expiring
      'purchase',    // Credit purchase
      'promotional', // Promotional credits
      'referral',    // Referral credits
      'cashback'     // Cashback credits
    ],
    required: true,
    index: true
  },

  category: {
    type: String,
    enum: ['operational', 'promotional', 'refund', 'manual', 'system'],
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
    required: true,
    index: true
  },

  // ==================== Amount & Balance ====================
  amount: {
    value: {
      type: Number,
      required: true,
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

  balance: {
    before: {
      type: Number,
      required: true,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    after: {
      type: Number,
      required: true,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    available: {
      type: Number,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    pending: {
      type: Number,
      default: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    }
  },

  // ==================== Related Entities ====================
  relations: {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription'
    },
    referenceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditTransaction'
    },
    transferToOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization'
    },
    transferTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditTransaction'
    }
  },

  // ==================== Transaction Context ====================
  context: {
    reason: {
      type: String,
      required: true
    },
    description: String,
    reference: String,
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    processedAt: Date,
    reversedAt: Date,
    reversalReason: String
  },

  // ==================== Credit Rules ====================
  rules: {
    expiresAt: Date,
    expiredAmount: {
      type: Number,
      default: 0
    },
    restrictions: {
      services: [String],
      products: [String],
      minPurchase: Number,
      maxUsage: Number,
      validFrom: Date,
      validUntil: Date
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    autoApply: {
      type: Boolean,
      default: true
    }
  },

  // ==================== Usage Tracking ====================
  usage: {
    allocations: [{
      allocatedTo: {
        type: String,
        enum: ['invoice', 'subscription', 'service', 'product']
      },
      referenceId: mongoose.Schema.Types.ObjectId,
      amount: Number,
      allocatedAt: Date
    }],
    totalAllocated: {
      type: Number,
      default: 0
    },
    remainingAmount: {
      type: Number,
      default: function() {
        return this.amount.value;
      }
    }
  },

  // ==================== Source Information ====================
  source: {
    type: {
      type: String,
      enum: ['purchase', 'promotional', 'referral', 'refund', 'manual', 'system', 'api'],
      required: true
    },
    reference: String,
    campaign: {
      id: String,
      name: String,
      code: String
    },
    referral: {
      referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      referralCode: String,
      tier: Number
    },
    purchase: {
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
      },
      package: String,
      bonus: Number
    }
  },

  // ==================== Approval Workflow ====================
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'auto_approved'],
      default: 'pending'
    },
    requestedAt: Date,
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    comments: String,
    threshold: {
      amount: Number,
      automatic: Boolean
    }
  },

  // ==================== Notifications ====================
  notifications: {
    sent: [{
      type: {
        type: String,
        enum: ['email', 'sms', 'in_app', 'webhook']
      },
      sentAt: Date,
      template: String,
      recipient: String,
      status: String
    }],
    preferences: {
      onCredit: {
        type: Boolean,
        default: true
      },
      onDebit: {
        type: Boolean,
        default: true
      },
      onExpiry: {
        type: Boolean,
        default: true
      },
      lowBalance: {
        enabled: Boolean,
        threshold: Number
      }
    }
  },

  // ==================== Metadata ====================
  metadata: {
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
    }],
    integration: {
      system: String,
      externalId: String,
      syncedAt: Date
    }
  },

  // ==================== Audit & Compliance ====================
  audit: {
    ipAddress: String,
    userAgent: String,
    location: {
      country: String,
      region: String,
      city: String
    },
    trail: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      details: mongoose.Schema.Types.Mixed
    }]
  },

  compliance: {
    taxable: {
      type: Boolean,
      default: false
    },
    taxRate: Number,
    taxAmount: Number,
    reportable: {
      type: Boolean,
      default: true
    },
    retention: {
      retainUntil: Date,
      reason: String
    }
  }
};

// Create schema
const creditTransactionSchema = BaseModel.createSchema(creditTransactionSchemaDefinition, {
  collection: 'credit_transactions',
  timestamps: true
});

// ==================== Indexes ====================
creditTransactionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
creditTransactionSchema.index({ tenantId: 1, type: 1 });
creditTransactionSchema.index({ status: 1, 'rules.expiresAt': 1 });
creditTransactionSchema.index({ 'relations.invoiceId': 1 });
creditTransactionSchema.index({ 'relations.paymentId': 1 });
creditTransactionSchema.index({ 'source.type': 1, createdAt: -1 });
creditTransactionSchema.index({ 'balance.after': 1 });

// ==================== Virtual Fields ====================
creditTransactionSchema.virtual('isCredit').get(function() {
  return ['credit', 'purchase', 'promotional', 'referral', 'cashback', 'refund'].includes(this.type);
});

creditTransactionSchema.virtual('isDebit').get(function() {
  return ['debit', 'expire', 'transfer'].includes(this.type);
});

creditTransactionSchema.virtual('isExpired').get(function() {
  return this.rules.expiresAt && this.rules.expiresAt < new Date();
});

creditTransactionSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.rules.expiresAt) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((this.rules.expiresAt - new Date()) / msPerDay);
  return Math.max(0, days);
});

creditTransactionSchema.virtual('utilizationRate').get(function() {
  if (this.amount.value === 0) return 0;
  return Math.round((this.usage.totalAllocated / this.amount.value) * 100);
});

creditTransactionSchema.virtual('canBeUsed').get(function() {
  return this.status === 'completed' && 
         !this.isExpired && 
         this.usage.remainingAmount > 0 &&
         this.isCredit;
});

// ==================== Pre-save Middleware ====================
creditTransactionSchema.pre('save', async function(next) {
  try {
    // Calculate balance after for new transactions
    if (this.isNew && this.status === 'pending') {
      const previousBalance = await this.constructor.getCurrentBalance(this.organizationId);
      
      this.balance.before = previousBalance;
      
      if (this.isCredit) {
        this.balance.after = previousBalance + this.amount.value;
      } else {
        this.balance.after = previousBalance - this.amount.value;
        
        // Ensure balance doesn't go negative
        if (this.balance.after < 0) {
          throw new AppError('Insufficient credit balance', 400, 'INSUFFICIENT_BALANCE');
        }
      }
    }

    // Update remaining amount for credits
    if (this.isCredit && this.isModified('usage.allocations')) {
      const totalAllocated = this.usage.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      this.usage.totalAllocated = totalAllocated;
      this.usage.remainingAmount = Math.max(0, this.amount.value - totalAllocated);
    }

    // Check approval requirements
    if (this.isNew && this.amount.value > (this.approval.threshold?.amount || Infinity)) {
      this.approval.required = true;
      this.approval.status = this.approval.threshold?.automatic ? 'auto_approved' : 'pending';
    }

    // Set processed timestamp
    if (this.isModified('status') && this.status === 'completed' && !this.context.processedAt) {
      this.context.processedAt = new Date();
    }

    // Add to audit trail
    if (!this.isNew && this.isModified()) {
      if (!this.audit.trail) {
        this.audit.trail = [];
      }
      
      this.audit.trail.push({
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

// Post-save to update organization balance
creditTransactionSchema.post('save', async function() {
  if (this.status === 'completed') {
    const Organization = mongoose.model('Organization');
    await Organization.findByIdAndUpdate(
      this.organizationId,
      { 
        'billing.credits.balance': this.balance.after,
        'billing.credits.lastTransaction': {
          transactionId: this._id,
          amount: this.amount.value,
          type: this.type,
          date: this.context.processedAt || new Date()
        }
      }
    );
  }
});

// ==================== Instance Methods ====================
creditTransactionSchema.methods.complete = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Transaction is not pending', 400, 'INVALID_STATUS');
  }

  if (this.approval.required && this.approval.status !== 'approved' && this.approval.status !== 'auto_approved') {
    throw new AppError('Transaction requires approval', 400, 'APPROVAL_REQUIRED');
  }

  // Verify balance for debits
  if (this.isDebit) {
    const currentBalance = await this.constructor.getCurrentBalance(this.organizationId);
    if (currentBalance < this.amount.value) {
      throw new AppError('Insufficient credit balance', 400, 'INSUFFICIENT_BALANCE');
    }
    this.balance.before = currentBalance;
    this.balance.after = currentBalance - this.amount.value;
  }

  this.status = 'completed';
  this.context.processedAt = new Date();

  await this.save();

  logger.info('Credit transaction completed', {
    transactionId: this._id,
    organizationId: this.organizationId,
    type: this.type,
    amount: this.amount.value
  });

  // Send notification
  await this.sendNotification('completed');

  return this;
};

creditTransactionSchema.methods.approve = async function(userId, comments) {
  if (!this.approval.required) {
    throw new AppError('Transaction does not require approval', 400, 'NO_APPROVAL_NEEDED');
  }

  if (this.approval.status !== 'pending') {
    throw new AppError('Transaction already reviewed', 400, 'ALREADY_REVIEWED');
  }

  this.approval.status = 'approved';
  this.approval.reviewedAt = new Date();
  this.approval.reviewedBy = userId;
  this.approval.comments = comments;
  this.context.approvedBy = userId;

  await this.save();

  // Auto-complete if configured
  if (this.status === 'pending') {
    await this.complete();
  }

  logger.info('Credit transaction approved', {
    transactionId: this._id,
    approvedBy: userId
  });

  return this;
};

creditTransactionSchema.methods.reject = async function(userId, reason) {
  if (!this.approval.required) {
    throw new AppError('Transaction does not require approval', 400, 'NO_APPROVAL_NEEDED');
  }

  if (this.approval.status !== 'pending') {
    throw new AppError('Transaction already reviewed', 400, 'ALREADY_REVIEWED');
  }

  this.approval.status = 'rejected';
  this.approval.reviewedAt = new Date();
  this.approval.reviewedBy = userId;
  this.approval.comments = reason;
  this.status = 'cancelled';

  await this.save();

  logger.info('Credit transaction rejected', {
    transactionId: this._id,
    rejectedBy: userId,
    reason
  });

  return this;
};

creditTransactionSchema.methods.reverse = async function(reason, userId) {
  if (this.status !== 'completed') {
    throw new AppError('Only completed transactions can be reversed', 400, 'NOT_COMPLETED');
  }

  if (this.type === 'debit' && this.usage.allocations.length > 0) {
    throw new AppError('Cannot reverse debit with allocations', 400, 'HAS_ALLOCATIONS');
  }

  // Create reversal transaction
  const reversalData = {
    organizationId: this.organizationId,
    tenantId: this.tenantId,
    type: this.isCredit ? 'debit' : 'credit',
    category: 'manual',
    amount: {
      value: this.amount.value,
      currency: this.amount.currency
    },
    context: {
      reason: `Reversal: ${reason}`,
      description: `Reversal of transaction ${this.transactionId}`,
      initiatedBy: userId
    },
    relations: {
      referenceTransactionId: this._id
    },
    source: {
      type: 'manual',
      reference: `reversal_${this.transactionId}`
    }
  };

  const reversalTransaction = new this.constructor(reversalData);
  await reversalTransaction.save();
  await reversalTransaction.complete();

  // Update original transaction
  this.status = 'reversed';
  this.context.reversedAt = new Date();
  this.context.reversalReason = reason;
  this.relations.referenceTransactionId = reversalTransaction._id;

  await this.save();

  logger.warn('Credit transaction reversed', {
    originalTransactionId: this._id,
    reversalTransactionId: reversalTransaction._id,
    reason
  });

  return reversalTransaction;
};

creditTransactionSchema.methods.allocate = async function(allocation) {
  if (!this.canBeUsed) {
    throw new AppError('Credits cannot be allocated', 400, 'CANNOT_ALLOCATE');
  }

  const { allocatedTo, referenceId, amount } = allocation;

  if (amount > this.usage.remainingAmount) {
    throw new AppError('Insufficient remaining credits', 400, 'INSUFFICIENT_CREDITS');
  }

  if (!this.usage.allocations) {
    this.usage.allocations = [];
  }

  this.usage.allocations.push({
    allocatedTo,
    referenceId,
    amount,
    allocatedAt: new Date()
  });

  this.usage.totalAllocated += amount;
  this.usage.remainingAmount -= amount;

  await this.save();

  logger.info('Credits allocated', {
    transactionId: this._id,
    allocatedTo,
    referenceId,
    amount
  });

  return this;
};

creditTransactionSchema.methods.transfer = async function(toOrganizationId, amount, reason, userId) {
  if (!this.canBeUsed) {
    throw new AppError('Credits cannot be transferred', 400, 'CANNOT_TRANSFER');
  }

  if (amount > this.usage.remainingAmount) {
    throw new AppError('Insufficient credits for transfer', 400, 'INSUFFICIENT_CREDITS');
  }

  // Create debit transaction for source
  const debitTransaction = new this.constructor({
    organizationId: this.organizationId,
    tenantId: this.tenantId,
    type: 'transfer',
    category: 'operational',
    amount: {
      value: amount,
      currency: this.amount.currency
    },
    context: {
      reason: `Transfer to organization: ${reason}`,
      initiatedBy: userId
    },
    relations: {
      transferToOrganizationId: toOrganizationId
    },
    source: {
      type: 'manual',
      reference: `transfer_from_${this.transactionId}`
    }
  });

  await debitTransaction.save();

  // Create credit transaction for destination
  const creditTransaction = new this.constructor({
    organizationId: toOrganizationId,
    tenantId: this.tenantId,
    type: 'credit',
    category: 'operational',
    amount: {
      value: amount,
      currency: this.amount.currency
    },
    context: {
      reason: `Transfer from organization: ${reason}`,
      initiatedBy: userId
    },
    relations: {
      transferTransactionId: debitTransaction._id
    },
    source: {
      type: 'manual',
      reference: `transfer_to_${this.transactionId}`
    }
  });

  await creditTransaction.save();

  // Link transactions
  debitTransaction.relations.transferTransactionId = creditTransaction._id;
  await debitTransaction.save();

  // Complete both transactions
  await debitTransaction.complete();
  await creditTransaction.complete();

  // Allocate from source credits
  await this.allocate({
    allocatedTo: 'transfer',
    referenceId: debitTransaction._id,
    amount
  });

  logger.info('Credits transferred', {
    fromOrganizationId: this.organizationId,
    toOrganizationId,
    amount,
    debitTransactionId: debitTransaction._id,
    creditTransactionId: creditTransaction._id
  });

  return {
    debitTransaction,
    creditTransaction
  };
};

creditTransactionSchema.methods.expire = async function() {
  if (!this.rules.expiresAt || this.rules.expiresAt > new Date()) {
    throw new AppError('Credits are not expired', 400, 'NOT_EXPIRED');
  }

  if (this.usage.remainingAmount === 0) {
    throw new AppError('No credits to expire', 400, 'NO_CREDITS');
  }

  // Create expiration transaction
  const expirationTransaction = new this.constructor({
    organizationId: this.organizationId,
    tenantId: this.tenantId,
    type: 'expire',
    category: 'system',
    amount: {
      value: this.usage.remainingAmount,
      currency: this.amount.currency
    },
    context: {
      reason: 'Credit expiration',
      description: `Expiration of ${this.usage.remainingAmount} credits from transaction ${this.transactionId}`,
      initiatedBy: this.context.initiatedBy
    },
    relations: {
      referenceTransactionId: this._id
    },
    source: {
      type: 'system',
      reference: `expiration_${this.transactionId}`
    }
  });

  await expirationTransaction.save();
  await expirationTransaction.complete();

  // Update original transaction
  this.rules.expiredAmount = this.usage.remainingAmount;
  this.usage.totalAllocated = this.amount.value;
  this.usage.remainingAmount = 0;

  await this.save();

  logger.info('Credits expired', {
    transactionId: this._id,
    expiredAmount: this.rules.expiredAmount
  });

  return expirationTransaction;
};

creditTransactionSchema.methods.sendNotification = async function(event) {
  const shouldNotify = 
    (event === 'completed' && this.isCredit && this.notifications.preferences.onCredit) ||
    (event === 'completed' && this.isDebit && this.notifications.preferences.onDebit) ||
    (event === 'expiry' && this.notifications.preferences.onExpiry);

  if (!shouldNotify) return;

  if (!this.notifications.sent) {
    this.notifications.sent = [];
  }

  this.notifications.sent.push({
    type: 'email',
    sentAt: new Date(),
    template: `credit_${event}`,
    status: 'sent'
  });

  await this.save();

  logger.info('Credit notification sent', {
    transactionId: this._id,
    event
  });
};

// ==================== Static Methods ====================
creditTransactionSchema.statics.getCurrentBalance = async function(organizationId) {
  const lastTransaction = await this.findOne({
    organizationId,
    status: 'completed'
  })
  .sort({ 'context.processedAt': -1 })
  .select('balance.after');

  return lastTransaction ? lastTransaction.balance.after : 0;
};

creditTransactionSchema.statics.getAvailableCredits = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    status: 'completed',
    type: { $in: ['credit', 'purchase', 'promotional', 'referral', 'cashback', 'refund'] },
    'usage.remainingAmount': { $gt: 0 }
  };

  // Filter by expiration
  if (!options.includeExpired) {
    query.$or = [
      { 'rules.expiresAt': { $exists: false } },
      { 'rules.expiresAt': { $gt: new Date() } }
    ];
  }

  // Filter by restrictions
  if (options.service) {
    query.$or = [
      { 'rules.restrictions.services': { $exists: false } },
      { 'rules.restrictions.services': { $size: 0 } },
      { 'rules.restrictions.services': options.service }
    ];
  }

  const credits = await this.find(query)
    .sort({ 'rules.priority': -1, 'rules.expiresAt': 1, createdAt: 1 });

  const totalAvailable = credits.reduce((sum, credit) => sum + credit.usage.remainingAmount, 0);

  return {
    credits,
    totalAvailable,
    count: credits.length
  };
};

creditTransactionSchema.statics.applyCreditsToInvoice = async function(invoiceId, amount) {
  const Invoice = mongoose.model('Invoice');
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  }

  const availableCredits = await this.getAvailableCredits(invoice.organizationId);
  
  if (availableCredits.totalAvailable < amount) {
    throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS');
  }

  let remainingAmount = amount;
  const allocations = [];

  // Apply credits in order of priority and expiration
  for (const credit of availableCredits.credits) {
    if (remainingAmount === 0) break;

    const allocationAmount = Math.min(remainingAmount, credit.usage.remainingAmount);
    
    await credit.allocate({
      allocatedTo: 'invoice',
      referenceId: invoiceId,
      amount: allocationAmount
    });

    allocations.push({
      creditTransactionId: credit._id,
      amount: allocationAmount
    });

    remainingAmount -= allocationAmount;
  }

  // Apply credits to invoice
  for (const allocation of allocations) {
    await invoice.applyCredit(allocation.amount, allocation.creditTransactionId);
  }

  logger.info('Credits applied to invoice', {
    invoiceId,
    totalAmount: amount,
    allocations: allocations.length
  });

  return allocations;
};

creditTransactionSchema.statics.createCreditPurchase = async function(data) {
  const {
    organizationId,
    amount,
    paymentId,
    package: creditPackage,
    bonus = 0
  } = data;

  const totalCredits = amount + bonus;

  const transaction = new this({
    organizationId,
    tenantId: data.tenantId,
    type: 'purchase',
    category: 'operational',
    status: 'pending',
    amount: {
      value: totalCredits,
      currency: data.currency || 'USD'
    },
    context: {
      reason: 'Credit purchase',
      description: `Purchase of ${amount} credits${bonus > 0 ? ` with ${bonus} bonus credits` : ''}`,
      initiatedBy: data.userId
    },
    relations: {
      paymentId
    },
    source: {
      type: 'purchase',
      purchase: {
        paymentId,
        package: creditPackage,
        bonus
      }
    }
  });

  await transaction.save();

  logger.info('Credit purchase created', {
    transactionId: transaction._id,
    organizationId,
    amount: totalCredits
  });

  return transaction;
};

creditTransactionSchema.statics.getExpiringCredits = async function(daysAhead = 30) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);

  return await this.find({
    status: 'completed',
    type: { $in: ['credit', 'purchase', 'promotional', 'referral', 'cashback'] },
    'usage.remainingAmount': { $gt: 0 },
    'rules.expiresAt': {
      $gte: new Date(),
      $lte: targetDate
    }
  })
  .populate('organizationId')
  .sort({ 'rules.expiresAt': 1 });
};

creditTransactionSchema.statics.getTransactionHistory = async function(organizationId, options = {}) {
  const query = { organizationId };
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.dateRange) {
    query.createdAt = {
      $gte: options.dateRange.start,
      $lte: options.dateRange.end
    };
  }

  const transactions = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .populate('context.initiatedBy', 'name email')
    .populate('relations.invoiceId', 'invoiceNumber');

  const total = await this.countDocuments(query);

  return {
    transactions,
    total,
    hasMore: total > (options.skip || 0) + transactions.length
  };
};

creditTransactionSchema.statics.getCreditMetrics = async function(filters = {}) {
  const match = {
    status: 'completed'
  };
  
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
              totalCredits: {
                $sum: {
                  $cond: [
                    { $in: ['$type', ['credit', 'purchase', 'promotional', 'referral', 'cashback', 'refund']] },
                    '$amount.value',
                    0
                  ]
                }
              },
              totalDebits: {
                $sum: {
                  $cond: [
                    { $in: ['$type', ['debit', 'expire', 'transfer']] },
                    '$amount.value',
                    0
                  ]
                }
              },
              currentBalance: { $last: '$balance.after' },
              transactionCount: { $sum: 1 }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$type',
              amount: { $sum: '$amount.value' },
              count: { $sum: 1 }
            }
          }
        ],
        bySource: [
          {
            $group: {
              _id: '$source.type',
              amount: { $sum: '$amount.value' },
              count: { $sum: 1 }
            }
          }
        ],
        utilization: [
          {
            $match: {
              type: { $in: ['credit', 'purchase', 'promotional', 'referral', 'cashback'] }
            }
          },
          {
            $group: {
              _id: null,
              totalIssued: { $sum: '$amount.value' },
              totalUsed: { $sum: '$usage.totalAllocated' },
              totalExpired: { $sum: '$rules.expiredAmount' }
            }
          }
        ],
        monthlyActivity: [
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
              },
              credits: {
                $sum: {
                  $cond: [
                    { $in: ['$type', ['credit', 'purchase', 'promotional', 'referral', 'cashback', 'refund']] },
                    '$amount.value',
                    0
                  ]
                }
              },
              debits: {
                $sum: {
                  $cond: [
                    { $in: ['$type', ['debit', 'expire', 'transfer']] },
                    '$amount.value',
                    0
                  ]
                }
              }
            }
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 }
        ]
      }
    }
  ]);

  const result = metrics[0];
  const utilization = result.utilization[0] || { totalIssued: 0, totalUsed: 0, totalExpired: 0 };

  return {
    overview: result.overview[0] || {
      totalCredits: 0,
      totalDebits: 0,
      currentBalance: 0,
      transactionCount: 0
    },
    byType: result.byType,
    bySource: result.bySource,
    utilization: {
      ...utilization,
      utilizationRate: utilization.totalIssued > 0 ? 
        Math.round((utilization.totalUsed / utilization.totalIssued) * 100) : 0
    },
    monthlyActivity: result.monthlyActivity.reverse()
  };
};

// Create and export model
const CreditTransactionModel = BaseModel.createModel('CreditTransaction', creditTransactionSchema);

module.exports = {
  schema: creditTransactionSchema,
  model: CreditTransactionModel
};