'use strict';

/**
 * @fileoverview Enhanced hosted organization model with multi-tenancy and subscription management
 * @module shared/lib/database/models/organizations/organization-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/slug-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const validators = require('../../../../../utils/validators/common-validators');
const slugHelper = require('../../../../../utils/helpers/slug-helper');

/**
 * Enhanced hosted organization schema definition
 */
const organizationSchemaDefinition = {
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
    trim: true,
    maxlength: 200
  },

  legalName: {
    type: String,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000
  },

  type: {
    type: String,
    enum: ['individual', 'business', 'nonprofit', 'government', 'educational', 'healthcare', 'system', 'other'],
    default: 'business',
    index: true
  },

  industry: {
    type: String,
    enum: [
      'technology', 'healthcare', 'finance', 'retail', 'manufacturing',
      'education', 'real_estate', 'hospitality', 'transportation',
      'energy', 'agriculture', 'media', 'entertainment', 'consulting',
      'legal', 'nonprofit', 'government', 'other'
    ]
  },

  size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'],
    default: '1-10'
  },

  // ==================== Contact Information ====================
  contact: {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: validators.isEmail,
        message: 'Invalid email address'
      }
    },
    phone: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return validators.isPhoneNumber(value);
        },
        message: 'Invalid phone number'
      }
    },
    website: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return validators.isURL(value);
        },
        message: 'Invalid website URL'
      }
    },
    supportEmail: String,
    salesEmail: String,
    billingEmail: String
  },

  address: {
    street1: String,
    street2: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      default: 'US'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },

  // ==================== Ownership & Management ====================
  ownership: {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    transferHistory: [{
      fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      transferredAt: Date,
      reason: String
    }]
  },

  // ==================== Multi-Tenancy Configuration ====================
  tenancy: {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      unique: true,
      sparse: true
    },
    isolationLevel: {
      type: String,
      enum: ['shared', 'logical', 'physical'],
      default: 'logical'
    },
    dataResidency: {
      region: String,
      requirements: [String]
    },
    customDomain: {
      domain: String,
      verified: {
        type: Boolean,
        default: false
      },
      verificationToken: String,
      sslEnabled: {
        type: Boolean,
        default: false
      },
      dnsRecords: [{
        type: String,
        name: String,
        value: String,
        verified: Boolean
      }]
    },
    subdomainPrefix: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      match: /^[a-z0-9-]+$/
    }
  },

  // ==================== Subscription & Billing ====================
  subscription: {
    status: {
      type: String,
      enum: ['free_trial', 'active', 'past_due', 'cancelled', 'expired', 'paused'],
      default: 'free_trial',
      index: true
    },
    tier: {
      type: String,
      enum: ['free_trial', 'starter', 'basic', 'professional', 'enterprise', 'custom'],
      default: 'free_trial',
      index: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan'
    },
    trial: {
      startDate: {
        type: Date,
        default: Date.now
      },
      endDate: Date,
      daysRemaining: Number,
      extended: {
        type: Boolean,
        default: false
      },
      extensionHistory: [{
        extendedBy: Number,
        extendedAt: Date,
        reason: String,
        authorizedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    },
    currentPeriod: {
      startDate: Date,
      endDate: Date,
      billingCycle: {
        type: String,
        enum: ['monthly', 'quarterly', 'semi-annual', 'annual', 'biennial'],
        default: 'monthly'
      }
    },
    nextBilling: {
      date: Date,
      amount: Number,
      currency: {
        type: String,
        default: 'USD'
      }
    },
    cancellation: {
      requestedAt: Date,
      effectiveDate: Date,
      reason: String,
      feedback: String,
      byUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },

  billing: {
    customerId: {
      stripe: String,
      paypal: String,
      other: mongoose.Schema.Types.Mixed
    },
    paymentMethods: [{
      methodId: String,
      type: {
        type: String,
        enum: ['card', 'bank_account', 'paypal', 'invoice', 'wire_transfer', 'crypto']
      },
      isDefault: Boolean,
      last4: String,
      brand: String,
      expiryMonth: Number,
      expiryYear: Number,
      bankName: String,
      accountType: String,
      addedAt: Date
    }],
    invoices: [{
      invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
      },
      number: String,
      amount: Number,
      currency: String,
      status: String,
      dueDate: Date,
      paidAt: Date
    }],
    credits: {
      balance: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: 'USD'
      },
      transactions: [{
        amount: Number,
        type: {
          type: String,
          enum: ['added', 'used', 'refunded', 'expired']
        },
        description: String,
        createdAt: Date
      }]
    },
    taxInfo: {
      taxId: String,
      vatId: String,
      taxExempt: {
        type: Boolean,
        default: false
      },
      taxExemptId: String
    }
  },

  // ==================== Features & Limits ====================
  features: {
    users: {
      limit: {
        type: Number,
        default: 5
      },
      current: {
        type: Number,
        default: 0
      }
    },
    projects: {
      limit: {
        type: Number,
        default: 3
      },
      current: {
        type: Number,
        default: 0
      }
    },
    storage: {
      limit: {
        type: Number,
        default: 1073741824 // 1GB in bytes
      },
      used: {
        type: Number,
        default: 0
      }
    },
    apiCalls: {
      monthlyLimit: {
        type: Number,
        default: 10000
      },
      used: {
        type: Number,
        default: 0
      },
      resetDate: Date
    },
    customDomain: {
      enabled: {
        type: Boolean,
        default: false
      }
    },
    whiteLabel: {
      enabled: {
        type: Boolean,
        default: false
      }
    },
    advancedAnalytics: {
      enabled: {
        type: Boolean,
        default: false
      }
    },
    apiAccess: {
      enabled: {
        type: Boolean,
        default: false
      },
      rateLimit: Number
    },
    support: {
      level: {
        type: String,
        enum: ['community', 'email', 'priority', 'dedicated', 'white-glove'],
        default: 'community'
      },
      slaHours: Number
    },
    integrations: [{
      name: String,
      enabled: Boolean,
      configuration: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Branding & Customization ====================
  branding: {
    logo: {
      url: String,
      publicId: String,
      darkModeUrl: String
    },
    favicon: {
      url: String,
      publicId: String
    },
    colors: {
      primary: {
        type: String,
        default: '#1976D2'
      },
      secondary: {
        type: String,
        default: '#424242'
      },
      accent: {
        type: String,
        default: '#82B1FF'
      },
      background: String,
      text: String
    },
    theme: {
      mode: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'light'
      },
      customCss: String,
      customJs: String
    },
    emailTemplates: {
      headerHtml: String,
      footerHtml: String,
      customStyles: String
    },
    socialLinks: {
      facebook: String,
      twitter: String,
      linkedin: String,
      instagram: String,
      youtube: String,
      github: String
    }
  },

  // ==================== Settings & Configuration ====================
  settings: {
    general: {
      dateFormat: {
        type: String,
        default: 'MM/DD/YYYY'
      },
      timeFormat: {
        type: String,
        enum: ['12h', '24h'],
        default: '12h'
      },
      startOfWeek: {
        type: String,
        enum: ['sunday', 'monday'],
        default: 'sunday'
      },
      fiscalYearStart: {
        type: String,
        default: 'january'
      }
    },
    security: {
      requireMfa: {
        type: Boolean,
        default: false
      },
      passwordPolicy: {
        minLength: {
          type: Number,
          default: 8
        },
        requireUppercase: Boolean,
        requireNumbers: Boolean,
        requireSpecialChars: Boolean,
        expiryDays: Number
      },
      sessionTimeout: {
        type: Number,
        default: 1800 // 30 minutes
      },
      ipWhitelist: [String],
      allowedDomains: [String],
      ssoEnabled: {
        type: Boolean,
        default: false
      },
      ssoProvider: {
        type: String,
        enum: ['saml', 'oidc', 'oauth2']
      },
      ssoConfiguration: mongoose.Schema.Types.Mixed
    },
    notifications: {
      channels: {
        email: {
          enabled: { type: Boolean, default: true },
          settings: mongoose.Schema.Types.Mixed
        },
        slack: {
          enabled: { type: Boolean, default: false },
          webhookUrl: String,
          channel: String
        },
        webhook: {
          enabled: { type: Boolean, default: false },
          urls: [String]
        }
      },
      preferences: {
        newUserSignup: Boolean,
        billingAlerts: Boolean,
        securityAlerts: Boolean,
        systemUpdates: Boolean,
        usageAlerts: Boolean
      }
    },
    compliance: {
      dataRetention: {
        enabled: Boolean,
        days: Number
      },
      auditLog: {
        enabled: {
          type: Boolean,
          default: true
        },
        retentionDays: {
          type: Number,
          default: 365
        }
      },
      gdprCompliant: Boolean,
      hipaaCompliant: Boolean,
      soc2Compliant: Boolean
    }
  },

  // ==================== Team & Collaboration ====================
  team: {
    departments: [{
      departmentId: mongoose.Schema.Types.ObjectId,
      name: String,
      description: String,
      managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      memberCount: Number,
      createdAt: Date
    }],
    teams: [{
      teamId: mongoose.Schema.Types.ObjectId,
      name: String,
      description: String,
      leaderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      departmentId: mongoose.Schema.Types.ObjectId,
      memberCount: Number,
      createdAt: Date
    }],
    roles: [{
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
      },
      name: String,
      description: String,
      isCustom: Boolean,
      permissions: [String],
      memberCount: Number
    }]
  },

  // ==================== Integration & API ====================
  integrations: {
    oauth: {
      clientId: String,
      clientSecret: {
        type: String,
        select: false
      },
      redirectUris: [String],
      scopes: [String]
    },
    webhooks: [{
      webhookId: mongoose.Schema.Types.ObjectId,
      url: String,
      events: [String],
      secret: {
        type: String,
        select: false
      },
      active: Boolean,
      failures: Number,
      lastTriggeredAt: Date
    }],
    apiKeys: [{
      keyId: String,
      name: String,
      key: {
        type: String,
        select: false
      },
      scopes: [String],
      lastUsedAt: Date,
      expiresAt: Date,
      active: Boolean
    }],
    connectedApps: [{
      appId: String,
      name: String,
      provider: String,
      connectedAt: Date,
      lastSyncAt: Date,
      configuration: mongoose.Schema.Types.Mixed,
      status: {
        type: String,
        enum: ['active', 'error', 'paused']
      }
    }]
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    metrics: {
      totalUsers: {
        type: Number,
        default: 0
      },
      activeUsers: {
        type: Number,
        default: 0
      },
      totalProjects: {
        type: Number,
        default: 0
      },
      totalRevenue: {
        type: Number,
        default: 0
      },
      mrr: {
        type: Number,
        default: 0
      },
      churnRate: {
        type: Number,
        default: 0
      },
      nps: {
        score: Number,
        lastMeasured: Date
      }
    },
    usage: {
      daily: [{
        date: Date,
        logins: Number,
        apiCalls: Number,
        dataTransfer: Number
      }],
      monthly: [{
        month: String,
        year: Number,
        summary: mongoose.Schema.Types.Mixed
      }]
    },
    growth: {
      userGrowthRate: Number,
      revenueGrowthRate: Number,
      lastCalculated: Date
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending', 'archived', 'deleted'],
      default: 'pending',
      index: true
    },
    health: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 100
      },
      factors: {
        payment: Number,
        usage: Number,
        engagement: Number,
        support: Number
      },
      lastCalculated: Date
    },
    suspension: {
      reason: String,
      suspendedAt: Date,
      suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      willDeleteAt: Date
    },
    verification: {
      email: {
        verified: {
          type: Boolean,
          default: false
        },
        verifiedAt: Date
      },
      domain: {
        verified: {
          type: Boolean,
          default: false
        },
        verifiedAt: Date
      },
      business: {
        verified: {
          type: Boolean,
          default: false
        },
        documents: [String],
        verifiedAt: Date
      }
    }
  },

  // ==================== Metadata & Search ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    referralSource: String,
    referralCode: String,
    campaignId: String,
    utmParams: {
      source: String,
      medium: String,
      campaign: String,
      term: String,
      content: String
    },
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      type: {
        type: String,
        enum: ['general', 'support', 'sales', 'technical']
      }
    }],
    flags: {
      isTestAccount: { type: Boolean, default: false },
      isPremium: { type: Boolean, default: false },
      requiresAttention: { type: Boolean, default: false },
      isPartner: { type: Boolean, default: false }
    }
  },

  searchTokens: {
    type: [String],
    select: false
  }
};

