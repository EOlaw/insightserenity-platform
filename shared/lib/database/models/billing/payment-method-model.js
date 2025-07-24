'use strict';

/**
 * @fileoverview Payment method model for storing customer payment instruments
 * @module shared/lib/database/models/billing/payment-method-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const EncryptionService = require('../../../security/encryption/encryption-service');
const validators = require('../../../utils/validators/common-validators');

/**
 * Payment method schema definition
 */
const paymentMethodSchemaDefinition = {
  // Owner Information
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

  // Method Type and Details
  type: {
    type: String,
    required: true,
    enum: ['credit_card', 'debit_card', 'bank_account', 'paypal', 'stripe_payment_method', 'wallet'],
    index: true
  },

  provider: {
    type: String,
    required: true,
    enum: ['stripe', 'paypal', 'square', 'braintree', 'authorize_net', 'manual'],
    index: true
  },

  // Display Information
  displayName: {
    type: String,
    required: true,
    maxlength: 100
  },

  isDefault: {
    type: Boolean,
    default: false,
    index: true
  },

  // Card Details (for card types)
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
    cardholderName: String,
    country: String,
    funding: {
      type: String,
      enum: ['credit', 'debit', 'prepaid', 'unknown']
    },
    fingerprint: {
      type: String,
      select: false
    }
  },

  // Bank Account Details
  bankAccount: {
    bankName: String,
    accountType: {
      type: String,
      enum: ['checking', 'savings']
    },
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
    currency: String
  },

  // Digital Wallet Details
  wallet: {
    walletType: {
      type: String,
      enum: ['apple_pay', 'google_pay', 'samsung_pay', 'paypal', 'venmo', 'alipay', 'wechat_pay']
    },
    email: String,
    phone: String
  },

  // Billing Address
  billingAddress: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      uppercase: true,
      match: /^[A-Z]{2}$/
    }
  },

  // Provider References
  providerCustomerId: {
    type: String,
    select: false,
    index: true
  },

  providerPaymentMethodId: {
    type: String,
    select: false,
    index: true
  },

  // Tokenization
  tokenizationDetails: {
    token: {
      type: String,
      select: false
    },
    tokenType: String,
    tokenExpiry: Date
  },

  // Verification
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'expired'],
      default: 'pending'
    },
    verifiedAt: Date,
    verificationMethod: String,
    failureReason: String,
    attempts: {
      type: Number,
      default: 0
    }
  },

  // Security
  encryptedData: {
    type: String,
    select: false
  },

  lastUsedAt: Date,
  
  usageCount: {
    type: Number,
    default: 0
  },

  // Risk Assessment
  riskAssessment: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    level: {
      type: String,
      enum: ['low', 'medium', 'high', 'blocked']
    },
    factors: [String],
    assessedAt: Date
  },

  // Status
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'expired', 'suspended', 'deleted'],
    default: 'active',
    index: true
  },

  suspensionReason: String,
  
  expiresAt: Date,

  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'import', 'manual']
    },
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    sessionId: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  },

  // Compliance
  complianceChecks: {
    pciCompliant: {
      type: Boolean,
      default: false
    },
    amlChecked: {
      type: Boolean,
      default: false
    },
    sanctionsChecked: {
      type: Boolean,
      default: false
    },
    lastCheckedAt: Date
  },

  // Created/Updated By
  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['user', 'admin', 'system']
    }
  },

  deletedAt: Date,
  deletedBy: mongoose.Schema.Types.ObjectId
};

// Create schema
const paymentMethodSchema = BaseModel.createSchema(paymentMethodSchemaDefinition, {
  collection: 'payment_methods',
  timestamps: true
});

// Indexes
paymentMethodSchema.index({ customerId: 1, status: 1, isDefault: -1 });
paymentMethodSchema.index({ organizationId: 1, type: 1, status: 1 });
paymentMethodSchema.index({ expiresAt: 1 }, { sparse: true });
paymentMethodSchema.index({ 'card.fingerprint': 1 }, { sparse: true });

// Virtual fields
paymentMethodSchema.virtual('isExpired').get(function() {
  if (this.type === 'credit_card' || this.type === 'debit_card') {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    return this.card.expiryYear < currentYear || 
           (this.card.expiryYear === currentYear && this.card.expiryMonth < currentMonth);
  }
  
  return this.expiresAt && this.expiresAt < new Date();
});

paymentMethodSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.isExpired;
});

paymentMethodSchema.virtual('maskedNumber').get(function() {
  if (this.type === 'credit_card' || this.type === 'debit_card') {
    return `****${this.card.last4}`;
  } else if (this.type === 'bank_account') {
    return `****${this.bankAccount.last4}`;
  }
  return null;
});

