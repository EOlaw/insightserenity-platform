/**
 * @fileoverview Organization Model for Customer Services - Multi-Tenant Organizations
 * @module shared/lib/database/models/customer-services/hosted-organizations/organization-management/organization-model
 * @description Complete Organization model for managing multi-tenant organizations/companies
 * @requires mongoose
 */

const mongoose = require('mongoose');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');

const { Schema } = mongoose;

/**
 * Organization Schema Definition
 * Represents a multi-tenant organization (company) that uses your platform
 */
const organizationSchemaDefinition = {
  // ==================== Core Identity ====================
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },

  legalName: {
    type: String,
    trim: true,
    maxlength: 200
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9-]+$/,
    index: true
  },

  description: {
    type: String,
    maxlength: 2000
  },

  // ==================== Status & Lifecycle ====================
  status: {
    type: String,
    enum: ['active', 'trial', 'suspended', 'expired', 'cancelled', 'pending'],
    default: 'trial',
    index: true
  },

  statusHistory: [{
    status: String,
    reason: String,
    changedAt: Date,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],

  activatedAt: Date,
  suspendedAt: Date,
  suspendedUntil: Date,
  cancelledAt: Date,
  deletedAt: Date,

  // ==================== Contact Information ====================
  contact: {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: CommonValidator.isEmail,
        message: 'Invalid email address'
      }
    },
    phone: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return CommonValidator.isPhoneNumber(value);
        },
        message: 'Invalid phone number'
      }
    },
    supportEmail: String,
    billingEmail: String,
    website: String,
    socialMedia: {
      linkedin: String,
      twitter: String,
      facebook: String,
      instagram: String
    }
  },

  // ==================== Address ====================
  address: {
    street: String,
    street2: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      default: 'US'
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  billingAddress: {
    street: String,
    street2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },

  // ==================== Business Information ====================
  business: {
    type: {
      type: String,
      enum: ['individual', 'small_business', 'enterprise', 'non_profit', 'government', 'other']
    },
    industry: String,
    size: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+']
    },
    numberOfEmployees: Number,
    annualRevenue: Number,
    taxId: {
      type: String,
      select: false
    },
    registrationNumber: String,
    foundedYear: Number
  },

  // ==================== Subscription & Billing ====================
  subscription: {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan'
    },
    planName: String,
    tier: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'past_due', 'cancelled', 'unpaid', 'incomplete'],
      default: 'trialing'
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    trialStartedAt: Date,
    trialEndsAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    cancelFeedback: String,
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually', 'custom']
    },
    price: {
      amount: Number,
      currency: {
        type: String,
        default: 'USD'
      }
    },
    discount: {
      code: String,
      percentage: Number,
      amount: Number,
      validUntil: Date
    },
    autoRenew: {
      type: Boolean,
      default: true
    }
  },

  billing: {
    customerId: {
      stripe: String,
      other: mongoose.Schema.Types.Mixed
    },
    paymentMethods: [{
      methodId: String,
      type: {
        type: String,
        enum: ['card', 'bank_account', 'invoice', 'other']
      },
      last4: String,
      brand: String,
      isDefault: Boolean,
      expiryMonth: Number,
      expiryYear: Number,
      addedAt: Date
    }],
    invoices: [{
      invoiceId: String,
      number: String,
      amount: Number,
      currency: String,
      status: {
        type: String,
        enum: ['draft', 'open', 'paid', 'void', 'uncollectible']
      },
      dueDate: Date,
      paidAt: Date,
      createdAt: Date
    }],
    credits: {
      balance: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: 'USD'
      }
    }
  },

  // ==================== Limits & Quotas ====================
  limits: {
    maxUsers: {
      type: Number,
      default: 10
    },
    maxCustomers: {
      type: Number,
      default: 100
    },
    maxProjects: {
      type: Number,
      default: 5
    },
    maxStorage: {
      type: Number,
      default: 1073741824 // 1GB in bytes
    },
    maxBandwidth: {
      type: Number,
      default: 10737418240 // 10GB in bytes
    },
    maxApiCalls: {
      type: Number,
      default: 10000
    },
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 60
      },
      requestsPerHour: {
        type: Number,
        default: 1000
      }
    }
  },

  usage: {
    users: {
      current: {
        type: Number,
        default: 0
      },
      peak: Number,
      lastUpdated: Date
    },
    customers: {
      current: {
        type: Number,
        default: 0
      },
      peak: Number,
      lastUpdated: Date
    },
    projects: {
      current: {
        type: Number,
        default: 0
      },
      peak: Number,
      lastUpdated: Date
    },
    storage: {
      used: {
        type: Number,
        default: 0
      },
      lastUpdated: Date
    },
    bandwidth: {
      used: {
        type: Number,
        default: 0
      },
      period: String,
      lastReset: Date
    },
    apiCalls: {
      count: {
        type: Number,
        default: 0
      },
      period: String,
      lastReset: Date
    }
  },

  // ==================== Features & Permissions ====================
  features: {
    enabledFeatures: [{
      type: String
    }],
    customFeatures: [{
      name: String,
      enabled: Boolean,
      config: mongoose.Schema.Types.Mixed
    }],
    integrations: [{
      name: String,
      provider: String,
      enabled: Boolean,
      config: mongoose.Schema.Types.Mixed,
      credentials: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      },
      connectedAt: Date,
      lastSyncAt: Date
    }],
    apiAccess: {
      enabled: {
        type: Boolean,
        default: false
      },
      webhooksEnabled: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Settings & Configuration ====================
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    language: {
      type: String,
      default: 'en'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
    },
    workingHours: {
      start: String,
      end: String,
      timezone: String
    },
    businessDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    notifications: {
      email: {
        enabled: { type: Boolean, default: true },
        categories: {
          billing: { type: Boolean, default: true },
          security: { type: Boolean, default: true },
          updates: { type: Boolean, default: true },
          usage: { type: Boolean, default: true }
        }
      },
      slack: {
        enabled: { type: Boolean, default: false },
        webhookUrl: {
          type: String,
          select: false
        }
      }
    }
  },

  // ==================== Branding & Customization ====================
  branding: {
    logo: {
      url: String,
      publicId: String
    },
    favicon: {
      url: String,
      publicId: String
    },
    primaryColor: String,
    secondaryColor: String,
    accentColor: String,
    customDomain: {
      type: String,
      unique: true,
      sparse: true
    },
    customDomainVerified: {
      type: Boolean,
      default: false
    },
    customCSS: String,
    emailTemplates: {
      header: String,
      footer: String,
      customStyles: String
    }
  },

  // ==================== Security Settings ====================
  security: {
    requireMFA: {
      type: Boolean,
      default: false
    },
    allowedDomains: [String],
    ipWhitelist: [String],
    ipBlacklist: [String],
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireLowercase: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSpecialChars: {
        type: Boolean,
        default: true
      },
      preventReuse: {
        type: Number,
        default: 5
      },
      expiryDays: {
        type: Number,
        default: 90
      }
    },
    sessionTimeout: {
      type: Number,
      default: 3600 // seconds
    },
    allowedAuthProviders: [{
      type: String,
      enum: ['local', 'google', 'github', 'linkedin', 'microsoft', 'saml', 'oidc']
    }],
    ssoConfig: {
      enabled: Boolean,
      provider: String,
      entityId: String,
      singleSignOnUrl: String,
      certificate: {
        type: String,
        select: false
      },
      attributes: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Members & Hierarchy ====================
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  admins: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: Date,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  departments: [{
    name: String,
    description: String,
    headId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    parentDepartmentId: mongoose.Schema.Types.ObjectId,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  teams: [{
    name: String,
    description: String,
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    departmentId: mongoose.Schema.Types.ObjectId,
    memberCount: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ==================== Compliance & Legal ====================
  compliance: {
    gdpr: {
      dataProcessingAgreement: {
        accepted: Boolean,
        acceptedAt: Date,
        acceptedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      },
      dataRetentionDays: {
        type: Number,
        default: 2555 // ~7 years
      }
    },
    terms: {
      accepted: Boolean,
      acceptedAt: Date,
      version: String,
      acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    certifications: [{
      type: String,
      issuer: String,
      validUntil: Date,
      documentUrl: String
    }]
  },

  // ==================== Activity & Analytics ====================
  activity: {
    lastActivityAt: Date,
    totalLogins: {
      type: Number,
      default: 0
    },
    activeUsers: {
      daily: Number,
      weekly: Number,
      monthly: Number
    },
    statistics: {
      totalProjects: Number,
      totalCustomers: Number,
      totalRevenue: Number,
      lastCalculatedAt: Date
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['self_signup', 'invitation', 'migration', 'admin_created', 'api'],
      default: 'self_signup'
    },
    referrer: String,
    campaign: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    tags: [String],
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      isPrivate: Boolean
    }],
    flags: {
      isVip: { type: Boolean, default: false },
      isHighValue: { type: Boolean, default: false },
      requiresAttention: { type: Boolean, default: false },
      atRisk: { type: Boolean, default: false }
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  }
};

const organizationSchema = new Schema(organizationSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== Indexes ====================
organizationSchema.index({ slug: 1 });
organizationSchema.index({ status: 1, createdAt: -1 });
organizationSchema.index({ 'subscription.status': 1 });
organizationSchema.index({ 'subscription.currentPeriodEnd': 1 });
organizationSchema.index({ owner: 1 });
organizationSchema.index({ searchTokens: 1 });
organizationSchema.index({ 'metadata.tags': 1 });
organizationSchema.index({ 'branding.customDomain': 1 }, { sparse: true });

// Text search index
organizationSchema.index({
  name: 'text',
  legalName: 'text',
  description: 'text',
  'contact.email': 'text'
});

// ==================== Virtual Fields ====================
organizationSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

organizationSchema.virtual('isTrial').get(function() {
  return this.status === 'trial';
});

organizationSchema.virtual('isTrialExpired').get(function() {
  return this.status === 'trial' && 
         this.subscription.trialEndsAt && 
         new Date() > this.subscription.trialEndsAt;
});

organizationSchema.virtual('memberCount').get(function() {
  return this.usage.users.current || 0;
});

organizationSchema.virtual('daysRemaining').get(function() {
  if (!this.subscription.currentPeriodEnd) return null;
  const diff = this.subscription.currentPeriodEnd - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

organizationSchema.virtual('storagePercentage').get(function() {
  if (!this.limits.maxStorage) return 0;
  return Math.round((this.usage.storage.used / this.limits.maxStorage) * 100);
});

organizationSchema.virtual('usersPercentage').get(function() {
  if (!this.limits.maxUsers) return 0;
  return Math.round((this.usage.users.current / this.limits.maxUsers) * 100);
});

// ==================== Pre-save Middleware ====================
organizationSchema.pre('save', async function(next) {
  try {
    // Generate unique slug if not provided
    if (this.isNew && !this.slug) {
      this.slug = await this.constructor.generateUniqueSlug(this.name);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Initialize trial if new organization
    if (this.isNew && this.status === 'trial' && !this.subscription.trialEndsAt) {
      const trialDays = process.env.TRIAL_DAYS || 14;
      this.subscription.trialStartedAt = new Date();
      this.subscription.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    }

    // Track status changes
    if (this.isModified('status')) {
      if (!this.statusHistory) this.statusHistory = [];
      this.statusHistory.unshift({
        status: this.status,
        changedAt: new Date(),
        reason: 'Status updated'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
organizationSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  if (this.name) tokens.add(this.name.toLowerCase());
  if (this.legalName) tokens.add(this.legalName.toLowerCase());
  if (this.slug) tokens.add(this.slug.toLowerCase());
  if (this.contact.email) tokens.add(this.contact.email.toLowerCase());
  
  const nameParts = this.name.split(/\s+/);
  nameParts.forEach(part => tokens.add(part.toLowerCase()));
  
  this.searchTokens = Array.from(tokens);
};

organizationSchema.methods.canAcceptNewCustomers = function() {
  if (this.status !== 'active' && this.status !== 'trial') {
    return {
      allowed: false,
      reason: `Organization is ${this.status}`,
      code: 'ORG_NOT_ACTIVE'
    };
  }

  if (this.isTrialExpired) {
    return {
      allowed: false,
      reason: 'Trial period has expired',
      code: 'TRIAL_EXPIRED'
    };
  }

  if (this.limits.maxCustomers && this.usage.customers.current >= this.limits.maxCustomers) {
    return {
      allowed: false,
      reason: 'Customer limit reached',
      code: 'CUSTOMER_LIMIT_REACHED'
    };
  }

  return { allowed: true };
};

organizationSchema.methods.canAcceptNewUsers = function() {
  if (this.status !== 'active' && this.status !== 'trial') {
    return {
      allowed: false,
      reason: `Organization is ${this.status}`,
      code: 'ORG_NOT_ACTIVE'
    };
  }

  if (this.limits.maxUsers && this.usage.users.current >= this.limits.maxUsers) {
    return {
      allowed: false,
      reason: 'User limit reached',
      code: 'USER_LIMIT_REACHED'
    };
  }

  return { allowed: true };
};

organizationSchema.methods.incrementUsage = async function(metric, amount = 1) {
  const usagePath = `usage.${metric}.current`;
  const lastUpdatedPath = `usage.${metric}.lastUpdated`;
  
  this.set(usagePath, this.get(usagePath) + amount);
  this.set(lastUpdatedPath, new Date());
  
  // Update peak if current exceeds it
  const peakPath = `usage.${metric}.peak`;
  const currentValue = this.get(usagePath);
  const peakValue = this.get(peakPath);
  
  if (!peakValue || currentValue > peakValue) {
    this.set(peakPath, currentValue);
  }
  
  await this.save();
};

organizationSchema.methods.decrementUsage = async function(metric, amount = 1) {
  const usagePath = `usage.${metric}.current`;
  const lastUpdatedPath = `usage.${metric}.lastUpdated`;
  
  const currentValue = this.get(usagePath);
  this.set(usagePath, Math.max(0, currentValue - amount));
  this.set(lastUpdatedPath, new Date());
  
  await this.save();
};

organizationSchema.methods.updateStatus = async function(newStatus, reason, changedBy) {
  this.status = newStatus;
  
  if (!this.statusHistory) this.statusHistory = [];
  this.statusHistory.unshift({
    status: newStatus,
    reason: reason,
    changedAt: new Date(),
    changedBy: changedBy
  });
  
  // Update specific date fields
  switch (newStatus) {
    case 'active':
      this.activatedAt = new Date();
      break;
    case 'suspended':
      this.suspendedAt = new Date();
      break;
    case 'cancelled':
      this.cancelledAt = new Date();
      break;
  }
  
  await this.save();
  
  logger.info('Organization status updated', {
    organizationId: this._id,
    status: newStatus,
    reason: reason
  });
};

organizationSchema.methods.updateSubscription = async function(subscriptionData) {
  Object.assign(this.subscription, subscriptionData);
  await this.save();
  
  logger.info('Organization subscription updated', {
    organizationId: this._id,
    planName: this.subscription.planName
  });
};

organizationSchema.methods.addMember = async function(userId, roles = ['member']) {
  // This is tracked in the User model's organizations array
  await this.incrementUsage('users');
  
  logger.info('Member added to organization', {
    organizationId: this._id,
    userId: userId
  });
};

organizationSchema.methods.removeMember = async function(userId) {
  await this.decrementUsage('users');
  
  logger.info('Member removed from organization', {
    organizationId: this._id,
    userId: userId
  });
};

organizationSchema.methods.addAdmin = async function(userId, addedBy) {
  if (!this.admins) this.admins = [];
  
  const exists = this.admins.some(admin => admin.userId.toString() === userId.toString());
  if (exists) {
    throw new AppError('User is already an admin', 409, 'ALREADY_ADMIN');
  }
  
  this.admins.push({
    userId: userId,
    addedAt: new Date(),
    addedBy: addedBy
  });
  
  await this.save();
};

organizationSchema.methods.removeAdmin = async function(userId) {
  if (!this.admins) return;
  
  this.admins = this.admins.filter(admin => admin.userId.toString() !== userId.toString());
  await this.save();
};

organizationSchema.methods.isAdmin = function(userId) {
  if (this.owner.toString() === userId.toString()) return true;
  if (!this.admins) return false;
  return this.admins.some(admin => admin.userId.toString() === userId.toString());
};

// ==================== Static Methods ====================
organizationSchema.statics.findBySlug = async function(slug) {
  return await this.findOne({ slug: slug.toLowerCase() });
};

organizationSchema.statics.findByCustomDomain = async function(domain) {
  return await this.findOne({ 
    'branding.customDomain': domain.toLowerCase(),
    'branding.customDomainVerified': true
  });
};

organizationSchema.statics.generateUniqueSlug = async function(name) {
  let slug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  
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
  
  const searchQuery = {};
  
  if (query) {
    searchQuery.$or = [
      { name: new RegExp(query, 'i') },
      { legalName: new RegExp(query, 'i') },
      { slug: new RegExp(query, 'i') },
      { 'contact.email': new RegExp(query, 'i') },
      { searchTokens: new RegExp(query, 'i') }
    ];
  }
  
  if (status) {
    searchQuery.status = status;
  }
  
  if (tier) {
    searchQuery['subscription.tier'] = tier;
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

organizationSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
              },
              trial: {
                $sum: { $cond: [{ $eq: ['$status', 'trial'] }, 1, 0] }
              },
              suspended: {
                $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
              }
            }
          }
        ],
        byTier: [
          {
            $group: {
              _id: '$subscription.tier',
              count: { $sum: 1 }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ]
      }
    }
  ]);
  
  return {
    overview: stats[0].overview[0] || { total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0 },
    byTier: stats[0].byTier,
    byMonth: stats[0].byMonth.reverse()
  };
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: organizationSchema,
  modelName: 'Organization',
  
  createModel: function(connection) {
    if (connection) {
      return connection.model('Organization', organizationSchema);
    } else {
      return mongoose.model('Organization', organizationSchema);
    }
  }
};

// For backward compatibility
module.exports.Organization = mongoose.model('Organization', organizationSchema);
module.exports.organizationSchema = organizationSchema;