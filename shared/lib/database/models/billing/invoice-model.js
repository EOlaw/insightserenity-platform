'use strict';

/**
 * @fileoverview Invoice model for billing and payment tracking
 * @module shared/lib/database/models/billing/invoice-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const dateHelper = require('../../../utils/helpers/date-helper');
const stringHelper = require('../../../utils/helpers/string-helper');

/**
 * Invoice schema definition
 */
const invoiceSchemaDefinition = {
  // ==================== Core Identity ====================
  invoiceNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
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

  // ==================== Invoice Details ====================
  type: {
    type: String,
    enum: ['subscription', 'one-time', 'usage', 'credit', 'refund', 'adjustment'],
    required: true,
    index: true
  },

  status: {
    type: String,
    enum: ['draft', 'pending', 'sent', 'paid', 'partial', 'overdue', 'void', 'uncollectible', 'refunded'],
    required: true,
    default: 'draft',
    index: true
  },

  // ==================== Billing Information ====================
  billing: {
    fromDate: {
      type: Date,
      required: true
    },
    toDate: {
      type: Date,
      required: true
    },
    issueDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    terms: {
      type: String,
      enum: ['due_on_receipt', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'],
      default: 'net_30'
    },
    customTerms: String
  },

  // ==================== Customer Information ====================
  customer: {
    organizationName: {
      type: String,
      required: true
    },
    contactName: String,
    email: {
      type: String,
      required: true,
      validate: {
        validator: validators.isEmail,
        message: 'Invalid email address'
      }
    },
    phone: String,
    address: {
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    taxId: String,
    vatId: String
  },

  // ==================== Line Items ====================
  lineItems: [{
    itemId: {
      type: String,
      default: function() {
        return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    },
    type: {
      type: String,
      enum: ['subscription', 'addon', 'usage', 'setup', 'discount', 'credit', 'tax', 'adjustment'],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    metadata: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      planName: String,
      period: {
        start: Date,
        end: Date
      },
      usage: {
        metric: String,
        quantity: Number,
        unit: String
      }
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 0
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    amount: {
      type: Number,
      required: true,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    discount: {
      type: {
        type: String,
        enum: ['percentage', 'fixed']
      },
      value: Number,
      amount: Number,
      code: String,
      description: String
    },
    tax: {
      rate: Number,
      amount: Number,
      taxable: {
        type: Boolean,
        default: true
      }
    },
    accounting: {
      revenueAccount: String,
      recognitionStart: Date,
      recognitionEnd: Date,
      recognized: {
        type: Boolean,
        default: false
      }
    }
  }],

  // ==================== Financial Summary ====================
  financial: {
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
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    taxTotal: {
      type: Number,
      default: 0,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    amountDue: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },
    credits: {
      applied: {
        type: Number,
        default: 0,
        min: 0
      },
      remaining: {
        type: Number,
        default: 0,
        min: 0
      },
      transactions: [{
        creditTransactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'CreditTransaction'
        },
        amount: Number,
        appliedAt: Date
      }]
    }
  },

  // ==================== Tax Information ====================
  tax: {
    rates: [{
      name: String,
      rate: Number,
      amount: Number,
      jurisdiction: String,
      type: {
        type: String,
        enum: ['sales', 'vat', 'gst', 'pst', 'hst', 'service', 'other']
      }
    }],
    exempt: {
      type: Boolean,
      default: false
    },
    exemptionId: String,
    location: {
      country: String,
      state: String,
      city: String,
      postalCode: String
    }
  },

  // ==================== Payment Information ====================
  payment: {
    methodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod'
    },
    transactions: [{
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
      },
      amount: Number,
      currency: String,
      paidAt: Date,
      method: String,
      reference: String,
      status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'refunded']
      }
    }],
    lastAttemptAt: Date,
    nextAttemptAt: Date,
    attemptCount: {
      type: Number,
      default: 0
    },
    autoCollection: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxAttempts: {
        type: Number,
        default: 3
      }
    }
  },

  // ==================== Provider Integration ====================
  providers: {
    stripe: {
      invoiceId: String,
      customerId: String,
      chargeId: String,
      paymentIntentId: String,
      hostedUrl: String,
      pdfUrl: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    paypal: {
      invoiceId: String,
      invoiceNumber: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    custom: mongoose.Schema.Types.Mixed
  },

  // ==================== Document Management ====================
  documents: {
    pdf: {
      url: String,
      generatedAt: Date,
      size: Number,
      version: Number
    },
    attachments: [{
      name: String,
      url: String,
      type: String,
      size: Number,
      uploadedAt: Date
    }],
    template: {
      id: String,
      name: String,
      version: String
    }
  },

  // ==================== Communication ====================
  communication: {
    sent: {
      count: {
        type: Number,
        default: 0
      },
      lastSentAt: Date,
      history: [{
        sentAt: Date,
        to: [String],
        cc: [String],
        method: {
          type: String,
          enum: ['email', 'api', 'manual']
        },
        template: String,
        status: String
      }]
    },
    reminders: {
      enabled: {
        type: Boolean,
        default: true
      },
      schedule: {
        type: [Number],
        default: [-7, -3, 0, 3, 7] // Days relative to due date
      },
      sent: [{
        sentAt: Date,
        dayOffset: Number,
        method: String
      }]
    },
    language: {
      type: String,
      default: 'en'
    },
    customMessage: String
  },

  // ==================== Accounting Integration ====================
  accounting: {
    exported: {
      type: Boolean,
      default: false
    },
    exportedAt: Date,
    system: {
      type: String,
      enum: ['quickbooks', 'xero', 'sage', 'netsuite', 'custom']
    },
    reference: String,
    journal: {
      entries: [{
        account: String,
        debit: Number,
        credit: Number,
        description: String
      }],
      postedAt: Date
    },
    recognitionSchedule: [{
      period: String,
      amount: Number,
      recognized: Boolean,
      recognizedAt: Date
    }]
  },

  // ==================== Metadata & Notes ====================
  metadata: {
    source: {
      type: String,
      enum: ['subscription', 'api', 'manual', 'import', 'migration'],
      default: 'subscription'
    },
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    notes: [{
      content: String,
      internal: {
        type: Boolean,
        default: true
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }],
    references: {
      orderId: String,
      purchaseOrder: String,
      contractId: String,
      projectId: String
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    retention: {
      retainUntil: Date,
      locked: {
        type: Boolean,
        default: false
      }
    },
    audit: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      changes: mongoose.Schema.Types.Mixed,
      ipAddress: String
    }],
    regulations: {
      requiresSignature: Boolean,
      signedAt: Date,
      signedBy: String,
      signatureData: String
    }
  }
};

// Create schema
const invoiceSchema = BaseModel.createSchema(invoiceSchemaDefinition, {
  collection: 'invoices',
  timestamps: true
});

// ==================== Indexes ====================
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ 'billing.dueDate': 1, status: 1 });
invoiceSchema.index({ 'billing.issueDate': -1 });
invoiceSchema.index({ 'financial.amountDue': 1 });
invoiceSchema.index({ 'providers.stripe.invoiceId': 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ type: 1, status: 1 });

