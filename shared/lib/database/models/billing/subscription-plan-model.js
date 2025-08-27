'use strict';

/**
 * @fileoverview Subscription plan model for defining available billing plans
 * @module shared/lib/database/models/billing/subscription-plan-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/slug-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const slugHelper = require('../../../utils/helpers/slug-helper');

/**
 * Subscription plan schema definition
 */
const subscriptionPlanSchemaDefinition = {
  // ==================== Core Identity ====================
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
    index: true
  },

  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: /^[a-z0-9-]+$/
  },

  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000
  },

  tier: {
    type: String,
    enum: ['free', 'starter', 'basic', 'professional', 'enterprise', 'custom'],
    required: true,
    index: true
  },

  // ==================== Pricing Configuration ====================
  pricing: {
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

    amount: {
      type: Number,
      required: true,
      min: 0,
      get: v => Math.round(v * 100) / 100,
      set: v => Math.round(v * 100) / 100
    },

    interval: {
      type: String,
      enum: ['monthly', 'quarterly', 'semi-annual', 'annual', 'biennial', 'custom'],
      required: true,
      default: 'monthly'
    },

    intervalCount: {
      type: Number,
      default: 1,
      min: 1
    },

    trialDays: {
      type: Number,
      default: 14,
      min: 0,
      max: 365
    },

    setupFee: {
      type: Number,
      default: 0,
      min: 0
    },

    discounts: [{
      type: {
        type: String,
        enum: ['percentage', 'fixed']
      },
      value: Number,
      description: String,
      conditions: {
        minQuantity: Number,
        minCommitment: Number,
        promoCode: String
      }
    }],

    overageRates: {
      users: {
        rate: Number,
        unit: String
      },
      storage: {
        rate: Number,
        unit: String
      },
      apiCalls: {
        rate: Number,
        unit: String
      }
    }
  },

  // ==================== Features & Limits ====================
  features: {
    users: {
      limit: {
        type: Number,
        required: true,
        default: 5
      },
      description: String
    },

    projects: {
      limit: {
        type: Number,
        required: true,
        default: 3
      },
      description: String
    },

    storage: {
      limit: {
        type: Number,
        required: true,
        default: 1073741824 // 1GB in bytes
      },
      unit: {
        type: String,
        default: 'bytes'
      },
      description: String
    },

    apiCalls: {
      monthlyLimit: {
        type: Number,
        required: true,
        default: 10000
      },
      rateLimit: {
        requestsPerMinute: Number,
        requestsPerHour: Number,
        requestsPerDay: Number
      },
      description: String
    },

    customDomain: {
      enabled: {
        type: Boolean,
        default: false
      },
      limit: Number,
      description: String
    },

    whiteLabel: {
      enabled: {
        type: Boolean,
        default: false
      },
      description: String
    },

    advancedAnalytics: {
      enabled: {
        type: Boolean,
        default: false
      },
      retentionDays: Number,
      description: String
    },

    integrations: [{
      name: String,
      enabled: Boolean,
      limit: Number,
      description: String
    }],

    support: {
      level: {
        type: String,
        enum: ['community', 'email', 'priority', 'dedicated', 'white-glove'],
        default: 'community'
      },
      slaHours: Number,
      channels: [String],
      description: String
    },

    security: {
      mfaRequired: Boolean,
      ssoEnabled: Boolean,
      auditLogDays: Number,
      ipWhitelisting: Boolean,
      encryptionAtRest: Boolean,
      complianceCertifications: [String]
    },

    customFeatures: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Multi-Tenant Configuration ====================
  tenancy: {
    global: {
      type: Boolean,
      default: true
    },
    
    allowedTenants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant'
    }],

    excludedTenants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant'
    }],

    customPricingByTenant: [{
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant'
      },
      pricing: {
        amount: Number,
        currency: String,
        discounts: [mongoose.Schema.Types.Mixed]
      }
    }]
  },

  // ==================== Billing Provider Integration ====================
  providers: {
    stripe: {
      productId: String,
      priceId: String,
      testPriceId: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    paypal: {
      planId: String,
      testPlanId: String,
      metadata: mongoose.Schema.Types.Mixed
    },
    custom: mongoose.Schema.Types.Mixed
  },

  // ==================== Visibility & Availability ====================
  visibility: {
    public: {
      type: Boolean,
      default: true
    },

    availableForSignup: {
      type: Boolean,
      default: true
    },

    requiresApproval: {
      type: Boolean,
      default: false
    },

    targetAudience: {
      type: String,
      enum: ['individual', 'small_business', 'enterprise', 'nonprofit', 'educational', 'all'],
      default: 'all'
    },

    regions: [{
      code: String,
      name: String,
      available: Boolean
    }],

    startDate: Date,
    endDate: Date,

    maxSubscriptions: Number,
    currentSubscriptions: {
      type: Number,
      default: 0
    }
  },

  // ==================== Marketing & Display ====================
  marketing: {
    badge: {
      text: String,
      color: String,
      icon: String
    },

    highlights: [String],

    popularityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    recommended: {
      type: Boolean,
      default: false
    },

    sortOrder: {
      type: Number,
      default: 0
    },

    comparisons: [{
      competitorPlan: String,
      advantages: [String],
      priceComparison: String
    }],

    testimonials: [{
      author: String,
      company: String,
      content: String,
      rating: Number
    }]
  },

  // ==================== Terms & Conditions ====================
  terms: {
    contractLength: {
      minimum: Number,
      maximum: Number,
      unit: {
        type: String,
        enum: ['days', 'months', 'years']
      }
    },

    cancellation: {
      allowed: {
        type: Boolean,
        default: true
      },
      noticePeriodDays: {
        type: Number,
        default: 0
      },
      refundPolicy: {
        type: String,
        enum: ['none', 'prorated', 'full', 'custom'],
        default: 'prorated'
      },
      earlyTerminationFee: Number
    },

    renewal: {
      automatic: {
        type: Boolean,
        default: true
      },
      reminderDays: {
        type: Number,
        default: 7
      },
      gracePeriodDays: {
        type: Number,
        default: 3
      }
    },

    upgrade: {
      allowed: {
        type: Boolean,
        default: true
      },
      immediate: {
        type: Boolean,
        default: true
      },
      proration: {
        type: Boolean,
        default: true
      }
    },

    downgrade: {
      allowed: {
        type: Boolean,
        default: true
      },
      effectiveTiming: {
        type: String,
        enum: ['immediate', 'end_of_period'],
        default: 'end_of_period'
      }
    }
  },

  // ==================== Metadata & Status ====================
  metadata: {
    tags: [String],
    category: String,
    version: {
      type: String,
      default: '1.0.0'
    },
    previousVersions: [{
      version: String,
      deprecatedAt: Date,
      migrationPath: String
    }],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  status: {
    state: {
      type: String,
      enum: ['draft', 'active', 'deprecated', 'archived', 'deleted'],
      default: 'draft',
      index: true
    },

    activatedAt: Date,
    deprecatedAt: Date,
    archivedAt: Date,

    deprecationReason: String,
    migrationPlan: {
      targetPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      instructions: String,
      automatedMigration: Boolean
    }
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    totalSubscriptions: {
      type: Number,
      default: 0
    },
    activeSubscriptions: {
      type: Number,
      default: 0
    },
    churnRate: {
      type: Number,
      default: 0
    },
    averageLifetimeValue: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    },
    lastCalculated: Date
  }
};