// Create schema
const organizationSchema = BaseModel.createSchema(organizationSchemaDefinition, {
  collection: 'organizations',
  timestamps: true
});

// ==================== Indexes ====================
organizationSchema.index({ name: 1, 'status.state': 1 });
organizationSchema.index({ slug: 1 });
organizationSchema.index({ 'ownership.ownerId': 1, 'status.state': 1 });
organizationSchema.index({ 'subscription.status': 1, 'subscription.tier': 1 });
organizationSchema.index({ 'subscription.trial.endDate': 1 });
organizationSchema.index({ 'billing.customerId.stripe': 1 });
organizationSchema.index({ 'tenancy.tenantId': 1 });
organizationSchema.index({ 'tenancy.subdomainPrefix': 1 });
organizationSchema.index({ 'metadata.tags': 1 });
organizationSchema.index({ searchTokens: 1 });
organizationSchema.index({ createdAt: -1 });

// Text search index
organizationSchema.index({
  name: 'text',
  displayName: 'text',
  legalName: 'text',
  description: 'text'
});

// ==================== Virtual Fields ====================
organizationSchema.virtual('isTrialing').get(function() {
  return this.subscription.status === 'free_trial' && 
         this.subscription.trial.endDate > new Date();
});

organizationSchema.virtual('isPaid').get(function() {
  return ['active', 'past_due'].includes(this.subscription.status) &&
         this.subscription.tier !== 'free_trial';
});

