'use strict';

/**
 * @fileoverview Organization model for multi-tenant support
 * @module shared/lib/database/models/organization-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/slug-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const validators = require('../../utils/validators/common-validators');
const slugHelper = require('../../utils/helpers/slug-helper');

/**
 * Organization schema definition
 */
const organizationSchemaDefinition = {
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },

  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },

  displayName: {
    type: String,
    trim: true,
    maxlength: 100
  },

  description: {
    type: String,
    maxlength: 1000
  },

  // Organization Type
  type: {
    type: String,
    enum: ['company', 'non-profit', 'government', 'educational', 'personal', 'other'],
    default: 'company',
    index: true
  },

  industry: {
    type: String,
    enum: [
      'technology', 'healthcare', 'finance', 'retail', 'manufacturing',
      'education', 'government', 'non-profit', 'consulting', 'media',
      'real-estate', 'hospitality', 'transportation', 'energy', 'other'
    ]
  },

  size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
    default: '1-10'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending', 'deleted'],
    default: 'pending',
    index: true
  },

  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified'
  },

  verifiedAt: Date,
  verificationNotes: String,

  // Contact Information
  contact: {
    email: {
      type: String,
      required: true,
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
    supportPhone: String
  },

  // Address
  address: {
    street1: String,
    street2: String,
    city: String,
    state: String,
    country: {
      type: String,
      uppercase: true,
      maxlength: 2 // ISO 3166-1 alpha-2
    },
    postalCode: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: undefined
      }
    }
  },

  // Branding
  branding: {
    logo: {
      url: String,
      publicId: String
    },
    favicon: {
      url: String,
      publicId: String
    },
    primaryColor: {
      type: String,
      match: /^#[0-9A-F]{6}$/i
    },
    secondaryColor: {
      type: String,
      match: /^#[0-9A-F]{6}$/i
    },
    font: String,
    customCss: String
  },

  // Ownership & Management
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  administrators: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'billing', 'technical'],
      default: 'admin'
    },
    permissions: [String],
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Members
  memberCount: {
    type: Number,
    default: 1,
    min: 1
  },

  memberLimit: {
    type: Number,
    default: 5
  },

  invitedMembers: [{
    email: String,
    role: String,
    invitedAt: Date,
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    token: String,
    expiresAt: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending'
    }
  }],

  // Subscription & Billing
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
      default: 'free',
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'cancelled', 'trialing', 'paused'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date,
    renewalDate: Date,
    trialEndsAt: Date,
    customerId: String,
    subscriptionId: String,
    paymentMethod: {
      type: {
        type: String,
        enum: ['card', 'bank', 'invoice', 'other']
      },
      last4: String,
      brand: String
    },
    billingEmail: String,
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    }
  },

  // Features & Limits
  features: {
    maxUsers: {
      type: Number,
      default: 5
    },
    maxProjects: {
      type: Number,
      default: 10
    },
    maxStorage: {
      type: Number,
      default: 1073741824 // 1GB in bytes
    },
    maxApiCalls: {
      type: Number,
      default: 10000
    },
    customDomain: {
      type: Boolean,
      default: false
    },
    whiteLabel: {
      type: Boolean,
      default: false
    },
    advancedAnalytics: {
      type: Boolean,
      default: false
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    sla: {
      type: Boolean,
      default: false
    },
    sso: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    }
  },

  // Usage Tracking
  usage: {
    currentUsers: {
      type: Number,
      default: 1
    },
    currentProjects: {
      type: Number,
      default: 0
    },
    currentStorage: {
      type: Number,
      default: 0
    },
    currentApiCalls: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },

  // Settings
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
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
    language: {
      type: String,
      default: 'en'
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      maxlength: 3
    },
    fiscalYearStart: {
      type: Number,
      min: 1,
      max: 12,
      default: 1
    },
    weekStart: {
      type: Number,
      min: 0,
      max: 6,
      default: 0 // Sunday
    },
    allowPublicSignup: {
      type: Boolean,
      default: false
    },
    requireEmailVerification: {
      type: Boolean,
      default: true
    },
    enforce2FA: {
      type: Boolean,
      default: false
    },
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
        default: false
      },
      expirationDays: {
        type: Number,
        default: 0 // 0 means no expiration
      }
    },
    sessionTimeout: {
      type: Number,
      default: 30 // minutes
    },
    ipWhitelist: [String],
    allowedDomains: [String]
  },

  // Integrations
  integrations: [{
    service: {
      type: String,
      enum: ['slack', 'teams', 'google', 'azure', 'aws', 'github', 'jira', 'salesforce']
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'error'],
      default: 'active'
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    connectedAt: Date,
    connectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastSyncAt: Date,
    syncErrors: Number
  }],

  // Departments
  departments: [{
    name: {
      type: String,
      required: true
    },
    code: String,
    description: String,
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    memberCount: {
      type: Number,
      default: 0
    },
    active: {
      type: Boolean,
      default: true
    }
  }],

  // Custom Fields
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Legal & Compliance
  legal: {
    taxId: String,
    vatId: String,
    registrationNumber: String,
    incorporationDate: Date,
    incorporationCountry: String,
    incorporationState: String
  },

  compliance: {
    gdprCompliant: {
      type: Boolean,
      default: false
    },
    hipaaCompliant: {
      type: Boolean,
      default: false
    },
    soc2Compliant: {
      type: Boolean,
      default: false
    },
    iso27001Compliant: {
      type: Boolean,
      default: false
    },
    dataProcessingAgreement: {
      signed: Boolean,
      signedAt: Date,
      signedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      version: String
    }
  },

  // Audit
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Search
  searchableText: {
    type: String,
    select: false,
    searchable: true
  }
};

