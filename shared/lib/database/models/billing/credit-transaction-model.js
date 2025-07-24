'use strict';

/**
 * @fileoverview Credit transaction model for tracking account credits and debits
 * @module shared/lib/database/models/billing/credit-transaction-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/status-codes
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const { TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../../../utils/constants/status-codes');

/**
 * Credit transaction schema definition
 */
const creditTransactionSchemaDefinition = {
  // Transaction Details
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  type: {
    type: String,
    required: true,
    enum: ['credit', 'debit', 'refund', 'adjustment', 'transfer'],
    index: true
  },

  category: {
    type: String,
    required: true,
    enum: ['purchase', 'usage', 'bonus', 'refund', 'penalty', 'adjustment', 'subscription', 'transfer']
  },

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

  // Account Information
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  accountType: {
    type: String,
    required: true,
    enum: ['user', 'organization', 'tenant']
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Balance Tracking
  previousBalance: {
    type: Number,
    required: true,
    default: 0
  },

  newBalance: {
    type: Number,
    required: true
  },

  // Transaction Source
  source: {
    type: {
      type: String,
      enum: ['payment', 'invoice', 'subscription', 'api_usage', 'manual', 'system', 'transfer']
    },
    referenceId: mongoose.Schema.Types.ObjectId,
    referenceModel: String,
    metadata: mongoose.Schema.Types.Mixed
  },

  // Description and Notes
  description: {
    type: String,
    required: true,
    maxlength: 500
  },

  internalNotes: {
    type: String,
    maxlength: 1000,
    select: false
  },

  // Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
    index: true
  },

  failureReason: String,

  // Processing Information
  processedAt: Date,
  reversedAt: Date,
  reversalTransactionId: String,

  // Metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    apiKey: String,
    clientId: String,
    sessionId: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  },

  // Audit
  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['user', 'admin', 'system']
    },
    username: String
  },

  approvedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    username: String,
    approvedAt: Date
  },

  // Expiration
  expiresAt: Date,
  expiredCredits: {
    type: Number,
    default: 0
  }
};

// Create schema
const creditTransactionSchema = BaseModel.createSchema(creditTransactionSchemaDefinition, {
  collection: 'credit_transactions',
  timestamps: true
});

// Indexes
creditTransactionSchema.index({ accountId: 1, createdAt: -1 });
creditTransactionSchema.index({ organizationId: 1, type: 1, status: 1 });
creditTransactionSchema.index({ status: 1, processedAt: 1 });
creditTransactionSchema.index({ 'source.type': 1, 'source.referenceId': 1 });
creditTransactionSchema.index({ expiresAt: 1 }, { sparse: true });

// Virtual fields
creditTransactionSchema.virtual('isProcessed').get(function() {
  return this.status === 'completed' && this.processedAt;
});

creditTransactionSchema.virtual('isReversible').get(function() {
  return this.status === 'completed' && 
         !this.reversedAt && 
         ['credit', 'debit'].includes(this.type);
});

creditTransactionSchema.virtual('netAmount').get(function() {
  if (this.type === 'debit') {
    return -Math.abs(this.amount);
  }
  return Math.abs(this.amount);
});