// Text search index
invoiceSchema.index({
  invoiceNumber: 'text',
  'customer.organizationName': 'text',
  'customer.email': 'text'
});

// ==================== Virtual Fields ====================
invoiceSchema.virtual('isPaid').get(function() {
  return this.status === 'paid' || this.financial.amountDue === 0;
});

invoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== 'paid' && 
         this.status !== 'void' && 
         this.billing.dueDate < new Date();
});

invoiceSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((new Date() - this.billing.dueDate) / msPerDay);
});

invoiceSchema.virtual('daysToDue').get(function() {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((this.billing.dueDate - new Date()) / msPerDay);
  return days;
});

invoiceSchema.virtual('hasPartialPayment').get(function() {
  return this.financial.amountPaid > 0 && 
         this.financial.amountPaid < this.financial.total;
});

invoiceSchema.virtual('formattedNumber').get(function() {
  return this.invoiceNumber;
});

// ==================== Pre-save Middleware ====================
invoiceSchema.pre('save', async function(next) {
  try {
    // Generate invoice number if not provided
    if (!this.invoiceNumber && this.isNew) {
      this.invoiceNumber = await this.constructor.generateInvoiceNumber(this.tenantId);
    }

    // Calculate financial totals
    if (this.isModified('lineItems')) {
      this.calculateTotals();
    }

    // Update amount due
    this.financial.amountDue = Math.max(0, this.financial.total - this.financial.amountPaid);

    // Update status based on payment
    if (this.financial.amountDue === 0 && this.status !== 'void' && this.status !== 'refunded') {
      this.status = 'paid';
    } else if (this.financial.amountPaid > 0 && this.financial.amountPaid < this.financial.total) {
      this.status = 'partial';
    } else if (this.isOverdue && this.status === 'sent') {
      this.status = 'overdue';
    }

    // Set due date based on terms if not set
    if (!this.billing.dueDate && this.billing.terms) {
      this.billing.dueDate = this.calculateDueDate();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
invoiceSchema.methods.calculateTotals = function() {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  // Calculate line items
  this.lineItems.forEach(item => {
    // Calculate item amount
    item.amount = item.quantity * item.unitPrice;
    
    // Apply discount if any
    if (item.discount && item.discount.value) {
      if (item.discount.type === 'percentage') {
        item.discount.amount = item.amount * (item.discount.value / 100);
      } else {
        item.discount.amount = item.discount.value;
      }
      item.amount -= item.discount.amount;
      discountTotal += item.discount.amount;
    }
    
    // Add to subtotal (before tax)
    if (item.type !== 'tax') {
      subtotal += item.amount;
    }
    
    // Calculate tax if applicable
    if (item.tax && item.tax.rate && item.tax.taxable && item.type !== 'tax') {
      item.tax.amount = item.amount * (item.tax.rate / 100);
      taxTotal += item.tax.amount;
    }
  });

  // Add explicit tax line items
  this.lineItems
    .filter(item => item.type === 'tax')
    .forEach(item => {
      taxTotal += item.amount;
    });

  // Update financial summary
  this.financial.subtotal = Math.round(subtotal * 100) / 100;
  this.financial.discountTotal = Math.round(discountTotal * 100) / 100;
  this.financial.taxTotal = Math.round(taxTotal * 100) / 100;
  this.financial.total = Math.round((subtotal + taxTotal) * 100) / 100;
};

invoiceSchema.methods.calculateDueDate = function() {
  const issueDate = this.billing.issueDate || new Date();
  
  const termDays = {
    'due_on_receipt': 0,
    'net_7': 7,
    'net_15': 15,
    'net_30': 30,
    'net_45': 45,
    'net_60': 60
  };
  
  const days = termDays[this.billing.terms] || 30;
  return new Date(issueDate.getTime() + days * 24 * 60 * 60 * 1000);
};

invoiceSchema.methods.markAsSent = async function() {
  if (this.status === 'paid' || this.status === 'void') {
    throw new AppError('Cannot send paid or void invoice', 400, 'INVALID_STATUS');
  }

  this.status = 'sent';
  
  if (!this.communication.sent.lastSentAt) {
    this.communication.sent.lastSentAt = new Date();
  }
  
  this.communication.sent.count += 1;
  
  if (!this.communication.sent.history) {
    this.communication.sent.history = [];
  }
  
  this.communication.sent.history.push({
    sentAt: new Date(),
    to: [this.customer.email],
    method: 'manual',
    status: 'sent'
  });
  
  await this.save();
  
  logger.info('Invoice marked as sent', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber
  });
  
  return this;
};

invoiceSchema.methods.recordPayment = async function(paymentData) {
  const { amount, paymentId, method, reference } = paymentData;
  
  if (amount <= 0) {
    throw new AppError('Payment amount must be positive', 400, 'INVALID_AMOUNT');
  }
  
  if (amount > this.financial.amountDue) {
    throw new AppError('Payment exceeds amount due', 400, 'EXCESS_PAYMENT');
  }
  
  // Record payment transaction
  if (!this.payment.transactions) {
    this.payment.transactions = [];
  }
  
  this.payment.transactions.push({
    paymentId,
    amount,
    currency: this.financial.currency,
    paidAt: new Date(),
    method,
    reference,
    status: 'succeeded'
  });
  
  // Update financial
  this.financial.amountPaid += amount;
  this.financial.amountDue = Math.max(0, this.financial.total - this.financial.amountPaid);
  
  // Update status
  if (this.financial.amountDue === 0) {
    this.status = 'paid';
  } else {
    this.status = 'partial';
  }
  
  // Update payment info
  this.payment.lastAttemptAt = new Date();
  
  await this.save();
  
  logger.info('Payment recorded for invoice', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    amount,
    remaining: this.financial.amountDue
  });
  
  return this;
};

invoiceSchema.methods.applyCredit = async function(creditAmount, creditTransactionId) {
  if (creditAmount <= 0) {
    throw new AppError('Credit amount must be positive', 400, 'INVALID_AMOUNT');
  }
  
  const applicableAmount = Math.min(creditAmount, this.financial.amountDue);
  
  if (applicableAmount === 0) {
    throw new AppError('Invoice already paid', 400, 'ALREADY_PAID');
  }
  
  // Record credit application
  if (!this.financial.credits.transactions) {
    this.financial.credits.transactions = [];
  }
  
  this.financial.credits.transactions.push({
    creditTransactionId,
    amount: applicableAmount,
    appliedAt: new Date()
  });
  
  // Update financial
  this.financial.credits.applied += applicableAmount;
  this.financial.amountPaid += applicableAmount;
  this.financial.amountDue = Math.max(0, this.financial.total - this.financial.amountPaid);
  
  // Update status
  if (this.financial.amountDue === 0) {
    this.status = 'paid';
  } else {
    this.status = 'partial';
  }
  
  await this.save();
  
  logger.info('Credit applied to invoice', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    creditAmount: applicableAmount,
    remaining: this.financial.amountDue
  });
  
  return { applied: applicableAmount, remaining: creditAmount - applicableAmount };
};

invoiceSchema.methods.voidInvoice = async function(reason, userId) {
  if (this.status === 'void') {
    throw new AppError('Invoice is already void', 400, 'ALREADY_VOID');
  }
  
  if (this.financial.amountPaid > 0) {
    throw new AppError('Cannot void invoice with payments', 400, 'HAS_PAYMENTS');
  }
  
  this.status = 'void';
  
  // Add audit entry
  if (!this.compliance.audit) {
    this.compliance.audit = [];
  }
  
  this.compliance.audit.push({
    action: 'void',
    performedBy: userId,
    performedAt: new Date(),
    changes: { reason }
  });
  
  await this.save();
  
  logger.warn('Invoice voided', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    reason
  });
  
  return this;
};

