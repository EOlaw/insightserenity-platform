'use strict';

/**
 * @fileoverview Payment method model for storing customer payment methods
 * @module shared/lib/database/models/billing/payment-method-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const encryptionService = require('../../../security/encryption/encryption-service');
const cryptoHelper = require('../../../utils/helpers/crypto-helper');

/**
 * Payment method schema definition
 */
const paymentMethodSchemaDefinition = {
  // ==================== Core Identity ====================
  methodId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // ==================== Method Details ====================
  type: {
    type: String,
    enum: ['card', 'bank_account', 'paypal', 'alipay', 'wechat_pay', 'apple_pay', 'google_pay', 'crypto', 'wire_transfer', 'other'],
    required: true,
    index: true
  },

  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'failed', 'suspended', 'deleted'],
    default: 'pending',
    required: true,
    index: true
  },

  isDefault: {
    type: Boolean,
    default: false,
    index: true
  },

  nickname: {
    type: String,
    maxlength: 100
  },

  // ==================== Card Details ====================
  card: {
    brand: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay', 'other']
    },
    last4: {
      type: String,
      match: /^\d{4}$/
    },
    expiryMonth: {
      type: Number,
      min: 1,
      max: 12
    },
    expiryYear: {
      type: Number,
      min: new Date().getFullYear()
    },
    fingerprint: {
      type: String,
      index: true
    },
    funding: {
      type: String,
      enum: ['credit', 'debit', 'prepaid', 'unknown']
    },
    country: String,
    issuer: String,
    network: String,
    checks: {
      addressLine1: String,
      addressPostalCode: String,
      cvcCheck: String
    },
    threeDSecure: {
      supported: Boolean,
      required: Boolean,
      version: String
    }
  },

  // ==================== Bank Account Details ====================
  bankAccount: {
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'business_checking', 'business_savings']
    },
    bankName: String,
    last4: {
      type: String,
      match: /^\d{4}$/
    },
    routingNumber: {
      type: String,
      select: false
    },
    accountHolderName: String,
    accountHolderType: {
      type: String,
      enum: ['individual', 'company']
    },
    country: String,
    currency: String,
    fingerprint: String,
    verified: {
      type: Boolean,
      default: false
    },
    verificationMethod: String,
    verifiedAt: Date
  },

  // ==================== Digital Wallet Details ====================
  digitalWallet: {
    walletType: {
      type: String,
      enum: ['paypal', 'apple_pay', 'google_pay', 'alipay', 'wechat_pay']
    },
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
    accountId: String,
    verified: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Billing Address ====================
  billingAddress: {
    name: String,
    company: String,
    street1: String,
    street2: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      uppercase: true,
      match: /^[A-Z]{2}$/
    },
    phone: String,
    email: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return validators.isEmail(value);
        },
        message: 'Invalid email address'
      }
    }
  },

  // ==================== Provider Integration ====================
  provider: {
    name: {
      type: String,
      enum: ['stripe', 'paypal', 'square', 'authorize_net', 'braintree', 'manual', 'other'],
      required: true
    },
    customerId: {
      type: String,
      index: true
    },
    paymentMethodId: {
      type: String,
      index: true
    },
    tokenId: String,
    sourceId: String,
    setupIntentId: String,
    mandateId: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  },

  // ==================== Verification & Security ====================
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'expired'],
      default: 'pending'
    },
    method: {
      type: String,
      enum: ['micro_deposits', 'plaid', 'manual', 'instant', 'challenge']
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    attempts: [{
      attemptedAt: Date,
      method: String,
      success: Boolean,
      error: String
    }],
    documents: [{
      type: String,
      url: String,
      uploadedAt: Date,
      verified: Boolean
    }]
  },

  // ==================== Usage & Limits ====================
  usage: {
    lastUsedAt: Date,
    totalTransactions: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    successfulTransactions: {
      type: Number,
      default: 0
    },
    failedTransactions: {
      type: Number,
      default: 0
    },
    limits: {
      daily: {
        amount: Number,
        transactions: Number
      },
      monthly: {
        amount: Number,
        transactions: Number
      },
      perTransaction: {
        min: Number,
        max: Number
      }
    },
    currentUsage: {
      daily: {
        amount: { type: Number, default: 0 },
        transactions: { type: Number, default: 0 },
        resetAt: Date
      },
      monthly: {
        amount: { type: Number, default: 0 },
        transactions: { type: Number, default: 0 },
        resetAt: Date
      }
    }
  },

  // ==================== Risk & Compliance ====================
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
      severity: String,
      description: String
    }],
    blocked: {
      isBlocked: {
        type: Boolean,
        default: false
      },
      reason: String,
      blockedAt: Date,
      blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },

  // ==================== Tokenization ====================
  tokenization: {
    token: {
      type: String,
      unique: true,
      sparse: true,
      select: false
    },
    tokenizedAt: Date,
    tokenProvider: String,
    tokenMetadata: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  },

  // ==================== Subscription Management ====================
  subscriptions: [{
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription'
    },
    attachedAt: Date,
    isActive: Boolean
  }],

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['checkout', 'api', 'manual', 'import', 'migration'],
      default: 'checkout'
    },
    ipAddress: String,
    userAgent: String,
    deviceFingerprint: String,
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

  // ==================== Compliance ====================
  compliance: {
    pciCompliant: {
      type: Boolean,
      default: true
    },
    dataRetention: {
      deleteAfter: Date,
      retentionReason: String
    },
    consent: {
      storage: {
        consented: Boolean,
        consentedAt: Date
      },
      recurring: {
        consented: Boolean,
        consentedAt: Date
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

  // ==================== Expiration Management ====================
  expiration: {
    expiresAt: Date,
    reminders: [{
      sentAt: Date,
      daysBeforeExpiry: Number,
      method: String
    }],
    autoUpdate: {
      enabled: {
        type: Boolean,
        default: false
      },
      lastAttemptAt: Date,
      nextAttemptAt: Date
    }
  }
};

// Create schema
const paymentMethodSchema = BaseModel.createSchema(paymentMethodSchemaDefinition, {
  collection: 'payment_methods',
  timestamps: true
});

// ==================== Indexes ====================
paymentMethodSchema.index({ organizationId: 1, status: 1, isDefault: 1 });
paymentMethodSchema.index({ tenantId: 1, status: 1 });
paymentMethodSchema.index({ userId: 1, status: 1 });
paymentMethodSchema.index({ 'provider.customerId': 1 });
paymentMethodSchema.index({ 'provider.paymentMethodId': 1 });
paymentMethodSchema.index({ type: 1, status: 1 });
paymentMethodSchema.index({ 'card.fingerprint': 1 });
paymentMethodSchema.index({ 'expiration.expiresAt': 1 });

// ==================== Virtual Fields ====================
paymentMethodSchema.virtual('isExpired').get(function() {
  if (this.type === 'card' && this.card.expiryYear && this.card.expiryMonth) {
    const now = new Date();
    const expiry = new Date(this.card.expiryYear, this.card.expiryMonth - 1);
    return expiry < now;
  }
  return false;
});

paymentMethodSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.isExpired && !this.risk.blocked.isBlocked;
});