// Create schema
const subscriptionPlanSchema = BaseModel.createSchema(subscriptionPlanSchemaDefinition, {
  collection: 'subscription_plans',
  timestamps: true
});

// ==================== Indexes ====================
subscriptionPlanSchema.index({ name: 1, 'status.state': 1 });
subscriptionPlanSchema.index({ tier: 1, 'status.state': 1 });
subscriptionPlanSchema.index({ 'pricing.amount': 1, 'pricing.interval': 1 });
subscriptionPlanSchema.index({ 'visibility.public': 1, 'visibility.availableForSignup': 1 });
subscriptionPlanSchema.index({ 'providers.stripe.priceId': 1 });
subscriptionPlanSchema.index({ 'marketing.sortOrder': 1 });

// ==================== Virtual Fields ====================
subscriptionPlanSchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

subscriptionPlanSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  return this.status.state === 'active' &&
         this.visibility.availableForSignup &&
         (!this.visibility.startDate || this.visibility.startDate <= now) &&
         (!this.visibility.endDate || this.visibility.endDate >= now) &&
         (!this.visibility.maxSubscriptions || this.visibility.currentSubscriptions < this.visibility.maxSubscriptions);
});

subscriptionPlanSchema.virtual('monthlyPrice').get(function() {
  const intervals = {
    monthly: 1,
    quarterly: 3,
    'semi-annual': 6,
    annual: 12,
    biennial: 24
  };
  
  const months = intervals[this.pricing.interval] || 1;
  return Math.round((this.pricing.amount / months) * 100) / 100;
});