invoiceSchema.methods.refund = async function(amount, reason, userId) {
  if (amount > this.financial.amountPaid) {
    throw new AppError('Refund exceeds paid amount', 400, 'EXCESS_REFUND');
  }
  
  // Create refund line item
  this.lineItems.push({
    type: 'credit',
    description: `Refund: ${reason}`,
    quantity: 1,
    unitPrice: -amount,
    amount: -amount
  });
  
  // Update financial
  this.financial.amountPaid -= amount;
  this.financial.amountDue = Math.max(0, this.financial.total - this.financial.amountPaid);
  
  // Update status
  if (this.financial.amountPaid === 0) {
    this.status = 'refunded';
  } else {
    this.status = 'partial';
  }
  
  // Add audit entry
  if (!this.compliance.audit) {
    this.compliance.audit = [];
  }
  
  this.compliance.audit.push({
    action: 'refund',
    performedBy: userId,
    performedAt: new Date(),
    changes: { amount, reason }
  });
  
  await this.save();
  
  logger.info('Invoice refunded', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    amount,
    reason
  });
  
  return this;
};

invoiceSchema.methods.addLineItem = async function(lineItem) {
  this.lineItems.push(lineItem);
  this.calculateTotals();
  
  await this.save();
  
  return this;
};

invoiceSchema.methods.removeLineItem = async function(itemId) {
  this.lineItems = this.lineItems.filter(item => item.itemId !== itemId);
  this.calculateTotals();
  
  await this.save();
  
  return this;
};

