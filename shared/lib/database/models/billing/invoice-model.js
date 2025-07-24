'use strict';

/**
 * @fileoverview Invoice model for billing and payment tracking
 * @module shared/lib/database/models/billing/invoice-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/formatters/currency-formatter
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const stringHelper = require('../../../utils/helpers/string-helper');
const currencyFormatter = require('../../../utils/formatters/currency-formatter');

/**
 * Invoice schema definition
 */
const invoiceSchemaDefinition = {
  // Invoice Identification
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  dueDate: {
    type: Date,
    required: true,
    index: true
  },

  // Billing Entities
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

  // Customer Details (Snapshot at invoice time)
  billingDetails: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
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

  // Invoice Items
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    productType: {
      type: String,
      enum: ['subscription', 'service', 'credit', 'usage', 'addon', 'one_time']
    },
    description: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      amount: {
        type: Number,
        default: 0
      },
      percentage: {
        type: Number,
        min: 0,
        max: 100
      },
      reason: String
    },
    tax: {
      rate: {
        type: Number,
        min: 0,
        max: 100
      },
      amount: {
        type: Number,
        default: 0
      }
    },
    metadata: mongoose.Schema.Types.Mixed,
    periodStart: Date,
    periodEnd: Date
  }],

  // Pricing
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY']
  },

  subtotal: {
    type: Number,
    required: true,
    min: 0
  },

  totalDiscount: {
    type: Number,
    default: 0,
    min: 0
  },

  totalTax: {
    type: Number,
    default: 0,
    min: 0
  },

  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },

  // Payment Information
  paymentStatus: {
    type: String,
    required: true,
    enum: ['draft', 'pending', 'paid', 'partial', 'overdue', 'cancelled', 'refunded', 'written_off'],
    default: 'draft',
    index: true
  },

  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },

  amountDue: {
    type: Number,
    required: true,
    min: 0
  },

  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'check', 'cash', 'credit', 'other']
  },

  paymentTerms: {
    type: String,
    enum: ['immediate', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'],
    default: 'net_30'
  },

  // Payment Tracking
  payments: [{
    paymentId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    paymentDate: Date,
    paymentMethod: String,
    transactionId: String,
    notes: String
  }],

  lastPaymentDate: Date,
  paidAt: Date,

  // Subscription Link
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    index: true
  },

  billingPeriod: {
    start: Date,
    end: Date
  },

  // Status and Workflow
  status: {
    type: String,
    required: true,
    enum: ['draft', 'pending_approval', 'approved', 'sent', 'viewed', 'paid', 'cancelled', 'refunded'],
    default: 'draft',
    index: true
  },

  sentAt: Date,
  viewedAt: Date,
  remindersSent: [{
    sentAt: Date,
    type: {
      type: String,
      enum: ['email', 'sms', 'in_app']
    },
    recipient: String
  }],

  // Refunds
  refunds: [{
    refundId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    refundDate: Date,
    reason: String,
    processedBy: mongoose.Schema.Types.ObjectId
  }],

  totalRefunded: {
    type: Number,
    default: 0,
    min: 0
  },

  // Notes and Metadata
  notes: {
    type: String,
    maxlength: 2000
  },

  internalNotes: {
    type: String,
    maxlength: 2000,
    select: false
  },

  metadata: {
    source: {
      type: String,
      enum: ['manual', 'subscription', 'api', 'import', 'recurring']
    },
    ipAddress: String,
    userAgent: String,
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed
  },

  // Accounting
  accountingPeriod: {
    month: Number,
    year: Number,
    quarter: Number
  },

  glCode: String,
  costCenter: String,

  // Document Management
  attachments: [{
    filename: String,
    url: String,
    mimeType: String,
    size: Number,
    uploadedAt: Date
  }],

  pdfUrl: String,
  publicUrl: String,

  // Audit Trail
  approvedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    approvedAt: Date
  },

  cancelledBy: {
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    cancelledAt: Date,
    reason: String
  },

  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['user', 'admin', 'system']
    },
    name: String
  },

  // Dispute Management
  dispute: {
    status: {
      type: String,
      enum: ['none', 'pending', 'resolved', 'escalated']
    },
    reason: String,
    createdAt: Date,
    resolvedAt: Date,
    resolution: String
  }
};