subscriptionPlanSchema.virtual('yearlyPrice').get(function() {
  const intervals = {
    monthly: 12,
    quarterly: 4,
    'semi-annual': 2,
    annual: 1,
    biennial: 0.5
  };
  
  const multiplier = intervals[this.pricing.interval] || 12;
  return Math.round(this.pricing.amount * multiplier * 100) / 100;
});

subscriptionPlanSchema.virtual('formattedPrice').get(function() {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.pricing.currency
  });
  
  return formatter.format(this.pricing.amount);
});

// ==================== Pre-save Middleware ====================
subscriptionPlanSchema.pre('save', async function(next) {
  try {
    // Generate slug if not provided
    if (!this.slug && this.name) {
      this.slug = await this.constructor.generateUniqueSlug(this.name);
    }

    // Set activation date when moving to active
    if (this.isModified('status.state') && this.status.state === 'active' && !this.status.activatedAt) {
      this.status.activatedAt = new Date();
    }

    // Set deprecation date
    if (this.isModified('status.state') && this.status.state === 'deprecated' && !this.status.deprecatedAt) {
      this.status.deprecatedAt = new Date();
    }

    // Validate pricing
    if (this.pricing.amount < 0) {
      throw new AppError('Plan amount cannot be negative', 400, 'INVALID_AMOUNT');
    }

    // Validate features
    if (this.features.users.limit < 1) {
      throw new AppError('User limit must be at least 1', 400, 'INVALID_USER_LIMIT');
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
subscriptionPlanSchema.methods.activate = async function() {
  if (this.status.state === 'active') {
    throw new AppError('Plan is already active', 400, 'ALREADY_ACTIVE');
  }

  this.status.state = 'active';
  this.status.activatedAt = new Date();
  
  await this.save();
  
  logger.info('Subscription plan activated', {
    planId: this._id,
    name: this.name
  });
  
  return this;
};

subscriptionPlanSchema.methods.deprecate = async function(reason, targetPlanId = null) {
  if (this.status.state === 'deprecated') {
    throw new AppError('Plan is already deprecated', 400, 'ALREADY_DEPRECATED');
  }

  this.status.state = 'deprecated';
  this.status.deprecatedAt = new Date();
  this.status.deprecationReason = reason;
  
  if (targetPlanId) {
    this.status.migrationPlan = {
      targetPlanId,
      automatedMigration: false
    };
  }
  
  this.visibility.availableForSignup = false;
  
  await this.save();
  
  logger.warn('Subscription plan deprecated', {
    planId: this._id,
    name: this.name,
    reason
  });
  
  return this;
};

subscriptionPlanSchema.methods.updatePricing = async function(newPricing) {
  const previousPricing = { ...this.pricing.toObject() };
  
  Object.assign(this.pricing, newPricing);
  
  if (!this.metadata.previousVersions) {
    this.metadata.previousVersions = [];
  }
  
  this.metadata.previousVersions.push({
    version: this.metadata.version,
    deprecatedAt: new Date(),
    migrationPath: 'pricing_update'
  });
  
  // Increment version
  const versionParts = this.metadata.version.split('.');
  versionParts[1] = (parseInt(versionParts[1]) + 1).toString();
  this.metadata.version = versionParts.join('.');
  
  await this.save();
  
  logger.info('Subscription plan pricing updated', {
    planId: this._id,
    name: this.name,
    previousPricing,
    newPricing: this.pricing
  });
  
  return this;
};

subscriptionPlanSchema.methods.updateFeatures = async function(featureUpdates) {
  Object.keys(featureUpdates).forEach(key => {
    if (this.features[key] !== undefined) {
      if (typeof this.features[key] === 'object' && !Array.isArray(this.features[key])) {
        Object.assign(this.features[key], featureUpdates[key]);
      } else {
        this.features[key] = featureUpdates[key];
      }
    }
  });
  
  await this.save();
  
  logger.info('Subscription plan features updated', {
    planId: this._id,
    name: this.name,
    updates: featureUpdates
  });
  
  return this;
};

subscriptionPlanSchema.methods.addDiscount = async function(discount) {
  if (!this.pricing.discounts) {
    this.pricing.discounts = [];
  }
  
  this.pricing.discounts.push(discount);
  
  await this.save();
  
  logger.info('Discount added to subscription plan', {
    planId: this._id,
    discount
  });
  
  return this;
};

subscriptionPlanSchema.methods.setProviderIds = async function(provider, ids) {
  if (!this.providers[provider]) {
    this.providers[provider] = {};
  }
  
  Object.assign(this.providers[provider], ids);
  
  await this.save();
  
  logger.info('Provider IDs set for subscription plan', {
    planId: this._id,
    provider,
    ids
  });
  
  return this;
};

subscriptionPlanSchema.methods.calculatePrice = function(options = {}) {
  let price = this.pricing.amount;
  
  // Apply setup fee if new subscription
  if (options.isNew && this.pricing.setupFee) {
    price += this.pricing.setupFee;
  }
  
  // Apply discounts
  if (this.pricing.discounts && this.pricing.discounts.length > 0) {
    for (const discount of this.pricing.discounts) {
      if (this.isDiscountApplicable(discount, options)) {
        if (discount.type === 'percentage') {
          price *= (1 - discount.value / 100);
        } else {
          price -= discount.value;
        }
      }
    }
  }
  
  // Apply tenant-specific pricing
  if (options.tenantId && this.tenancy.customPricingByTenant) {
    const tenantPricing = this.tenancy.customPricingByTenant.find(
      tp => tp.tenantId.toString() === options.tenantId.toString()
    );
    
    if (tenantPricing) {
      price = tenantPricing.pricing.amount;
    }
  }
  
  return Math.max(0, Math.round(price * 100) / 100);
};

subscriptionPlanSchema.methods.isDiscountApplicable = function(discount, options = {}) {
  if (!discount.conditions) return true;
  
  const { conditions } = discount;
  
  if (conditions.minQuantity && options.quantity < conditions.minQuantity) {
    return false;
  }
  
  if (conditions.minCommitment && options.commitmentMonths < conditions.minCommitment) {
    return false;
  }
  
  if (conditions.promoCode && options.promoCode !== conditions.promoCode) {
    return false;
  }
  
  return true;
};

subscriptionPlanSchema.methods.isAvailableForTenant = function(tenantId) {
  if (this.tenancy.global) return true;
  
  if (this.tenancy.excludedTenants && this.tenancy.excludedTenants.length > 0) {
    if (this.tenancy.excludedTenants.some(id => id.toString() === tenantId.toString())) {
      return false;
    }
  }
  
  if (this.tenancy.allowedTenants && this.tenancy.allowedTenants.length > 0) {
    return this.tenancy.allowedTenants.some(id => id.toString() === tenantId.toString());
  }
  
  return true;
};

subscriptionPlanSchema.methods.updateAnalytics = async function() {
  // This would be called by a scheduled job to update plan analytics
  const SubscriptionModel = mongoose.model('Subscription');
  
  const stats = await SubscriptionModel.aggregate([
    {
      $match: {
        planId: this._id,
        'status.state': { $in: ['active', 'past_due', 'cancelled'] }
      }
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
              }
            }
          }
        ],
        revenue: [
          {
            $match: { 'status.state': 'active' }
          },
          {
            $group: {
              _id: null,
              totalMrr: { $sum: '$billing.amount' },
              avgLifetimeValue: { $avg: '$analytics.lifetimeValue' }
            }
          }
        ]
      }
    }
  ]);
  
  const totals = stats[0].totals[0] || { total: 0, active: 0 };
  const revenue = stats[0].revenue[0] || { totalMrr: 0, avgLifetimeValue: 0 };
  
  this.analytics.totalSubscriptions = totals.total;
  this.analytics.activeSubscriptions = totals.active;
  this.analytics.averageLifetimeValue = revenue.avgLifetimeValue;
  this.analytics.lastCalculated = new Date();
  
  // Calculate churn rate (simplified)
  if (totals.total > 0) {
    this.analytics.churnRate = ((totals.total - totals.active) / totals.total) * 100;
  }
  
  await this.save();
  
  return this.analytics;
};