// Pre-save middleware
creditTransactionSchema.pre('save', async function(next) {
  try {
    // Generate transaction ID if not provided
    if (!this.transactionId) {
      this.transactionId = await this.constructor.generateTransactionId();
    }

    // Calculate new balance
    if (this.isNew) {
      const netAmount = this.netAmount;
      this.newBalance = this.previousBalance + netAmount;

      // Validate balance doesn't go negative
      if (this.newBalance < 0 && this.type === 'debit') {
        throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS');
      }
    }

    // Auto-complete pending transactions
    if (this.isModified('status') && this.status === 'completed' && !this.processedAt) {
      this.processedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
creditTransactionSchema.post('save', async function() {
  try {
    // Log significant transactions
    if (this.amount > 1000 || this.type === 'refund') {
      logger.info('Significant credit transaction', {
        transactionId: this.transactionId,
        type: this.type,
        amount: this.amount,
        accountId: this.accountId
      });
    }
  } catch (error) {
    logger.error('Error in credit transaction post-save', error);
  }
});

// Instance methods
creditTransactionSchema.methods.process = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Transaction already processed', 400, 'ALREADY_PROCESSED');
  }

  this.status = 'completed';
  this.processedAt = new Date();
  
  await this.save();
  
  // Update account balance
  await this.constructor.updateAccountBalance(this.accountId, this.accountType, this.newBalance);
  
  return this;
};

creditTransactionSchema.methods.reverse = async function(reason, reversedBy) {
  if (!this.isReversible) {
    throw new AppError('Transaction cannot be reversed', 400, 'NOT_REVERSIBLE');
  }

  // Create reversal transaction
  const reversalTransaction = await this.constructor.create({
    type: this.type === 'credit' ? 'debit' : 'credit',
    category: 'refund',
    amount: this.amount,
    currency: this.currency,
    accountId: this.accountId,
    accountType: this.accountType,
    organizationId: this.organizationId,
    userId: this.userId,
    previousBalance: this.newBalance,
    description: `Reversal of transaction ${this.transactionId}: ${reason}`,
    source: {
      type: 'manual',
      referenceId: this._id,
      referenceModel: 'CreditTransaction',
      metadata: { originalTransactionId: this.transactionId, reason }
    },
    status: 'completed',
    processedAt: new Date(),
    createdBy: reversedBy
  });

  // Mark original transaction as reversed
  this.reversedAt = new Date();
  this.reversalTransactionId = reversalTransaction.transactionId;
  await this.save();

  return reversalTransaction;
};

creditTransactionSchema.methods.cancel = async function(reason) {
  if (this.status !== 'pending') {
    throw new AppError('Only pending transactions can be cancelled', 400, 'INVALID_STATUS');
  }

  this.status = 'cancelled';
  this.failureReason = reason;
  await this.save();
  
  return this;
};

// Static methods
creditTransactionSchema.statics.generateTransactionId = async function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TXN-${timestamp}-${random}`.toUpperCase();
};

creditTransactionSchema.statics.createCredit = async function(data) {
  const transaction = await this.create({
    ...data,
    type: 'credit',
    status: 'pending'
  });

  return await transaction.process();
};

creditTransactionSchema.statics.createDebit = async function(data) {
  // Check sufficient balance
  const currentBalance = await this.getAccountBalance(data.accountId, data.accountType);
  
  if (currentBalance < data.amount) {
    throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS');
  }

  const transaction = await this.create({
    ...data,
    type: 'debit',
    previousBalance: currentBalance,
    status: 'pending'
  });

  return await transaction.process();
};

creditTransactionSchema.statics.getAccountBalance = async function(accountId, accountType) {
  const lastTransaction = await this.findOne({
    accountId,
    accountType,
    status: 'completed'
  }).sort({ processedAt: -1 });

  return lastTransaction ? lastTransaction.newBalance : 0;
};

creditTransactionSchema.statics.updateAccountBalance = async function(accountId, accountType, newBalance) {
  // This would update the actual account model
  // Implementation depends on account structure
  logger.info('Account balance updated', { accountId, accountType, newBalance });
};

creditTransactionSchema.statics.getTransactionHistory = async function(accountId, options = {}) {
  const {
    startDate,
    endDate,
    type,
    status = 'completed',
    limit = 50,
    skip = 0
  } = options;

  const query = { accountId, status };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  if (type) {
    query.type = type;
  }

  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'email profile.fullName')
    .populate('organizationId', 'name');
};

creditTransactionSchema.statics.getBalanceSummary = async function(accountId, accountType) {
  const [summary] = await this.aggregate([
    {
      $match: {
        accountId: mongoose.Types.ObjectId(accountId),
        accountType,
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalCredits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0]
          }
        },
        totalDebits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0]
          }
        },
        totalRefunds: {
          $sum: {
            $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0]
          }
        },
        transactionCount: { $sum: 1 },
        lastTransactionDate: { $max: '$processedAt' }
      }
    },
    {
      $project: {
        _id: 0,
        totalCredits: 1,
        totalDebits: 1,
        totalRefunds: 1,
        transactionCount: 1,
        lastTransactionDate: 1,
        currentBalance: {
          $subtract: [
            { $add: ['$totalCredits', '$totalRefunds'] },
            '$totalDebits'
          ]
        }
      }
    }
  ]);

  return summary || {
    totalCredits: 0,
    totalDebits: 0,
    totalRefunds: 0,
    transactionCount: 0,
    currentBalance: 0,
    lastTransactionDate: null
  };
};

creditTransactionSchema.statics.expireCredits = async function() {
  const now = new Date();
  
  const expiredTransactions = await this.find({
    status: 'completed',
    expiresAt: { $lte: now },
    expiredCredits: 0
  });

  for (const transaction of expiredTransactions) {
    const currentBalance = await this.getAccountBalance(
      transaction.accountId,
      transaction.accountType
    );

    // Create expiration debit
    await this.createDebit({
      category: 'adjustment',
      amount: Math.min(transaction.amount, currentBalance),
      currency: transaction.currency,
      accountId: transaction.accountId,
      accountType: transaction.accountType,
      organizationId: transaction.organizationId,
      description: `Credit expiration for transaction ${transaction.transactionId}`,
      source: {
        type: 'system',
        referenceId: transaction._id,
        referenceModel: 'CreditTransaction'
      },
      createdBy: {
        userType: 'system',
        username: 'credit-expiration-service'
      }
    });

    // Mark credits as expired
    transaction.expiredCredits = transaction.amount;
    await transaction.save();
  }

  return expiredTransactions.length;
};

// Create and export model
const CreditTransactionModel = BaseModel.createModel('CreditTransaction', creditTransactionSchema);

module.exports = {
  schema: creditTransactionSchema,
  model: CreditTransactionModel
};