// Create schema
const invoiceSchema = BaseModel.createSchema(invoiceSchemaDefinition, {
  collection: 'invoices',
  timestamps: true
});

// Indexes
invoiceSchema.index({ customerId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, status: 1, paymentStatus: 1 });
invoiceSchema.index({ dueDate: 1, paymentStatus: 1 });
invoiceSchema.index({ 'accountingPeriod.year': 1, 'accountingPeriod.month': 1 });

// Virtual fields
invoiceSchema.virtual('isOverdue').get(function() {
  return this.paymentStatus === 'pending' && 
         this.dueDate < new Date() && 
         this.amountDue > 0;
});

invoiceSchema.virtual('daysPastDue').get(function() {
  if (!this.isOverdue) return 0;
  const now = new Date();
  const diffTime = Math.abs(now - this.dueDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

invoiceSchema.virtual('isPaid').get(function() {
  return this.paymentStatus === 'paid' && this.amountDue === 0;
});

invoiceSchema.virtual('formattedInvoiceNumber').get(function() {
  return `INV-${this.invoiceNumber}`;
});

// Pre-save middleware
invoiceSchema.pre('save', async function(next) {
  try {
    // Generate invoice number if not provided
    if (!this.invoiceNumber && this.isNew) {
      this.invoiceNumber = await this.constructor.generateInvoiceNumber();
    }

    // Calculate amounts
    if (this.isModified('items')) {
      this.subtotal = 0;
      this.totalDiscount = 0;
      this.totalTax = 0;

      for (const item of this.items) {
        // Calculate item amount
        item.amount = item.unitPrice * item.quantity;
        
        // Apply discount
        if (item.discount) {
          if (item.discount.percentage) {
            item.discount.amount = item.amount * (item.discount.percentage / 100);
          }
          item.amount -= item.discount.amount || 0;
          this.totalDiscount += item.discount.amount || 0;
        }

        // Calculate tax
        if (item.tax && item.tax.rate) {
          item.tax.amount = item.amount * (item.tax.rate / 100);
          this.totalTax += item.tax.amount;
        }

        this.subtotal += item.amount;
      }

      this.totalAmount = this.subtotal + this.totalTax;
      this.amountDue = this.totalAmount - this.amountPaid;
    }

    // Update payment status based on amounts
    if (this.isModified('amountPaid') || this.isModified('totalAmount')) {
      if (this.amountPaid >= this.totalAmount) {
        this.paymentStatus = 'paid';
        this.amountDue = 0;
        if (!this.paidAt) {
          this.paidAt = new Date();
        }
      } else if (this.amountPaid > 0) {
        this.paymentStatus = 'partial';
        this.amountDue = this.totalAmount - this.amountPaid;
      } else if (this.status === 'sent' && this.dueDate < new Date()) {
        this.paymentStatus = 'overdue';
      }
    }

    // Set accounting period
    if (!this.accountingPeriod && this.invoiceDate) {
      const date = new Date(this.invoiceDate);
      this.accountingPeriod = {
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        quarter: Math.floor(date.getMonth() / 3) + 1
      };
    }

    // Calculate due date if not set
    if (!this.dueDate && this.invoiceDate) {
      const daysToAdd = this.paymentTerms === 'immediate' ? 0 :
                       this.paymentTerms === 'net_15' ? 15 :
                       this.paymentTerms === 'net_45' ? 45 :
                       this.paymentTerms === 'net_60' ? 60 : 30;
      
      this.dueDate = new Date(this.invoiceDate);
      this.dueDate.setDate(this.dueDate.getDate() + daysToAdd);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
invoiceSchema.methods.send = async function(recipientEmail) {
  if (this.status === 'draft') {
    throw new AppError('Cannot send draft invoice', 400, 'INVALID_STATUS');
  }

  this.status = 'sent';
  this.sentAt = new Date();
  
  if (!this.remindersSent) {
    this.remindersSent = [];
  }
  
  this.remindersSent.push({
    sentAt: new Date(),
    type: 'email',
    recipient: recipientEmail || this.billingDetails.email
  });

  await this.save();
  
  // TODO: Integrate with email service
  logger.info('Invoice sent', { 
    invoiceNumber: this.invoiceNumber, 
    recipient: recipientEmail 
  });

  return this;
};

invoiceSchema.methods.markAsViewed = async function() {
  if (!this.viewedAt) {
    this.viewedAt = new Date();
    this.status = 'viewed';
    await this.save();
  }
  return this;
};

invoiceSchema.methods.recordPayment = async function(paymentData) {
  const { amount, paymentMethod, transactionId, notes } = paymentData;

  if (amount > this.amountDue) {
    throw new AppError('Payment amount exceeds amount due', 400, 'EXCESS_PAYMENT');
  }

  if (!this.payments) {
    this.payments = [];
  }

  this.payments.push({
    amount,
    paymentDate: new Date(),
    paymentMethod,
    transactionId,
    notes
  });

  this.amountPaid += amount;
  this.lastPaymentDate = new Date();

  await this.save();
  return this;
};

invoiceSchema.methods.applyRefund = async function(refundData) {
  const { amount, reason, processedBy } = refundData;

  if (amount > this.amountPaid) {
    throw new AppError('Refund amount exceeds paid amount', 400, 'EXCESS_REFUND');
  }

  if (!this.refunds) {
    this.refunds = [];
  }

  this.refunds.push({
    amount,
    refundDate: new Date(),
    reason,
    processedBy
  });

  this.totalRefunded += amount;
  this.amountPaid -= amount;

  if (this.totalRefunded >= this.totalAmount) {
    this.paymentStatus = 'refunded';
  }

  await this.save();
  return this;
};

invoiceSchema.methods.cancel = async function(reason, cancelledBy) {
  if (['paid', 'refunded'].includes(this.paymentStatus)) {
    throw new AppError('Cannot cancel paid or refunded invoice', 400, 'INVALID_STATUS');
  }

  this.status = 'cancelled';
  this.paymentStatus = 'cancelled';
  this.cancelledBy = {
    userId: cancelledBy.userId,
    name: cancelledBy.name,
    cancelledAt: new Date(),
    reason
  };

  await this.save();
  return this;
};

invoiceSchema.methods.approve = async function(approvedBy) {
  if (this.status !== 'pending_approval') {
    throw new AppError('Invoice is not pending approval', 400, 'INVALID_STATUS');
  }

  this.status = 'approved';
  this.approvedBy = {
    userId: approvedBy.userId,
    name: approvedBy.name,
    approvedAt: new Date()
  };

  await this.save();
  return this;
};

invoiceSchema.methods.generatePDF = async function() {
  // TODO: Integrate with PDF generation service
  const pdfUrl = `https://invoices.example.com/${this.invoiceNumber}.pdf`;
  this.pdfUrl = pdfUrl;
  await this.save();
  return pdfUrl;
};

invoiceSchema.methods.createDispute = async function(reason) {
  this.dispute = {
    status: 'pending',
    reason,
    createdAt: new Date()
  };

  await this.save();
  return this;
};

invoiceSchema.methods.resolveDispute = async function(resolution) {
  if (!this.dispute || this.dispute.status !== 'pending') {
    throw new AppError('No pending dispute found', 400, 'NO_DISPUTE');
  }

  this.dispute.status = 'resolved';
  this.dispute.resolution = resolution;
  this.dispute.resolvedAt = new Date();

  await this.save();
  return this;
};

// Static methods
invoiceSchema.statics.generateInvoiceNumber = async function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // Find the latest invoice for this month
  const latestInvoice = await this.findOne({
    invoiceNumber: new RegExp(`^${year}${month}`)
  }).sort({ invoiceNumber: -1 });

  let sequence = 1;
  if (latestInvoice) {
    const lastSequence = parseInt(latestInvoice.invoiceNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${year}${month}${String(sequence).padStart(4, '0')}`;
};

invoiceSchema.statics.createFromSubscription = async function(subscription, billingPeriod) {
  const items = [{
    productId: subscription.planId,
    productType: 'subscription',
    description: `${subscription.planName} - ${billingPeriod.start.toLocaleDateString()} to ${billingPeriod.end.toLocaleDateString()}`,
    quantity: 1,
    unitPrice: subscription.amount,
    amount: subscription.amount,
    periodStart: billingPeriod.start,
    periodEnd: billingPeriod.end
  }];

  // Add any usage-based charges
  if (subscription.usageCharges && subscription.usageCharges.length > 0) {
    for (const charge of subscription.usageCharges) {
      items.push({
        productType: 'usage',
        description: charge.description,
        quantity: charge.quantity,
        unitPrice: charge.unitPrice,
        amount: charge.totalAmount
      });
    }
  }

  const invoice = await this.create({
    customerId: subscription.customerId,
    customerType: subscription.customerType,
    organizationId: subscription.organizationId,
    subscriptionId: subscription._id,
    billingPeriod,
    items,
    currency: subscription.currency,
    paymentTerms: subscription.paymentTerms || 'net_30',
    billingDetails: subscription.billingDetails,
    metadata: {
      source: 'subscription'
    }
  });

  return invoice;
};

invoiceSchema.statics.getOverdueInvoices = async function(options = {}) {
  const { organizationId, daysOverdue = 0, limit = 100 } = options;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

  const query = {
    paymentStatus: { $in: ['pending', 'partial'] },
    dueDate: { $lt: cutoffDate },
    status: { $ne: 'cancelled' }
  };

  if (organizationId) {
    query.organizationId = organizationId;
  }

  return await this.find(query)
    .sort({ dueDate: 1 })
    .limit(limit)
    .populate('customerId', 'email profile.fullName');
};

invoiceSchema.statics.getRevenueStatistics = async function(organizationId, period) {
  const { startDate, endDate } = period;
  
  const matchQuery = {
    paymentStatus: { $in: ['paid', 'partial'] },
    invoiceDate: { $gte: startDate, $lte: endDate }
  };

  if (organizationId) {
    matchQuery.organizationId = organizationId;
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amountPaid' },
        totalInvoiced: { $sum: '$totalAmount' },
        totalOutstanding: { $sum: '$amountDue' },
        invoiceCount: { $sum: 1 },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
        },
        averageInvoiceAmount: { $avg: '$totalAmount' },
        averageDaysToPay: {
          $avg: {
            $cond: [
              { $ne: ['$paidAt', null] },
              {
                $divide: [
                  { $subtract: ['$paidAt', '$invoiceDate'] },
                  1000 * 60 * 60 * 24
                ]
              },
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        totalInvoiced: { $round: ['$totalInvoiced', 2] },
        totalOutstanding: { $round: ['$totalOutstanding', 2] },
        invoiceCount: 1,
        paidCount: 1,
        paymentRate: {
          $multiply: [
            { $divide: ['$paidCount', '$invoiceCount'] },
            100
          ]
        },
        averageInvoiceAmount: { $round: ['$averageInvoiceAmount', 2] },
        averageDaysToPay: { $round: ['$averageDaysToPay', 0] }
      }
    }
  ]);

  return stats[0] || {
    totalRevenue: 0,
    totalInvoiced: 0,
    totalOutstanding: 0,
    invoiceCount: 0,
    paidCount: 0,
    paymentRate: 0,
    averageInvoiceAmount: 0,
    averageDaysToPay: 0
  };
};

invoiceSchema.statics.sendReminders = async function() {
  const reminderDays = [7, 3, 1, -1, -7]; // Days before/after due date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const remindersToSend = [];

  for (const days of reminderDays) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + days);
    
    const invoices = await this.find({
      paymentStatus: { $in: ['pending', 'partial'] },
      status: 'sent',
      dueDate: {
        $gte: targetDate,
        $lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
      }
    }).populate('customerId', 'email profile.fullName');

    for (const invoice of invoices) {
      // Check if reminder was already sent recently
      const recentReminder = invoice.remindersSent?.find(r => {
        const daysSinceReminder = Math.floor((today - r.sentAt) / (1000 * 60 * 60 * 24));
        return daysSinceReminder < 1;
      });

      if (!recentReminder) {
        remindersToSend.push({
          invoice,
          type: days > 0 ? 'upcoming' : days === 0 ? 'due_today' : 'overdue',
          daysUntilDue: days
        });
      }
    }
  }

  // Send reminders
  for (const reminder of remindersToSend) {
    await reminder.invoice.send();
    logger.info('Invoice reminder sent', {
      invoiceNumber: reminder.invoice.invoiceNumber,
      type: reminder.type,
      daysUntilDue: reminder.daysUntilDue
    });
  }

  return remindersToSend.length;
};

// Create and export model
const InvoiceModel = BaseModel.createModel('Invoice', invoiceSchema);

module.exports = {
  schema: invoiceSchema,
  model: InvoiceModel
};