paymentMethodSchema.virtual('displayName').get(function() {
  if (this.nickname) return this.nickname;
  
  switch (this.type) {
    case 'card':
      return `${this.card.brand} •••• ${this.card.last4}`;
    case 'bank_account':
      return `${this.bankAccount.bankName} •••• ${this.bankAccount.last4}`;
    case 'paypal':
      return `PayPal ${this.digitalWallet.email}`;
    default:
      return this.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
});

paymentMethodSchema.virtual('expiresIn').get(function() {
  if (this.type === 'card' && this.card.expiryYear && this.card.expiryMonth) {
    const now = new Date();
    const expiry = new Date(this.card.expiryYear, this.card.expiryMonth - 1);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((expiry - now) / msPerDay);
    return daysUntilExpiry;
  }
  return null;
});

// ==================== Pre-save Middleware ====================
paymentMethodSchema.pre('save', async function(next) {
  try {
    // Generate card fingerprint if card details provided
    if (this.type === 'card' && this.isModified('card') && this.card.last4) {
      const fingerprintData = `${this.card.brand}-${this.card.last4}-${this.card.expiryMonth}-${this.card.expiryYear}`;
      this.card.fingerprint = cryptoHelper.generateHash(fingerprintData);
    }

    // Generate bank account fingerprint
    if (this.type === 'bank_account' && this.isModified('bankAccount') && this.bankAccount.last4) {
      const fingerprintData = `${this.bankAccount.bankName}-${this.bankAccount.last4}-${this.bankAccount.accountType}`;
      this.bankAccount.fingerprint = cryptoHelper.generateHash(fingerprintData);
    }

    // Set expiration date for cards
    if (this.type === 'card' && this.card.expiryYear && this.card.expiryMonth) {
      this.expiration.expiresAt = new Date(this.card.expiryYear, this.card.expiryMonth, 0);
    }

    // Encrypt sensitive data
    if (this.isModified('bankAccount.routingNumber') && this.bankAccount.routingNumber) {
      this.bankAccount.routingNumber = await encryptionService.encrypt(this.bankAccount.routingNumber);
    }

    if (this.isModified('provider.metadata') && this.provider.metadata) {
      this.provider.metadata = await encryptionService.encrypt(
        JSON.stringify(this.provider.metadata)
      );
    }

    // Generate secure token
    if (!this.tokenization.token && this.status === 'active') {
      this.tokenization.token = await cryptoHelper.generateSecureToken(32);
      this.tokenization.tokenizedAt = new Date();
    }

    // Update status based on expiration
    if (this.isExpired && this.status === 'active') {
      this.status = 'expired';
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
paymentMethodSchema.methods.activate = async function() {
  if (this.status === 'active') {
    throw new AppError('Payment method is already active', 400, 'ALREADY_ACTIVE');
  }

  if (this.isExpired) {
    throw new AppError('Cannot activate expired payment method', 400, 'EXPIRED');
  }

  if (this.risk.blocked.isBlocked) {
    throw new AppError('Cannot activate blocked payment method', 400, 'BLOCKED');
  }

  this.status = 'active';
  this.verification.status = 'verified';
  this.verification.verifiedAt = new Date();

  await this.save();

  logger.info('Payment method activated', {
    paymentMethodId: this._id,
    organizationId: this.organizationId,
    type: this.type
  });

  return this;
};

paymentMethodSchema.methods.setAsDefault = async function() {
  if (!this.isActive) {
    throw new AppError('Only active payment methods can be set as default', 400, 'NOT_ACTIVE');
  }

  // Remove default from other methods
  await this.constructor.updateMany(
    {
      organizationId: this.organizationId,
      _id: { $ne: this._id },
      isDefault: true
    },
    { isDefault: false }
  );

  this.isDefault = true;
  await this.save();

  logger.info('Payment method set as default', {
    paymentMethodId: this._id,
    organizationId: this.organizationId
  });

  return this;
};

paymentMethodSchema.methods.verify = async function(verificationData) {
  if (this.verification.status === 'verified') {
    throw new AppError('Payment method already verified', 400, 'ALREADY_VERIFIED');
  }

  // Record verification attempt
  if (!this.verification.attempts) {
    this.verification.attempts = [];
  }

  const attempt = {
    attemptedAt: new Date(),
    method: verificationData.method,
    success: false
  };

  try {
    // Perform verification based on method type
    // This would integrate with actual verification providers
    
    this.verification.status = 'verified';
    this.verification.verifiedAt = new Date();
    this.verification.method = verificationData.method;
    attempt.success = true;
    
    if (this.status === 'pending') {
      this.status = 'active';
    }
    
  } catch (error) {
    attempt.error = error.message;
    this.verification.attempts.push(attempt);
    
    if (this.verification.attempts.length >= 3) {
      this.verification.status = 'failed';
      this.status = 'failed';
    }
    
    await this.save();
    throw error;
  }

  this.verification.attempts.push(attempt);
  await this.save();

  logger.info('Payment method verified', {
    paymentMethodId: this._id,
    method: verificationData.method
  });

  return this;
};

paymentMethodSchema.methods.suspend = async function(reason, userId) {
  if (this.status === 'suspended') {
    throw new AppError('Payment method is already suspended', 400, 'ALREADY_SUSPENDED');
  }

  this.status = 'suspended';
  
  if (!this.compliance.audit) {
    this.compliance.audit = [];
  }
  
  this.compliance.audit.push({
    action: 'suspend',
    performedBy: userId,
    performedAt: new Date(),
    details: { reason }
  });

  await this.save();

  logger.warn('Payment method suspended', {
    paymentMethodId: this._id,
    organizationId: this.organizationId,
    reason
  });

  return this;
};

paymentMethodSchema.methods.block = async function(reason, userId) {
  this.risk.blocked = {
    isBlocked: true,
    reason,
    blockedAt: new Date(),
    blockedBy: userId
  };
  
  this.status = 'suspended';

  await this.save();

  logger.warn('Payment method blocked', {
    paymentMethodId: this._id,
    organizationId: this.organizationId,
    reason
  });

  return this;
};

paymentMethodSchema.methods.unblock = async function(userId) {
  if (!this.risk.blocked.isBlocked) {
    throw new AppError('Payment method is not blocked', 400, 'NOT_BLOCKED');
  }

  this.risk.blocked.isBlocked = false;
  
  if (this.status === 'suspended' && !this.isExpired) {
    this.status = 'active';
  }

  if (!this.compliance.audit) {
    this.compliance.audit = [];
  }
  
  this.compliance.audit.push({
    action: 'unblock',
    performedBy: userId,
    performedAt: new Date()
  });

  await this.save();

  logger.info('Payment method unblocked', {
    paymentMethodId: this._id,
    organizationId: this.organizationId
  });

  return this;
};

paymentMethodSchema.methods.recordUsage = async function(amount, success = true) {
  this.usage.lastUsedAt = new Date();
  this.usage.totalTransactions += 1;
  
  if (success) {
    this.usage.successfulTransactions += 1;
    this.usage.totalAmount += amount;
  } else {
    this.usage.failedTransactions += 1;
  }

  // Update daily usage
  const now = new Date();
  const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  if (!this.usage.currentUsage.daily.resetAt || this.usage.currentUsage.daily.resetAt < now) {
    this.usage.currentUsage.daily = {
      amount: 0,
      transactions: 0,
      resetAt: todayReset
    };
  }
  
  this.usage.currentUsage.daily.transactions += 1;
  if (success) {
    this.usage.currentUsage.daily.amount += amount;
  }

  // Update monthly usage
  const monthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  if (!this.usage.currentUsage.monthly.resetAt || this.usage.currentUsage.monthly.resetAt < now) {
    this.usage.currentUsage.monthly = {
      amount: 0,
      transactions: 0,
      resetAt: monthReset
    };
  }
  
  this.usage.currentUsage.monthly.transactions += 1;
  if (success) {
    this.usage.currentUsage.monthly.amount += amount;
  }

  await this.save();

  return this;
};

paymentMethodSchema.methods.checkLimits = function(amount) {
  const limits = this.usage.limits;
  const current = this.usage.currentUsage;
  const errors = [];

  // Check per transaction limits
  if (limits.perTransaction) {
    if (limits.perTransaction.min && amount < limits.perTransaction.min) {
      errors.push(`Amount below minimum: ${limits.perTransaction.min}`);
    }
    if (limits.perTransaction.max && amount > limits.perTransaction.max) {
      errors.push(`Amount exceeds maximum: ${limits.perTransaction.max}`);
    }
  }

  // Check daily limits
  if (limits.daily) {
    if (limits.daily.amount && current.daily.amount + amount > limits.daily.amount) {
      errors.push(`Daily amount limit exceeded: ${limits.daily.amount}`);
    }
    if (limits.daily.transactions && current.daily.transactions >= limits.daily.transactions) {
      errors.push(`Daily transaction limit exceeded: ${limits.daily.transactions}`);
    }
  }

  // Check monthly limits
  if (limits.monthly) {
    if (limits.monthly.amount && current.monthly.amount + amount > limits.monthly.amount) {
      errors.push(`Monthly amount limit exceeded: ${limits.monthly.amount}`);
    }
    if (limits.monthly.transactions && current.monthly.transactions >= limits.monthly.transactions) {
      errors.push(`Monthly transaction limit exceeded: ${limits.monthly.transactions}`);
    }
  }

  return {
    allowed: errors.length === 0,
    errors
  };
};

paymentMethodSchema.methods.attachToSubscription = async function(subscriptionId) {
  if (!this.subscriptions) {
    this.subscriptions = [];
  }

  const existingAttachment = this.subscriptions.find(
    s => s.subscriptionId.toString() === subscriptionId.toString()
  );

  if (existingAttachment) {
    existingAttachment.isActive = true;
  } else {
    this.subscriptions.push({
      subscriptionId,
      attachedAt: new Date(),
      isActive: true
    });
  }

  await this.save();

  logger.info('Payment method attached to subscription', {
    paymentMethodId: this._id,
    subscriptionId
  });

  return this;
};

paymentMethodSchema.methods.detachFromSubscription = async function(subscriptionId) {
  if (!this.subscriptions) return this;

  const attachment = this.subscriptions.find(
    s => s.subscriptionId.toString() === subscriptionId.toString()
  );

  if (attachment) {
    attachment.isActive = false;
  }

  await this.save();

  logger.info('Payment method detached from subscription', {
    paymentMethodId: this._id,
    subscriptionId
  });

  return this;
};

paymentMethodSchema.methods.sendExpirationReminder = async function() {
  const daysUntilExpiry = this.expiresIn;
  
  if (!daysUntilExpiry || daysUntilExpiry > 30) {
    throw new AppError('Too early to send expiration reminder', 400, 'TOO_EARLY');
  }

  if (!this.expiration.reminders) {
    this.expiration.reminders = [];
  }

  this.expiration.reminders.push({
    sentAt: new Date(),
    daysBeforeExpiry: daysUntilExpiry,
    method: 'email'
  });

  await this.save();

  logger.info('Expiration reminder sent', {
    paymentMethodId: this._id,
    daysUntilExpiry
  });

  return this;
};

paymentMethodSchema.methods.softDelete = async function(userId) {
  this.status = 'deleted';
  
  // Remove sensitive data
  if (this.bankAccount.routingNumber) {
    this.bankAccount.routingNumber = undefined;
  }
  
  if (this.provider.metadata) {
    this.provider.metadata = undefined;
  }
  
  if (this.tokenization.token) {
    this.tokenization.token = undefined;
  }

  // Set retention period
  this.compliance.dataRetention = {
    deleteAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    retentionReason: 'soft_delete'
  };

  if (!this.compliance.audit) {
    this.compliance.audit = [];
  }
  
  this.compliance.audit.push({
    action: 'delete',
    performedBy: userId,
    performedAt: new Date()
  });

  await this.save();

  logger.info('Payment method soft deleted', {
    paymentMethodId: this._id,
    organizationId: this.organizationId
  });

  return this;
};

// ==================== Static Methods ====================
paymentMethodSchema.statics.createPaymentMethod = async function(data) {
  const {
    organizationId,
    type,
    provider,
    details,
    billingAddress
  } = data;

  // Get organization
  const Organization = mongoose.model('Organization');
  const organization = await Organization.findById(organizationId);
  
  if (!organization) {
    throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
  }

  const paymentMethod = new this({
    organizationId,
    tenantId: organization.tenancy?.tenantId,
    type,
    status: 'pending',
    provider: {
      name: provider
    },
    billingAddress: billingAddress || organization.address
  });

  // Set type-specific details
  switch (type) {
    case 'card':
      paymentMethod.card = details;
      break;
    case 'bank_account':
      paymentMethod.bankAccount = details;
      break;
    case 'paypal':
    case 'apple_pay':
    case 'google_pay':
      paymentMethod.digitalWallet = {
        walletType: type,
        ...details
      };
      break;
  }

  await paymentMethod.save();

  logger.info('Payment method created', {
    paymentMethodId: paymentMethod._id,
    organizationId,
    type
  });

  return paymentMethod;
};

paymentMethodSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { 
    organizationId,
    status: { $ne: 'deleted' }
  };
  
  if (options.activeOnly) {
    query.status = 'active';
    query['risk.blocked.isBlocked'] = false;
  }
  
  if (options.type) {
    query.type = options.type;
  }

  return await this.find(query)
    .sort({ isDefault: -1, createdAt: -1 });
};

paymentMethodSchema.statics.findExpiringCards = async function(daysAhead = 30) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);

  return await this.find({
    type: 'card',
    status: 'active',
    'expiration.expiresAt': {
      $gte: new Date(),
      $lte: targetDate
    }
  }).populate('organizationId');
};

paymentMethodSchema.statics.findByFingerprint = async function(type, fingerprint) {
  const query = { type };
  
  if (type === 'card') {
    query['card.fingerprint'] = fingerprint;
  } else if (type === 'bank_account') {
    query['bankAccount.fingerprint'] = fingerprint;
  }

  return await this.find(query);
};

paymentMethodSchema.statics.getUsageStatistics = async function(paymentMethodId) {
  const paymentMethod = await this.findById(paymentMethodId);
  
  if (!paymentMethod) {
    throw new AppError('Payment method not found', 404, 'NOT_FOUND');
  }

  const Payment = mongoose.model('Payment');
  
  const stats = await Payment.aggregate([
    {
      $match: {
        'relations.paymentMethodId': paymentMethod._id
      }
    },
    {
      $facet: {
        summary: [
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
              avgAmount: {
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
        monthlyVolume: [
          {
            $match: { status: 'succeeded' }
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
              },
              volume: { $sum: '$amount.value' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 }
        ]
      }
    }
  ]);

  return {
    usage: paymentMethod.usage,
    payments: {
      summary: stats[0].summary[0] || {
        totalVolume: 0,
        successCount: 0,
        failedCount: 0,
        avgAmount: 0
      },
      monthlyVolume: stats[0].monthlyVolume.reverse()
    }
  };
};

// Create and export model
const PaymentMethodModel = BaseModel.createModel('PaymentMethod', paymentMethodSchema);

module.exports = {
  schema: paymentMethodSchema,
  model: PaymentMethodModel
};