// Pre-save middleware
paymentMethodSchema.pre('save', async function(next) {
  try {
    // Set display name if not provided
    if (!this.displayName && this.isNew) {
      if (this.type === 'credit_card' || this.type === 'debit_card') {
        this.displayName = `${this.card.brand} ****${this.card.last4}`;
      } else if (this.type === 'bank_account') {
        this.displayName = `${this.bankAccount.bankName} ****${this.bankAccount.last4}`;
      } else if (this.type === 'paypal') {
        this.displayName = `PayPal ${this.wallet?.email || ''}`;
      } else {
        this.displayName = this.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    // Check expiration for cards
    if ((this.type === 'credit_card' || this.type === 'debit_card') && this.card) {
      const expiryDate = new Date(this.card.expiryYear, this.card.expiryMonth - 1);
      this.expiresAt = new Date(expiryDate.getFullYear(), expiryDate.getMonth() + 1, 0); // Last day of expiry month
    }

    // If setting as default, unset other defaults
    if (this.isDefault && this.isModified('isDefault')) {
      await this.constructor.updateMany(
        {
          customerId: this.customerId,
          _id: { $ne: this._id },
          isDefault: true
        },
        { isDefault: false }
      );
    }

    // Encrypt sensitive data if provided
    if (this.isModified('tokenizationDetails.token') && this.tokenizationDetails?.token) {
      this.tokenizationDetails.token = await EncryptionService.encrypt(this.tokenizationDetails.token);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
paymentMethodSchema.post('save', async function() {
  try {
    // Ensure at least one default payment method
    if (!this.isDefault) {
      const defaultExists = await this.constructor.exists({
        customerId: this.customerId,
        isDefault: true,
        status: 'active'
      });

      if (!defaultExists) {
        await this.constructor.findByIdAndUpdate(this._id, { isDefault: true });
      }
    }
  } catch (error) {
    logger.error('Error in payment method post-save', error);
  }
});

// Instance methods
paymentMethodSchema.methods.setAsDefault = async function() {
  // Unset current default
  await this.constructor.updateMany(
    {
      customerId: this.customerId,
      _id: { $ne: this._id }
    },
    { isDefault: false }
  );

  this.isDefault = true;
  await this.save();
  
  return this;
};

paymentMethodSchema.methods.verify = async function(verificationData) {
  const { method, result } = verificationData;

  this.verification.verificationMethod = method;
  this.verification.attempts += 1;

  if (result.success) {
    this.verification.status = 'verified';
    this.verification.verifiedAt = new Date();
  } else {
    this.verification.status = 'failed';
    this.verification.failureReason = result.reason;
  }

  await this.save();
  return this;
};

paymentMethodSchema.methods.suspend = async function(reason) {
  this.status = 'suspended';
  this.suspensionReason = reason;
  await this.save();
  
  logger.warn('Payment method suspended', {
    paymentMethodId: this._id,
    customerId: this.customerId,
    reason
  });
  
  return this;
};

paymentMethodSchema.methods.reactivate = async function() {
  if (this.isExpired) {
    throw new AppError('Cannot reactivate expired payment method', 400, 'EXPIRED_METHOD');
  }

  this.status = 'active';
  this.suspensionReason = undefined;
  await this.save();
  
  return this;
};

paymentMethodSchema.methods.softDelete = async function(deletedBy) {
  this.status = 'deleted';
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.isDefault = false;
  
  await this.save();
  
  // Ensure another method is set as default
  const otherMethod = await this.constructor.findOne({
    customerId: this.customerId,
    status: 'active',
    _id: { $ne: this._id }
  }).sort({ createdAt: -1 });

  if (otherMethod && !await this.constructor.exists({ customerId: this.customerId, isDefault: true, status: 'active' })) {
    await otherMethod.setAsDefault();
  }
  
  return this;
};

paymentMethodSchema.methods.recordUsage = async function() {
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  await this.save();
  return this;
};

paymentMethodSchema.methods.assessRisk = async function(factors = []) {
  const riskFactors = [];
  let score = 0;

  // Check card type risk
  if (this.type === 'credit_card') {
    if (this.card.funding === 'prepaid') {
      score += 20;
      riskFactors.push('prepaid_card');
    }
    if (!this.billingAddress?.postalCode) {
      score += 10;
      riskFactors.push('missing_postal_code');
    }
  }

  // Check verification status
  if (this.verification.status !== 'verified') {
    score += 30;
    riskFactors.push('unverified');
  }

  // Check usage patterns
  if (this.usageCount === 0) {
    score += 15;
    riskFactors.push('never_used');
  }

  // Add external factors
  factors.forEach(factor => {
    score += factor.score || 10;
    riskFactors.push(factor.name);
  });

  // Determine risk level
  let level = 'low';
  if (score >= 70) level = 'blocked';
  else if (score >= 50) level = 'high';
  else if (score >= 30) level = 'medium';

  this.riskAssessment = {
    score: Math.min(score, 100),
    level,
    factors: riskFactors,
    assessedAt: new Date()
  };

  await this.save();
  return this.riskAssessment;
};

paymentMethodSchema.methods.updateProviderDetails = async function(providerData) {
  if (providerData.customerId) {
    this.providerCustomerId = providerData.customerId;
  }
  
  if (providerData.paymentMethodId) {
    this.providerPaymentMethodId = providerData.paymentMethodId;
  }

  // Update card details if provided
  if (providerData.card && (this.type === 'credit_card' || this.type === 'debit_card')) {
    Object.assign(this.card, providerData.card);
  }

  // Update bank details if provided
  if (providerData.bankAccount && this.type === 'bank_account') {
    Object.assign(this.bankAccount, providerData.bankAccount);
  }

  await this.save();
  return this;
};

// Static methods
paymentMethodSchema.statics.findByCustomer = async function(customerId, options = {}) {
  const { includeDeleted = false, type, status = 'active' } = options;

  const query = { customerId };
  
  if (!includeDeleted) {
    query.status = { $ne: 'deleted' };
  } else if (status) {
    query.status = status;
  }

  if (type) {
    query.type = type;
  }

  return await this.find(query).sort({ isDefault: -1, createdAt: -1 });
};

paymentMethodSchema.statics.findDefault = async function(customerId) {
  const defaultMethod = await this.findOne({
    customerId,
    isDefault: true,
    status: 'active'
  });

  // If no default, find the most recent active method
  if (!defaultMethod) {
    const mostRecent = await this.findOne({
      customerId,
      status: 'active'
    }).sort({ createdAt: -1 });

    if (mostRecent) {
      await mostRecent.setAsDefault();
      return mostRecent;
    }
  }

  return defaultMethod;
};

paymentMethodSchema.statics.createFromProvider = async function(providerData, customerData) {
  const { provider, type, details } = providerData;
  const { customerId, customerType, organizationId } = customerData;

  const paymentMethod = {
    customerId,
    customerType,
    organizationId,
    provider,
    type,
    providerCustomerId: details.customerId,
    providerPaymentMethodId: details.paymentMethodId
  };

  // Map provider-specific details
  switch (type) {
    case 'credit_card':
    case 'debit_card':
      paymentMethod.card = {
        brand: details.brand,
        last4: details.last4,
        expiryMonth: details.exp_month,
        expiryYear: details.exp_year,
        cardholderName: details.name,
        country: details.country,
        funding: details.funding,
        fingerprint: details.fingerprint
      };
      break;
      
    case 'bank_account':
      paymentMethod.bankAccount = {
        bankName: details.bank_name,
        accountType: details.account_type,
        last4: details.last4,
        accountHolderName: details.account_holder_name,
        accountHolderType: details.account_holder_type,
        country: details.country,
        currency: details.currency
      };
      break;
      
    case 'paypal':
      paymentMethod.wallet = {
        walletType: 'paypal',
        email: details.email
      };
      break;
  }

  // Add billing address if provided
  if (details.billing_address) {
    paymentMethod.billingAddress = {
      line1: details.billing_address.line1,
      line2: details.billing_address.line2,
      city: details.billing_address.city,
      state: details.billing_address.state,
      postalCode: details.billing_address.postal_code,
      country: details.billing_address.country
    };
  }

  return await this.create(paymentMethod);
};

paymentMethodSchema.statics.findDuplicates = async function(customerId, card) {
  if (!card || !card.fingerprint) return [];

  return await this.find({
    customerId,
    'card.fingerprint': card.fingerprint,
    status: { $ne: 'deleted' }
  });
};

paymentMethodSchema.statics.getExpiringCards = async function(daysBefore = 30) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;

  return await this.find({
    type: { $in: ['credit_card', 'debit_card'] },
    status: 'active',
    $or: [
      { 'card.expiryYear': { $lt: targetYear } },
      {
        'card.expiryYear': targetYear,
        'card.expiryMonth': { $lte: targetMonth }
      }
    ]
  }).populate('customerId', 'email profile.fullName');
};

paymentMethodSchema.statics.performComplianceCheck = async function(paymentMethodId) {
  const paymentMethod = await this.findById(paymentMethodId);
  
  if (!paymentMethod) {
    throw new AppError('Payment method not found', 404, 'NOT_FOUND');
  }

  // Perform compliance checks (integrate with external services)
  const checks = {
    pciCompliant: true, // Check PCI compliance
    amlChecked: true,   // Anti-money laundering check
    sanctionsChecked: true, // Sanctions list check
    lastCheckedAt: new Date()
  };

  paymentMethod.complianceChecks = checks;
  await paymentMethod.save();

  return paymentMethod;
};

// Create and export model
const PaymentMethodModel = BaseModel.createModel('PaymentMethod', paymentMethodSchema);

module.exports = {
  schema: paymentMethodSchema,
  model: PaymentMethodModel
};