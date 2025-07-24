'use strict';

/**
 * @fileoverview Subscription plan model for defining pricing and features
 * @module shared/lib/database/models/organizations/subscription-plan-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const stringHelper = require('../../../utils/helpers/string-helper');

/**
 * Subscription plan schema definition
 */
const subscriptionPlanSchemaDefinition = {
  // Plan Identification
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },

  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9_-]+$/,
    index: true
  },

  description: {
    type: String,
    maxlength: 500
  },

  // Plan Type
  type: {
    type: String,
    required: true,
    enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
    index: true
  },

  category: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'addon', 'special'],
    default: 'standard'
  },

  // Pricing
  pricing: {
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
    billingInterval: {
      type: String,
      required: true,
      enum: ['day', 'week', 'month', 'year', 'lifetime'],
      default: 'month'
    },
    billingIntervalCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    trialDays: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // Tiered Pricing
  tiers: [{
    minQuantity: {
      type: Number,
      required: true,
      min: 1
    },
    maxQuantity: Number,
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    flatPrice: Number
  }],

  // Usage-based Pricing
  usagePricing: [{
    metric: {
      type: String,
      required: true
    },
    unit: String,
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0
    },
    includedUnits: {
      type: Number,
      default: 0
    },
    overage: {
      enabled: {
        type: Boolean,
        default: true
      },
      pricePerUnit: Number
    }
  }],

  // Features
  features: [{
    name: {
      type: String,
      required: true
    },
    code: String,
    description: String,
    value: mongoose.Schema.Types.Mixed,
    displayValue: String,
    category: String,
    highlighted: {
      type: Boolean,
      default: false
    }
  }],

  // Limits
  limits: {
    users: {
      min: Number,
      max: Number,
      included: Number,
      pricePerAdditional: Number
    },
    projects: {
      max: Number,
      unlimited: Boolean
    },
    storage: {
      amount: Number,
      unit: {
        type: String,
        enum: ['MB', 'GB', 'TB'],
        default: 'GB'
      },
      pricePerAdditionalGB: Number
    },
    apiCalls: {
      perMonth: Number,
      perDay: Number,
      perHour: Number
    },
    customFields: Number,
    integrations: Number,
    emailsPerMonth: Number,
    supportLevel: {
      type: String,
      enum: ['none', 'email', 'priority', '24x7', 'dedicated']
    }
  },

  // Add-ons
  availableAddons: [{
    addonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan'
    },
    required: Boolean,
    maxQuantity: Number
  }],

  isAddon: {
    type: Boolean,
    default: false
  },

  compatiblePlans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan'
  }],

  // Discounts
  discounts: [{
    name: String,
    type: {
      type: String,
      enum: ['percentage', 'fixed']
    },
    value: Number,
    conditions: {
      minQuantity: Number,
      minCommitmentMonths: Number,
      validFrom: Date,
      validUntil: Date
    }
  }],

  // Display Settings
  displayOrder: {
    type: Number,
    default: 0
  },

  highlighted: {
    type: Boolean,
    default: false
  },

  badge: {
    text: String,
    color: String
  },

  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'public'
  },

  // Target Audience
  targetAudience: {
    customerTypes: [{
      type: String,
      enum: ['individual', 'team', 'business', 'enterprise']
    }],
    industries: [String],
    companySize: [{
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']
    }]
  },

  // Status
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'deprecated', 'beta'],
    default: 'active',
    index: true
  },

  // Lifecycle
  availableFrom: Date,
  availableUntil: Date,
  deprecatedAt: Date,
  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan'
  },

  // Provider Integration
  providers: [{
    name: {
      type: String,
      enum: ['stripe', 'paypal', 'internal']
    },
    externalId: String,
    productId: String,
    priceId: String,
    syncedAt: Date
  }],

  // Metadata
  metadata: {
    tags: [String],
    customAttributes: mongoose.Schema.Types.Mixed,
    internalNotes: String
  },

  // Terms and Conditions
  terms: {
    minimumCommitment: {
      duration: Number,
      unit: {
        type: String,
        enum: ['days', 'months', 'years']
      }
    },
    autoRenewal: {
      type: Boolean,
      default: true
    },
    cancellationPolicy: {
      type: String,
      enum: ['immediate', 'end_of_period', 'with_notice'],
      default: 'end_of_period'
    },
    refundPolicy: {
      type: String,
      enum: ['none', 'prorated', 'full_30_days', 'custom']
    },
    customTerms: String
  },

  // Upgrade/Downgrade Rules
  migrationRules: {
    canUpgradeTo: [{
      planId: mongoose.Schema.Types.ObjectId,
      allowMidCycle: Boolean,
      prorationEnabled: Boolean
    }],
    canDowngradeTo: [{
      planId: mongoose.Schema.Types.ObjectId,
      allowMidCycle: Boolean,
      restrictions: String
    }]
  },

  // Analytics
  analytics: {
    totalSubscriptions: {
      type: Number,
      default: 0
    },
    activeSubscriptions: {
      type: Number,
      default: 0
    },
    monthlyRevenue: {
      type: Number,
      default: 0
    },
    averageLifetimeValue: Number,
    churnRate: Number,
    conversionRate: Number
  },

  // Localization
  localization: [{
    locale: {
      type: String,
      required: true
    },
    name: String,
    description: String,
    features: [{
      name: String,
      description: String
    }],
    currency: String,
    amount: Number
  }],

  // Audit
  createdBy: {
    userId: mongoose.Schema.Types.ObjectId,
    userType: {
      type: String,
      enum: ['admin', 'system']
    }
  },

  lastModifiedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    modifiedAt: Date
  }
};