invoiceSchema.methods.sendReminder = async function(options = {}) {
  const { method = 'email', template = 'reminder' } = options;
  
  if (!this.communication.reminders.enabled) {
    throw new AppError('Reminders are disabled for this invoice', 400, 'REMINDERS_DISABLED');
  }
  
  if (this.isPaid) {
    throw new AppError('Cannot send reminder for paid invoice', 400, 'ALREADY_PAID');
  }
  
  // Record reminder
  if (!this.communication.reminders.sent) {
    this.communication.reminders.sent = [];
  }
  
  this.communication.reminders.sent.push({
    sentAt: new Date(),
    dayOffset: this.daysToDue,
    method
  });
  
  // Update sent history
  this.communication.sent.count += 1;
  this.communication.sent.lastSentAt = new Date();
  
  if (!this.communication.sent.history) {
    this.communication.sent.history = [];
  }
  
  this.communication.sent.history.push({
    sentAt: new Date(),
    to: [this.customer.email],
    method,
    template,
    status: 'sent'
  });
  
  await this.save();
  
  logger.info('Invoice reminder sent', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    daysOverdue: this.daysOverdue
  });
  
  return this;
};

invoiceSchema.methods.exportToAccounting = async function(system, reference) {
  if (this.accounting.exported) {
    throw new AppError('Invoice already exported', 400, 'ALREADY_EXPORTED');
  }
  
  this.accounting.exported = true;
  this.accounting.exportedAt = new Date();
  this.accounting.system = system;
  this.accounting.reference = reference;
  
  // Generate journal entries
  this.accounting.journal = {
    entries: [
      {
        account: 'accounts_receivable',
        debit: this.financial.total,
        credit: 0,
        description: `Invoice ${this.invoiceNumber}`
      },
      {
        account: 'revenue',
        debit: 0,
        credit: this.financial.subtotal,
        description: `Revenue for Invoice ${this.invoiceNumber}`
      }
    ],
    postedAt: new Date()
  };
  
  if (this.financial.taxTotal > 0) {
    this.accounting.journal.entries.push({
      account: 'sales_tax_payable',
      debit: 0,
      credit: this.financial.taxTotal,
      description: `Sales tax for Invoice ${this.invoiceNumber}`
    });
  }
  
  await this.save();
  
  logger.info('Invoice exported to accounting', {
    invoiceId: this._id,
    invoiceNumber: this.invoiceNumber,
    system,
    reference
  });
  
  return this;
};