organizationSchema.virtual('isActive').get(function() {
  return this.status.state === 'active' && 
         ['free_trial', 'active'].includes(this.subscription.status);
});

organizationSchema.virtual('daysUntilTrialEnd').get(function() {
  if (this.subscription.status !== 'free_trial') return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((this.subscription.trial.endDate - new Date()) / msPerDay);
  return Math.max(0, daysRemaining);
});

organizationSchema.virtual('memberCount').get(function() {
  return this.features.users.current;
});

organizationSchema.virtual('canAddUsers').get(function() {
  return this.features.users.current < this.features.users.limit;
});

organizationSchema.virtual('storageUsagePercent').get(function() {
  if (!this.features.storage.limit) return 0;
  return Math.round((this.features.storage.used / this.features.storage.limit) * 100);
});

organizationSchema.virtual('publicUrl').get(function() {
  if (this.tenancy.customDomain?.verified) {
    return `https://${this.tenancy.customDomain.domain}`;
  }
  if (this.tenancy.subdomainPrefix) {
    return `https://${this.tenancy.subdomainPrefix}.${process.env.BASE_DOMAIN || 'example.com'}`;
  }
  return `https://${process.env.BASE_DOMAIN || 'example.com'}/${this.slug}`;
});

// ==================== Pre-save Middleware ====================
organizationSchema.pre('save', async function(next) {
  try {
    // Generate slug if not provided
    if (!this.slug && this.name) {
      this.slug = await this.constructor.generateUniqueSlug(this.name);
    }

    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.name;
    }

    // Set trial end date for new organizations
    if (this.isNew && this.subscription.status === 'free_trial' && !this.subscription.trial.endDate) {
      const trialDays = parseInt(process.env.TRIAL_DAYS || '14');
      this.subscription.trial.endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    }

    // Update days remaining for trial
    if (this.subscription.status === 'free_trial') {
      this.subscription.trial.daysRemaining = this.daysUntilTrialEnd;
    }

    // Generate subdomain if not provided
    if (!this.tenancy.subdomainPrefix && this.slug) {
      this.tenancy.subdomainPrefix = this.slug;
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate health score
    if (this.isModified('analytics') || this.isModified('subscription') || this.isModified('billing')) {
      this.calculateHealthScore();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
organizationSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add name tokens
  if (this.name) {
    tokens.add(this.name.toLowerCase());
    this.name.split(/\s+/).forEach(word => tokens.add(word.toLowerCase()));
  }
  
  if (this.displayName) {
    this.displayName.split(/\s+/).forEach(word => tokens.add(word.toLowerCase()));
  }
  
  if (this.legalName) {
    this.legalName.split(/\s+/).forEach(word => tokens.add(word.toLowerCase()));
  }
  
  // Add slug and subdomain
  if (this.slug) tokens.add(this.slug.toLowerCase());
  if (this.tenancy.subdomainPrefix) tokens.add(this.tenancy.subdomainPrefix.toLowerCase());
  
  // Add contact email domain
  if (this.contact.email) {
    const domain = this.contact.email.split('@')[1];
    if (domain) tokens.add(domain.toLowerCase());
  }
  
  // Add tags
  if (this.metadata.tags) {
    this.metadata.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

organizationSchema.methods.calculateHealthScore = function() {
  let score = 100;
  const factors = {
    payment: 25,
    usage: 25,
    engagement: 25,
    support: 25
  };
  
  // Payment health
  if (this.subscription.status === 'past_due') {
    factors.payment = 0;
  } else if (this.subscription.status === 'cancelled') {
    factors.payment = 5;
  }
  
  // Usage health
  const storageUsage = this.storageUsagePercent;
  if (storageUsage > 90) {
    factors.usage = 10;
  } else if (storageUsage > 75) {
    factors.usage = 15;
  }
  
  // Engagement health
  const daysSinceLastActivity = this.updatedAt ? 
    (Date.now() - this.updatedAt.getTime()) / (1000 * 60 * 60 * 24) : 999;
  
  if (daysSinceLastActivity > 30) {
    factors.engagement = 5;
  } else if (daysSinceLastActivity > 14) {
    factors.engagement = 15;
  }
  
  // Support health (based on recent tickets, if any)
  // This would need integration with support system
  
  this.status.health.factors = factors;
  this.status.health.score = Object.values(factors).reduce((sum, val) => sum + val, 0);
  this.status.health.lastCalculated = new Date();
};

organizationSchema.methods.upgradePlan = async function(newTier, planId) {
  const previousTier = this.subscription.tier;
  const previousStatus = this.subscription.status;
  
  this.subscription.tier = newTier;
  this.subscription.planId = planId;
  this.subscription.status = 'active';
  
  // Clear trial info if upgrading from trial
  if (previousStatus === 'free_trial') {
    this.subscription.trial.extended = false;
  }
  
  // Update features based on new tier
  await this.updateFeaturesForTier(newTier);
  
  // Add to subscription history
  if (!this.subscription.history) this.subscription.history = [];
  this.subscription.history.push({
    from: previousTier,
    to: newTier,
    changedAt: new Date(),
    reason: 'upgrade'
  });
  
  await this.save();
  
  logger.info('Organization plan upgraded', {
    organizationId: this._id,
    from: previousTier,
    to: newTier
  });
  
  return this;
};

organizationSchema.methods.updateFeaturesForTier = async function(tier) {
  // Define tier limits
  const tierLimits = {
    free_trial: {
      users: 5,
      projects: 3,
      storage: 1 * 1024 * 1024 * 1024, // 1GB
      apiCalls: 10000,
      customDomain: false,
      whiteLabel: false,
      advancedAnalytics: false,
      apiAccess: false,
      support: 'community'
    },
    starter: {
      users: 10,
      projects: 5,
      storage: 5 * 1024 * 1024 * 1024, // 5GB
      apiCalls: 50000,
      customDomain: false,
      whiteLabel: false,
      advancedAnalytics: false,
      apiAccess: true,
      support: 'email'
    },
    basic: {
      users: 25,
      projects: 10,
      storage: 25 * 1024 * 1024 * 1024, // 25GB
      apiCalls: 100000,
      customDomain: true,
      whiteLabel: false,
      advancedAnalytics: true,
      apiAccess: true,
      support: 'email'
    },
    professional: {
      users: 100,
      projects: 50,
      storage: 100 * 1024 * 1024 * 1024, // 100GB
      apiCalls: 500000,
      customDomain: true,
      whiteLabel: true,
      advancedAnalytics: true,
      apiAccess: true,
      support: 'priority'
    },
    enterprise: {
      users: -1, // Unlimited
      projects: -1,
      storage: -1,
      apiCalls: -1,
      customDomain: true,
      whiteLabel: true,
      advancedAnalytics: true,
      apiAccess: true,
      support: 'dedicated'
    }
  };
  
  const limits = tierLimits[tier] || tierLimits.basic;
  
  // Update features
  this.features.users.limit = limits.users;
  this.features.projects.limit = limits.projects;
  this.features.storage.limit = limits.storage;
  this.features.apiCalls.monthlyLimit = limits.apiCalls;
  this.features.customDomain.enabled = limits.customDomain;
  this.features.whiteLabel.enabled = limits.whiteLabel;
  this.features.advancedAnalytics.enabled = limits.advancedAnalytics;
  this.features.apiAccess.enabled = limits.apiAccess;
  this.features.support.level = limits.support;
  
  return this;
};

organizationSchema.methods.cancelSubscription = async function(reason, feedback, userId) {
  this.subscription.status = 'cancelled';
  this.subscription.cancellation = {
    requestedAt: new Date(),
    effectiveDate: this.subscription.currentPeriod?.endDate || new Date(),
    reason,
    feedback,
    byUserId: userId
  };
  
  await this.save();
  
  logger.info('Organization subscription cancelled', {
    organizationId: this._id,
    reason
  });
  
  return this;
};

organizationSchema.methods.extendTrial = async function(days, reason, authorizedBy) {
  if (this.subscription.status !== 'free_trial') {
    throw new AppError('Organization is not in trial period', 400, 'NOT_IN_TRIAL');
  }
  
  const currentEndDate = this.subscription.trial.endDate;
  const newEndDate = new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  this.subscription.trial.endDate = newEndDate;
  this.subscription.trial.extended = true;
  
  if (!this.subscription.trial.extensionHistory) {
    this.subscription.trial.extensionHistory = [];
  }
  
  this.subscription.trial.extensionHistory.push({
    extendedBy: days,
    extendedAt: new Date(),
    reason,
    authorizedBy
  });
  
  await this.save();
  
  logger.info('Organization trial extended', {
    organizationId: this._id,
    days,
    newEndDate
  });
  
  return this;
};

organizationSchema.methods.addMember = async function(userId, role = 'member') {
  // Update user count
  this.features.users.current += 1;
  
  // Check if within limits
  if (this.features.users.limit !== -1 && this.features.users.current > this.features.users.limit) {
    this.features.users.current -= 1;
    throw new AppError('User limit exceeded for organization', 403, 'USER_LIMIT_EXCEEDED');
  }
  
  await this.save();
  return this;
};

organizationSchema.methods.removeMember = async function(userId) {
  // Update user count
  this.features.users.current = Math.max(0, this.features.users.current - 1);
  await this.save();
  return this;
};

organizationSchema.methods.generateApiKey = async function(name, scopes = []) {
  const apiKey = `org_${stringHelper.generateRandomString(32)}`;
  const hashedKey = await require('../../../security/encryption/hash-service').hashToken(apiKey);
  
  const keyData = {
    keyId: stringHelper.generateRandomString(16),
    name,
    key: hashedKey,
    scopes,
    active: true,
    createdAt: new Date()
  };
  
  if (!this.integrations.apiKeys) this.integrations.apiKeys = [];
  this.integrations.apiKeys.push(keyData);
  
  await this.save();
  
  return { ...keyData, key: apiKey };
};

organizationSchema.methods.verifyCustomDomain = async function(verificationToken) {
  if (!this.tenancy.customDomain) {
    throw new AppError('No custom domain configured', 404, 'NO_CUSTOM_DOMAIN');
  }
  
  if (this.tenancy.customDomain.verificationToken !== verificationToken) {
    throw new AppError('Invalid verification token', 400, 'INVALID_VERIFICATION_TOKEN');
  }
  
  this.tenancy.customDomain.verified = true;
  await this.save();
  
  logger.info('Custom domain verified', {
    organizationId: this._id,
    domain: this.tenancy.customDomain.domain
  });
  
  return this;
};

organizationSchema.methods.suspend = async function(reason, suspendedBy) {
  this.status.state = 'suspended';
  this.status.suspension = {
    reason,
    suspendedAt: new Date(),
    suspendedBy,
    willDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  };
  
  await this.save();
  
  logger.warn('Organization suspended', {
    organizationId: this._id,
    reason
  });
  
  return this;
};

organizationSchema.methods.reactivate = async function() {
  if (this.status.state !== 'suspended') {
    throw new AppError('Organization is not suspended', 400, 'NOT_SUSPENDED');
  }
  
  this.status.state = 'active';
  this.status.suspension = undefined;
  
  await this.save();
  
  logger.info('Organization reactivated', {
    organizationId: this._id
  });
  
  return this;
};

organizationSchema.methods.transferOwnership = async function(newOwnerId, reason) {
  const previousOwnerId = this.ownership.ownerId;
  
  this.ownership.ownerId = newOwnerId;
  
  if (!this.ownership.transferHistory) {
    this.ownership.transferHistory = [];
  }
  
  this.ownership.transferHistory.push({
    fromUserId: previousOwnerId,
    toUserId: newOwnerId,
    transferredAt: new Date(),
    reason
  });
  
  await this.save();
  
  logger.info('Organization ownership transferred', {
    organizationId: this._id,
    from: previousOwnerId,
    to: newOwnerId
  });
  
  return this;
};

// ==================== Static Methods ====================
organizationSchema.statics.createTrialOrganization = async function(data) {
  const organization = new this({
    ...data,
    subscription: {
      status: 'free_trial',
      tier: 'free_trial',
      trial: {
        startDate: new Date()
      }
    },
    status: {
      state: 'active'
    }
  });
  
  await organization.save();
  
  logger.info('Trial organization created', {
    organizationId: organization._id,
    name: organization.name
  });
  
  return organization;
};

organizationSchema.statics.findBySlug = async function(slug) {
  return await this.findOne({
    slug: slug.toLowerCase(),
    'status.state': { $ne: 'deleted' }
  });
};

organizationSchema.statics.findBySubdomain = async function(subdomain) {
  return await this.findOne({
    'tenancy.subdomainPrefix': subdomain.toLowerCase(),
    'status.state': { $ne: 'deleted' }
  });
};

organizationSchema.statics.findByCustomDomain = async function(domain) {
  return await this.findOne({
    'tenancy.customDomain.domain': domain.toLowerCase(),
    'tenancy.customDomain.verified': true,
    'status.state': { $ne: 'deleted' }
  });
};

organizationSchema.statics.findByOwner = async function(ownerId, options = {}) {
  const query = {
    'ownership.ownerId': ownerId,
    'status.state': { $ne: 'deleted' }
  };
  
  if (options.activeOnly) {
    query['status.state'] = 'active';
  }
  
  return await this.find(query).sort({ createdAt: -1 });
};

organizationSchema.statics.findByApiKey = async function(apiKey) {
  const hashedKey = await require('../../../security/encryption/hash-service').hashToken(apiKey);
  
  const organization = await this.findOne({
    'integrations.apiKeys': {
      $elemMatch: {
        key: hashedKey,
        active: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      }
    },
    'status.state': 'active'
  }).select('+integrations.apiKeys.key');
  
  if (!organization) {
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }
  
  return organization;
};

organizationSchema.statics.generateUniqueSlug = async function(baseName) {
  let slug = slugHelper.createSlug(baseName);
  let counter = 0;
  let uniqueSlug = slug;
  
  while (await this.exists({ slug: uniqueSlug })) {
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
  
  return uniqueSlug;
};

organizationSchema.statics.searchOrganizations = async function(query, options = {}) {
  const {
    status,
    tier,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const searchQuery = {
    $and: [
      { 'status.state': { $ne: 'deleted' } },
      {
        $or: [
          { name: new RegExp(query, 'i') },
          { displayName: new RegExp(query, 'i') },
          { legalName: new RegExp(query, 'i') },
          { slug: new RegExp(query, 'i') },
          { 'contact.email': new RegExp(query, 'i') },
          { searchTokens: new RegExp(query, 'i') }
        ]
      }
    ]
  };
  
  if (status) {
    searchQuery.$and.push({ 'status.state': status });
  }
  
  if (tier) {
    searchQuery.$and.push({ 'subscription.tier': tier });
  }
  
  const [organizations, total] = await Promise.all([
    this.find(searchQuery)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(searchQuery)
  ]);
  
  return {
    organizations,
    total,
    hasMore: total > skip + organizations.length
  };
};

organizationSchema.statics.getExpiringTrials = async function(daysAhead = 3) {
  const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  return await this.find({
    'subscription.status': 'free_trial',
    'subscription.trial.endDate': {
      $gte: new Date(),
      $lte: targetDate
    },
    'status.state': 'active'
  });
};

organizationSchema.statics.getOrganizationStatistics = async function(filters = {}) {
  const match = { 'status.state': { $ne: 'deleted' } };
  
  if (filters.dateRange) {
    match.createdAt = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
    };
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
              },
              trial: {
                $sum: { $cond: [{ $eq: ['$subscription.status', 'free_trial'] }, 1, 0] }
              },
              paid: {
                $sum: { 
                  $cond: [
                    { $in: ['$subscription.status', ['active', 'past_due']] },
                    1,
                    0
                  ]
                }
              },
              suspended: {
                $sum: { $cond: [{ $eq: ['$status.state', 'suspended'] }, 1, 0] }
              }
            }
          }
        ],
        byTier: [
          {
            $group: {
              _id: '$subscription.tier',
              count: { $sum: 1 },
              mrr: { $sum: '$analytics.metrics.mrr' }
            }
          }
        ],
        byIndustry: [
          {
            $group: {
              _id: '$industry',
              count: { $sum: 1 }
            }
          }
        ],
        bySize: [
          {
            $group: {
              _id: '$size',
              count: { $sum: 1 }
            }
          }
        ],
        revenue: [
          {
            $group: {
              _id: null,
              totalMrr: { $sum: '$analytics.metrics.mrr' },
              avgMrr: { $avg: '$analytics.metrics.mrr' },
              totalRevenue: { $sum: '$analytics.metrics.totalRevenue' }
            }
          }
        ],
        growth: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 },
              mrr: { $sum: '$analytics.metrics.mrr' }
            }
          },
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ]
      }
    }
  ]);
  
  const result = stats[0];
  
  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      trial: 0,
      paid: 0,
      suspended: 0
    },
    distribution: {
      byTier: result.byTier,
      byIndustry: result.byIndustry,
      bySize: result.bySize
    },
    revenue: result.revenue[0] || {
      totalMrr: 0,
      avgMrr: 0,
      totalRevenue: 0
    },
    growth: result.growth.reverse()
  };
};

// Create and export model
const OrganizationModel = BaseModel.createModel('Organization', organizationSchema);

module.exports = OrganizationModel;