// Create schema
const subscriptionPlanSchema = BaseModel.createSchema(subscriptionPlanSchemaDefinition, {
  collection: 'subscription_plans',
  timestamps: true
});

// Indexes
subscriptionPlanSchema.index({ type: 1, status: 1 });
subscriptionPlanSchema.index({ 'pricing.amount': 1, 'pricing.billingInterval': 1 });
subscriptionPlanSchema.index({ visibility: 1, status: 1, displayOrder: 1 });
subscriptionPlanSchema.index({ isAddon: 1, status: 1 });

// Virtual fields
subscriptionPlanSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  return this.status === 'active' &&
         (!this.availableFrom || this.availableFrom <= now) &&
         (!this.availableUntil || this.availableUntil > now);
});

subscriptionPlanSchema.virtual('monthlyPrice').get(function() {
  const { amount, billingInterval, billingIntervalCount } = this.pricing;
  
  switch (billingInterval) {
    case 'month':
      return amount / billingIntervalCount;
    case 'year':
      return amount / (billingIntervalCount * 12);
    case 'week':
      return (amount * 52) / (billingIntervalCount * 12);
    case 'day':
      return (amount * 365) / (billingIntervalCount * 12);
    default:
      return amount;
  }
});

subscriptionPlanSchema.virtual('yearlyPrice').get(function() {
  return this.monthlyPrice * 12;
});

subscriptionPlanSchema.virtual('hasFreeTrial').get(function() {
  return this.pricing.trialDays > 0;
});

subscriptionPlanSchema.virtual('isFree').get(function() {
  return this.pricing.amount === 0 || this.type === 'free';
});