// ==================== Static Methods ====================
invoiceSchema.statics.generateInvoiceNumber = async function(tenantId) {
  const prefix = process.env.INVOICE_PREFIX || 'INV';
  const separator = '-';
  
  // Get current year and month
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  // Find the last invoice for this tenant this month
  const lastInvoice = await this.findOne({
    tenantId,
    invoiceNumber: new RegExp(`^${prefix}${separator}${year}${month}`),
    createdAt: {
      $gte: new Date(year, now.getMonth(), 1),
      $lt: new Date(year, now.getMonth() + 1, 1)
    }
  })
  .sort({ invoiceNumber: -1 })
  .select('invoiceNumber');
  
  let sequence = 1;
  
  if (lastInvoice) {
    const lastNumber = lastInvoice.invoiceNumber;
    const lastSequence = parseInt(lastNumber.split(separator).pop()) || 0;
    sequence = lastSequence + 1;
  }
  
  const invoiceNumber = `${prefix}${separator}${year}${month}${separator}${String(sequence).padStart(4, '0')}`;
  
  return invoiceNumber;
};

invoiceSchema.statics.createInvoice = async function(data) {
  const {
    organizationId,
    subscriptionId,
    type = 'subscription',
    lineItems,
    billing
  } = data;
  
  // Get organization details
  const Organization = mongoose.model('Organization');
  const organization = await Organization.findById(organizationId);
  
  if (!organization) {
    throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
  }
  
  // Create invoice
  const invoice = new this({
    organizationId,
    tenantId: organization.tenancy?.tenantId,
    subscriptionId,
    type,
    status: 'draft',
    billing: {
      ...billing,
      issueDate: new Date()
    },
    customer: {
      organizationName: organization.displayName || organization.name,
      email: organization.contact.email,
      phone: organization.contact.phone,
      address: organization.address,
      taxId: organization.billing?.taxInfo?.taxId,
      vatId: organization.billing?.taxInfo?.vatId
    },
    lineItems: lineItems || [],
    financial: {
      currency: organization.billing?.credits?.currency || 'USD'
    }
  });
  
  // Calculate totals
  invoice.calculateTotals();
  
  await invoice.save();
  
  logger.info('Invoice created', {
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    organizationId,
    type
  });
  
  return invoice;
};