// Create schema
const organizationSchema = BaseModel.createSchema(organizationSchemaDefinition, {
  collection: 'organizations',
  timestamps: true
});

// Indexes
organizationSchema.index({ ownerId: 1, status: 1 });
organizationSchema.index({ 'subscription.plan': 1, 'subscription.status': 1 });
organizationSchema.index({ type: 1, industry: 1 });
organizationSchema.index({ verificationStatus: 1 });
organizationSchema.index({ 'administrators.userId': 1 });

// Virtual fields
organizationSchema.virtual('isActive').get(function() {
  return this.status === 'active' && 
         this.subscription.status === 'active';
});

organizationSchema.virtual('isVerified').get(function() {
  return this.verificationStatus === 'verified';
});

organizationSchema.virtual('hasActiveSubscription').get(function() {
  return ['active', 'trialing'].includes(this.subscription.status);
});

organizationSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.subscription.renewalDate) return null;
  const days = Math.ceil((this.subscription.renewalDate - Date.now()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

organizationSchema.virtual('storageUsagePercent').get(function() {
  if (!this.features.maxStorage) return 0;
  return (this.usage.currentStorage / this.features.maxStorage) * 100;
});

organizationSchema.virtual('userUsagePercent').get(function() {
  if (!this.features.maxUsers) return 0;
  return (this.usage.currentUsers / this.features.maxUsers) * 100;
});

// Pre-save middleware
organizationSchema.pre('save', async function(next) {
  try {
    // Generate slug from name if not provided
    if (!this.slug && this.name) {
      this.slug = await this.constructor.generateUniqueSlug(this.name);
    }

    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.name;
    }

    // Update searchable text
    this.searchableText = [
      this.name,
      this.displayName,
      this.description,
      this.industry,
      this.contact.email
    ].filter(Boolean).join(' ').toLowerCase();

    // Initialize member count
    if (this.isNew) {
      this.memberCount = 1;
      this.usage.currentUsers = 1;
    }

    // Update last activity
    this.lastActivityAt = new Date();

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
organizationSchema.methods.addAdministrator = async function(userId, role = 'admin', addedBy) {
  // Check if already an admin
  const existingAdmin = this.administrators.find(
    admin => admin.userId.toString() === userId.toString()
  );

  if (existingAdmin) {
    existingAdmin.role = role;
  } else {
    this.administrators.push({
      userId,
      role,
      addedAt: new Date(),
      addedBy
    });
  }

  await this.save();
  return this;
};

organizationSchema.methods.removeAdministrator = async function(userId) {
  this.administrators = this.administrators.filter(
    admin => admin.userId.toString() !== userId.toString()
  );
  await this.save();
  return this;
};

organizationSchema.methods.isAdministrator = function(userId) {
  return this.ownerId.toString() === userId.toString() ||
         this.administrators.some(admin => admin.userId.toString() === userId.toString());
};

organizationSchema.methods.getAdministratorRole = function(userId) {
  if (this.ownerId.toString() === userId.toString()) {
    return 'owner';
  }

  const admin = this.administrators.find(
    admin => admin.userId.toString() === userId.toString()
  );

  return admin ? admin.role : null;
};

organizationSchema.methods.inviteMember = async function(email, role, invitedBy) {
  const token = require('../../utils/helpers/string-helper').generateRandomString(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Remove any existing pending invitations for this email
  this.invitedMembers = this.invitedMembers.filter(
    invite => invite.email !== email || invite.status !== 'pending'
  );

  this.invitedMembers.push({
    email,
    role,
    invitedAt: new Date(),
    invitedBy,
    token,
    expiresAt,
    status: 'pending'
  });

  await this.save();
  return token;
};

organizationSchema.methods.acceptInvitation = async function(token) {
  const invitation = this.invitedMembers.find(
    invite => invite.token === token && invite.status === 'pending'
  );

  if (!invitation) {
    throw new AppError('Invalid invitation token', 400, 'INVALID_INVITATION');
  }

  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await this.save();
    throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
  }

  invitation.status = 'accepted';
  this.memberCount += 1;
  this.usage.currentUsers += 1;

  await this.save();
  return invitation;
};

organizationSchema.methods.updateSubscription = async function(planData) {
  Object.assign(this.subscription, planData);
  
  // Update features based on plan
  const planFeatures = this.constructor.getPlanFeatures(planData.plan);
  Object.assign(this.features, planFeatures);

  await this.save();
  return this;
};

organizationSchema.methods.incrementUsage = async function(metric, amount = 1) {
  const usageField = `usage.current${metric.charAt(0).toUpperCase() + metric.slice(1)}`;
  const maxField = `features.max${metric.charAt(0).toUpperCase() + metric.slice(1)}`;

  const currentUsage = this.get(usageField) || 0;
  const maxUsage = this.get(maxField);

  if (maxUsage && currentUsage + amount > maxUsage) {
    throw new AppError(`${metric} limit exceeded`, 400, 'LIMIT_EXCEEDED');
  }

  this.set(usageField, currentUsage + amount);
  await this.save();
  return this;
};

organizationSchema.methods.decrementUsage = async function(metric, amount = 1) {
  const usageField = `usage.current${metric.charAt(0).toUpperCase() + metric.slice(1)}`;
  const currentUsage = this.get(usageField) || 0;

  this.set(usageField, Math.max(0, currentUsage - amount));
  await this.save();
  return this;
};

organizationSchema.methods.resetUsage = async function(metrics = ['apiCalls']) {
  for (const metric of metrics) {
    const usageField = `usage.current${metric.charAt(0).toUpperCase() + metric.slice(1)}`;
    this.set(usageField, 0);
  }
  
  this.usage.lastResetDate = new Date();
  await this.save();
  return this;
};

organizationSchema.methods.addIntegration = async function(service, config, connectedBy) {
  const existingIntegration = this.integrations.find(
    int => int.service === service
  );

  if (existingIntegration) {
    existingIntegration.status = 'active';
    existingIntegration.config = config;
    existingIntegration.connectedAt = new Date();
    existingIntegration.connectedBy = connectedBy;
  } else {
    this.integrations.push({
      service,
      status: 'active',
      config,
      connectedAt: new Date(),
      connectedBy
    });
  }

  await this.save();
  return this;
};

organizationSchema.methods.removeIntegration = async function(service) {
  this.integrations = this.integrations.filter(
    int => int.service !== service
  );
  await this.save();
  return this;
};

organizationSchema.methods.verify = async function(notes) {
  this.verificationStatus = 'verified';
  this.verifiedAt = new Date();
  this.verificationNotes = notes;
  
  if (this.status === 'pending') {
    this.status = 'active';
  }

  await this.save();
  return this;
};

organizationSchema.methods.suspend = async function(reason) {
  this.status = 'suspended';
  await this.save();
  
  // Audit the suspension
  await this.audit('ORGANIZATION_SUSPENDED', { reason });
  
  return this;
};

organizationSchema.methods.reactivate = async function() {
  if (this.status === 'suspended') {
    this.status = 'active';
    await this.save();
    
    // Audit the reactivation
    await this.audit('ORGANIZATION_REACTIVATED');
  }
  
  return this;
};

// Static methods
organizationSchema.statics.findBySlug = async function(slug) {
  return await this.findOne({ slug: slug.toLowerCase() });
};

organizationSchema.statics.generateUniqueSlug = async function(name) {
  let slug = slugHelper.createSlug(name);
  let counter = 1;

  while (await this.exists({ slug })) {
    slug = `${slugHelper.createSlug(name)}-${counter}`;
    counter++;
  }

  return slug;
};

organizationSchema.statics.searchOrganizations = async function(query, options = {}) {
  const {
    type,
    industry,
    status = 'active',
    verified,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;

  const searchQuery = {
    $or: [
      { name: new RegExp(query, 'i') },
      { displayName: new RegExp(query, 'i') },
      { description: new RegExp(query, 'i') },
      { slug: new RegExp(query, 'i') }
    ]
  };

  if (type) {
    searchQuery.type = type;
  }

  if (industry) {
    searchQuery.industry = industry;
  }

  if (status) {
    searchQuery.status = status;
  }

  if (verified !== undefined) {
    searchQuery.verificationStatus = verified ? 'verified' : { $ne: 'verified' };
  }

  return await this.find(searchQuery)
    .limit(limit)
    .skip(skip)
    .sort(sort);
};

organizationSchema.statics.getOrganizationStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.type) {
    match.type = filters.type;
  }

  if (filters.status) {
    match.status = filters.status;
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        verified: {
          $sum: { $cond: [{ $eq: ['$verificationStatus', 'verified'] }, 1, 0] }
        },
        totalMembers: { $sum: '$memberCount' },
        avgMembers: { $avg: '$memberCount' },
        byPlan: {
          $push: {
            plan: '$subscription.plan',
            status: '$subscription.status'
          }
        },
        byType: {
          $push: '$type'
        },
        byIndustry: {
          $push: '$industry'
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        active: 1,
        verified: 1,
        totalMembers: 1,
        avgMembers: { $round: ['$avgMembers', 2] },
        verificationRate: {
          $multiply: [{ $divide: ['$verified', '$total'] }, 100]
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    active: 0,
    verified: 0,
    totalMembers: 0,
    avgMembers: 0,
    verificationRate: 0
  };
};

organizationSchema.statics.getPlanFeatures = function(plan) {
  const planFeatures = {
    free: {
      maxUsers: 5,
      maxProjects: 3,
      maxStorage: 1073741824, // 1GB
      maxApiCalls: 1000,
      customDomain: false,
      whiteLabel: false,
      advancedAnalytics: false,
      prioritySupport: false,
      sla: false,
      sso: false,
      apiAccess: false
    },
    starter: {
      maxUsers: 20,
      maxProjects: 10,
      maxStorage: 10737418240, // 10GB
      maxApiCalls: 10000,
      customDomain: false,
      whiteLabel: false,
      advancedAnalytics: false,
      prioritySupport: false,
      sla: false,
      sso: false,
      apiAccess: true
    },
    professional: {
      maxUsers: 100,
      maxProjects: 50,
      maxStorage: 107374182400, // 100GB
      maxApiCalls: 100000,
      customDomain: true,
      whiteLabel: false,
      advancedAnalytics: true,
      prioritySupport: true,
      sla: false,
      sso: false,
      apiAccess: true
    },
    enterprise: {
      maxUsers: -1, // Unlimited
      maxProjects: -1, // Unlimited
      maxStorage: -1, // Unlimited
      maxApiCalls: -1, // Unlimited
      customDomain: true,
      whiteLabel: true,
      advancedAnalytics: true,
      prioritySupport: true,
      sla: true,
      sso: true,
      apiAccess: true
    }
  };

  return planFeatures[plan] || planFeatures.free;
};

// Create and export model
const OrganizationModel = BaseModel.createModel('Organization', organizationSchema);

module.exports = {
  schema: organizationSchema,
  model: OrganizationModel
};