// Pre-save middleware
subscriptionPlanSchema.pre('save', async function(next) {
  try {
    // Generate code from name if not provided
    if (!this.code && this.name) {
      this.code = stringHelper.slugify(this.name).toUpperCase().replace(/-/g, '_');
      
      // Ensure uniqueness
      let counter = 1;
      let code = this.code;
      while (await this.constructor.exists({ code, _id: { $ne: this._id } })) {
        code = `${this.code}_${counter}`;
        counter++;
      }
      this.code = code;
    }

    // Sort tiers by minQuantity
    if (this.tiers && this.tiers.length > 0) {
      this.tiers.sort((a, b) => a.minQuantity - b.minQuantity);
    }

    // Update analytics if status changed
    if (this.isModified('status') && this.status === 'deprecated') {
      this.deprecatedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
subscriptionPlanSchema.methods.addFeature = async function(feature) {
  const existingFeature = this.features.find(f => f.code === feature.code);
  
  if (existingFeature) {
    Object.assign(existingFeature, feature);
  } else {
    this.features.push(feature);
  }
  
  await this.save();
  return this;
};

subscriptionPlanSchema.methods.removeFeature = async function(featureCode) {
  this.features = this.features.filter(f => f.code !== featureCode);
  await this.save();
  return this;
};

subscriptionPlanSchema.methods.updatePricing = async function(newPricing) {
  Object.assign(this.pricing, newPricing);
  
  await this.save();

  logger.info('Plan pricing updated', {
    planId: this._id,
    code: this.code,
    newPricing
  });

  return this;
};

subscriptionPlanSchema.methods.addTier = async function(tier) {
  if (!this.tiers) {
    this.tiers = [];
  }
  
  this.tiers.push(tier);
  this.tiers.sort((a, b) => a.minQuantity - b.minQuantity);
  
  await this.save();
  return this;
};

subscriptionPlanSchema.methods.deprecate = async function(replacementPlanId) {
  this.status = 'deprecated';
  this.deprecatedAt = new Date();
  
  if (replacementPlanId) {
    this.replacedBy = replacementPlanId;
  }
  
  await this.save();

  logger.warn('Subscription plan deprecated', {
    planId: this._id,
    code: this.code,
    replacedBy: replacementPlanId
  });

  return this;
};

subscriptionPlanSchema.methods.activate = async function() {
  if (this.status === 'active') {
    return this;
  }

  this.status = 'active';
  await this.save();

  return this;
};

subscriptionPlanSchema.methods.calculatePrice = function(options = {}) {
  const { quantity = 1, billingPeriods = 1, includeTax = false } = options;
  
  let basePrice = this.pricing.amount;

  // Apply tiered pricing if applicable
  if (this.tiers && this.tiers.length > 0) {
    for (const tier of this.tiers) {
      if (quantity >= tier.minQuantity && (!tier.maxQuantity || quantity <= tier.maxQuantity)) {
        basePrice = tier.flatPrice || (tier.unitPrice * quantity);
        break;
      }
    }
  } else {
    basePrice = basePrice * quantity;
  }

  // Apply billing periods
  const totalPrice = basePrice * billingPeriods;

  // Apply tax if requested (placeholder - implement actual tax calculation)
  const finalPrice = includeTax ? totalPrice * 1.1 : totalPrice;

  return {
    basePrice,
    totalPrice,
    finalPrice,
    quantity,
    billingPeriods,
    currency: this.pricing.currency
  };
};

subscriptionPlanSchema.methods.canUpgradeTo = function(targetPlanId) {
  return this.migrationRules?.canUpgradeTo?.some(
    rule => rule.planId.toString() === targetPlanId.toString()
  );
};

subscriptionPlanSchema.methods.canDowngradeTo = function(targetPlanId) {
  return this.migrationRules?.canDowngradeTo?.some(
    rule => rule.planId.toString() === targetPlanId.toString()
  );
};

subscriptionPlanSchema.methods.syncWithProvider = async function(provider, externalData) {
  const providerConfig = this.providers.find(p => p.name === provider);
  
  if (providerConfig) {
    Object.assign(providerConfig, externalData);
    providerConfig.syncedAt = new Date();
  } else {
    this.providers.push({
      name: provider,
      ...externalData,
      syncedAt: new Date()
    });
  }
  
  await this.save();
  return this;
};

subscriptionPlanSchema.methods.updateAnalytics = async function(metrics) {
  Object.assign(this.analytics, metrics);
  await this.save();
  return this;
};

subscriptionPlanSchema.methods.getLocalized = function(locale) {
  const localized = this.localization?.find(l => l.locale === locale);
  
  if (!localized) {
    return {
      name: this.name,
      description: this.description,
      features: this.features,
      pricing: this.pricing
    };
  }

  return {
    name: localized.name || this.name,
    description: localized.description || this.description,
    features: localized.features || this.features,
    pricing: {
      ...this.pricing,
      currency: localized.currency || this.pricing.currency,
      amount: localized.amount || this.pricing.amount
    }
  };
};

// Static methods
subscriptionPlanSchema.statics.findActive = async function(options = {}) {
  const { 
    type, 
    visibility = 'public',
    includeAddons = false,
    locale
  } = options;

  const query = {
    status: 'active',
    visibility
  };

  if (type) {
    query.type = type;
  }

  if (!includeAddons) {
    query.isAddon = false;
  }

  const plans = await this.find(query).sort({ displayOrder: 1, 'pricing.amount': 1 });

  // Apply localization if requested
  if (locale) {
    return plans.map(plan => ({
      ...plan.toObject(),
      ...plan.getLocalized(locale)
    }));
  }

  return plans;
};

subscriptionPlanSchema.statics.findByCode = async function(code) {
  return await this.findOne({ 
    code: code.toUpperCase(),
    status: { $ne: 'deprecated' }
  });
};

subscriptionPlanSchema.statics.findAddonsForPlan = async function(planId) {
  const plan = await this.findById(planId);
  
  if (!plan || !plan.availableAddons) {
    return [];
  }

  const addonIds = plan.availableAddons.map(a => a.addonId);
  
  return await this.find({
    _id: { $in: addonIds },
    status: 'active',
    isAddon: true
  });
};

subscriptionPlanSchema.statics.findUpgradeOptions = async function(currentPlanId) {
  const currentPlan = await this.findById(currentPlanId);
  
  if (!currentPlan) {
    return [];
  }

  const upgradeableIds = currentPlan.migrationRules?.canUpgradeTo?.map(r => r.planId) || [];
  
  // Also find plans with higher price in same category
  const higherPricePlans = await this.find({
    type: { $ne: 'free' },
    status: 'active',
    visibility: 'public',
    'pricing.amount': { $gt: currentPlan.pricing.amount },
    'pricing.billingInterval': currentPlan.pricing.billingInterval
  });

  const allUpgradeIds = [...new Set([
    ...upgradeableIds.map(id => id.toString()),
    ...higherPricePlans.map(p => p._id.toString())
  ])];

  return await this.find({
    _id: { $in: allUpgradeIds }
  }).sort({ 'pricing.amount': 1 });
};

subscriptionPlanSchema.statics.compareFeatures = async function(planIds) {
  const plans = await this.find({
    _id: { $in: planIds },
    status: 'active'
  }).sort({ 'pricing.amount': 1 });

  // Extract all unique features
  const allFeatures = new Set();
  plans.forEach(plan => {
    plan.features.forEach(feature => {
      allFeatures.add(feature.code || feature.name);
    });
  });

  // Build comparison matrix
  const comparison = {
    plans: plans.map(plan => ({
      id: plan._id,
      name: plan.name,
      price: plan.pricing.amount,
      interval: plan.pricing.billingInterval
    })),
    features: Array.from(allFeatures).map(featureKey => {
      const row = { feature: featureKey };
      
      plans.forEach(plan => {
        const feature = plan.features.find(f => 
          (f.code || f.name) === featureKey
        );
        row[plan._id] = feature ? (feature.value || true) : false;
      });
      
      return row;
    })
  };

  return comparison;
};

subscriptionPlanSchema.statics.getMostPopular = async function(limit = 3) {
  return await this.find({
    status: 'active',
    visibility: 'public',
    isAddon: false
  })
  .sort({ 'analytics.activeSubscriptions': -1 })
  .limit(limit);
};

// Create and export model
const SubscriptionPlanModel = BaseModel.createModel('SubscriptionPlan', subscriptionPlanSchema);

module.exports = {
  schema: subscriptionPlanSchema,
  model: SubscriptionPlanModel
};