invoiceSchema.statics.findOverdueInvoices = async function(options = {}) {
  const query = {
    status: { $nin: ['paid', 'void', 'refunded'] },
    'billing.dueDate': { $lt: new Date() }
  };
  
  if (options.tenantId) {
    query.tenantId = options.tenantId;
  }
  
  if (options.minDaysOverdue) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.minDaysOverdue);
    query['billing.dueDate'] = { $lt: cutoffDate };
  }
  
  return await this.find(query)
    .sort({ 'billing.dueDate': 1 })
    .populate('organizationId subscriptionId');
};

invoiceSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { organizationId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.dateRange) {
    query['billing.issueDate'] = {
      $gte: options.dateRange.start,
      $lte: options.dateRange.end
    };
  }
  
  const invoices = await this.find(query)
    .sort({ 'billing.issueDate': -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
  
  const total = await this.countDocuments(query);
  
  return {
    invoices,
    total,
    hasMore: total > (options.skip || 0) + invoices.length
  };
};

invoiceSchema.statics.getRevenueMetrics = async function(filters = {}) {
  const match = {
    status: { $in: ['paid', 'partial'] }
  };
  
  if (filters.tenantId) {
    match.tenantId = filters.tenantId;
  }
  
  if (filters.dateRange) {
    match['billing.issueDate'] = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
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
              totalRevenue: { $sum: '$financial.amountPaid' },
              averageInvoice: { $avg: '$financial.total' },
              invoiceCount: { $sum: 1 },
              paidCount: {
                $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
              }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: {
                year: { $year: '$billing.issueDate' },
                month: { $month: '$billing.issueDate' }
              },
              revenue: { $sum: '$financial.amountPaid' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 }
        ],
        byType: [
          {
            $group: {
              _id: '$type',
              revenue: { $sum: '$financial.amountPaid' },
              count: { $sum: 1 }
            }
          }
        ],
        outstanding: [
          {
            $match: { 'financial.amountDue': { $gt: 0 } }
          },
          {
            $group: {
              _id: null,
              totalOutstanding: { $sum: '$financial.amountDue' },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);
  
  const result = metrics[0];
  
  return {
    summary: result.summary[0] || {
      totalRevenue: 0,
      averageInvoice: 0,
      invoiceCount: 0,
      paidCount: 0
    },
    monthlyRevenue: result.byMonth.reverse(),
    revenueByType: result.byType,
    outstanding: result.outstanding[0] || {
      totalOutstanding: 0,
      count: 0
    }
  };
};

// Create and export model
const InvoiceModel = BaseModel.createModel('Invoice', invoiceSchema);

module.exports = {
  schema: invoiceSchema,
  model: InvoiceModel
};