// ==================== Static Methods ====================
subscriptionPlanSchema.statics.generateUniqueSlug = async function(baseName) {
  let slug = slugHelper.createSlug(baseName);
  let counter = 0;
  let uniqueSlug = slug;
  
  while (await this.exists({ slug: uniqueSlug })) {
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
  
  return uniqueSlug;
};

subscriptionPlanSchema.statics.findActivePlans = async function(options = {}) {
  const query = {
    'status.state': 'active',
    'visibility.public': true
  };
  
  if (options.tier) {
    query.tier = options.tier;
  }
  
  if (options.availableForSignup) {
    query['visibility.availableForSignup'] = true;
  }
  
  if (options.tenantId) {
    query.$or = [
      { 'tenancy.global': true },
      { 'tenancy.allowedTenants': options.tenantId }
    ];
    query['tenancy.excludedTenants'] = { $ne: options.tenantId };
  }
  
  const plans = await this.find(query)
    .sort({ 'marketing.sortOrder': 1, 'pricing.amount': 1 });
  
  // Filter by availability dates
  const now = new Date();
  return plans.filter(plan => {
    if (plan.visibility.startDate && plan.visibility.startDate > now) return false;
    if (plan.visibility.endDate && plan.visibility.endDate < now) return false;
    return true;
  });
};

subscriptionPlanSchema.statics.findPlanBySlug = async function(slug) {
  return await this.findOne({
    slug: slug.toLowerCase(),
    'status.state': { $ne: 'deleted' }
  });
};

subscriptionPlanSchema.statics.findPlanByStripeId = async function(priceId) {
  return await this.findOne({
    $or: [
      { 'providers.stripe.priceId': priceId },
      { 'providers.stripe.testPriceId': priceId }
    ],
    'status.state': 'active'
  });
};

subscriptionPlanSchema.statics.getRecommendedPlan = async function(criteria = {}) {
  const query = {
    'status.state': 'active',
    'visibility.public': true,
    'visibility.availableForSignup': true
  };
  
  // Add criteria-based filtering
  if (criteria.targetAudience) {
    query['visibility.targetAudience'] = { $in: [criteria.targetAudience, 'all'] };
  }
  
  if (criteria.maxPrice) {
    query['pricing.amount'] = { $lte: criteria.maxPrice };
  }
  
  if (criteria.minUsers) {
    query['features.users.limit'] = { $gte: criteria.minUsers };
  }
  
  // Find plans sorted by recommendation and popularity
  const plans = await this.find(query)
    .sort({
      'marketing.recommended': -1,
      'marketing.popularityScore': -1,
      'marketing.sortOrder': 1
    })
    .limit(3);
  
  return plans[0] || null;
};

subscriptionPlanSchema.statics.comparePlans = async function(planIds) {
  const plans = await this.find({
    _id: { $in: planIds },
    'status.state': 'active'
  });
  
  if (plans.length !== planIds.length) {
    throw new AppError('One or more plans not found', 404, 'PLANS_NOT_FOUND');
  }
  
  // Create comparison matrix
  const comparison = {
    plans: plans.map(plan => ({
      id: plan._id,
      name: plan.displayName,
      tier: plan.tier,
      pricing: plan.pricing,
      monthlyPrice: plan.monthlyPrice
    })),
    features: {}
  };
  
  // Compare common features
  const featureKeys = ['users', 'projects', 'storage', 'apiCalls', 'customDomain', 
                       'whiteLabel', 'advancedAnalytics', 'support'];
  
  featureKeys.forEach(key => {
    comparison.features[key] = plans.map(plan => {
      const feature = plan.features[key];
      if (typeof feature === 'object' && feature.limit !== undefined) {
        return feature.limit;
      } else if (typeof feature === 'object' && feature.enabled !== undefined) {
        return feature.enabled;
      } else if (typeof feature === 'object' && feature.level !== undefined) {
        return feature.level;
      }
      return feature;
    });
  });
  
  return comparison;
};

// Create and export model
const SubscriptionPlanModel = BaseModel.createModel('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlanModel;