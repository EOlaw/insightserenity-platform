/**
 * @fileoverview User Model for Customer Services - ConnectionManager Compatible
 * @module shared/lib/database/models/customer-services/core-business/user-management/user-model.js
 * @description Multi-tenant User model with comprehensive features
 * @requires mongoose
 * @requires bcryptjs
 * @requires crypto
 * @requires jsonwebtoken
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/auth/services/two-factor-service
 */

const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');
// const crypto = require('crypto');
// const jwt = require('jsonwebtoken');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const HashService = require('../../../../../security/encryption/hash-service');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const TwoFactorService = require('../../../../../auth/services/two-factor-service');
const { buffer } = require('stream/consumers');

const { Schema } = mongoose;

/**
 * User Schema Definition
 */

const userSchemaDefinition = {
  // ==================== Core Identity ====================
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-z0-9_-]+$/,
    index: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
    validate: {
      validator: CommonValidator.isEmail,
      message: 'Invalid email address'
    }
  },

  tenantId: {
    type: String,
    required: true,
    index: true,
    default: 'default'
  },

  alternateEmails: [{
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: CommonValidator.isEmail,
        message: 'Invalid email address'
      }
    },
    verified: {
      type: Boolean,
      default: false
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  phoneNumber: {
    type: String,
    validate: {
      validator: function (value) {
        if (!value) return true;
        return CommonValidator.isPhoneNumber(value);
      },
      message: 'Invalid phone number'
    }
  },

  alternatePhones: [{
    phoneNumber: String,
    type: {
      type: String,
      enum: ['mobile', 'work', 'home', 'other']
    },
    verified: Boolean,
    isPrimary: Boolean
  }],

  // ==================== Authentication ====================
  password: {
    type: String,
    required: function () {
      return !this.authProviders || this.authProviders.length === 0;
    },
    select: false,
    minlength: 8
  },

  passwordHistory: [{
    hash: {
      type: String,
      select: false
    },
    changedAt: Date,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }],

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

  // ==================== Multi-Factor Authentication ====================
  mfa: {
    enabled: {
      type: Boolean,
      default: false
    },
    methods: [{
      type: {
        type: String,
        enum: ['totp', 'sms', 'email', 'backup_codes', 'webauthn', 'push']
      },
      enabled: Boolean,
      isPrimary: Boolean,
      secret: {
        type: String,
        select: false
      },
      backupCodes: [{
        code: {
          type: String,
          select: false
        },
        used: Boolean,
        usedAt: Date
      }],
      deviceInfo: mongoose.Schema.Types.Mixed,
      verifiedAt: Date
    }],
    lastUsedMethod: String,
    lastUsedAt: Date,
    trustedDevices: [{
      deviceId: String,
      deviceName: String,
      fingerprint: String,
      addedAt: Date,
      lastUsedAt: Date,
      expiresAt: Date
    }]
  },

  // ==================== OAuth & SSO Providers ====================
  authProviders: [{
    provider: {
      type: String,
      enum: ['local', 'google', 'github', 'linkedin', 'microsoft', 'saml', 'oidc', 'ldap']
    },
    providerId: String,
    providerData: {
      email: String,
      name: String,
      picture: String,
      profile: mongoose.Schema.Types.Mixed
    },
    tokens: {
      accessToken: {
        type: String,
        select: false
      },
      refreshToken: {
        type: String,
        select: false
      },
      idToken: {
        type: String,
        select: false
      },
      expiresAt: Date
    },
    scopes: [String],
    isPrimary: Boolean,
    connectedAt: Date,
    lastSyncAt: Date
  }],

  // ==================== Client/Business Relationship ====================
  // For users with userType='client', this links them to the business entity
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    index: true,
    // Only required if userType is 'client'
    validate: {
      validator: function (value) {
        if (this.userType === 'client') {
          return value != null;
        }
        return true;
      },
      message: 'clientId is required for users with userType "client"'
    }
  },

  // For consultants, this links to their consultant profile
  consultantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultant',
    index: true
  },

  // ==================== Flat Permissions for Quick Access ====================
  // Cache of computed permissions from all organizations
  // This should be automatically computed and updated
  permissions: {
    type: [String],
    default: [],
    index: true,
    // This field is computed from organizations[].permissions
    // and should not be directly modified
    select: true
  },

  // Global roles (system-level, not organization-specific)
  roles: {
    type: [String],
    default: [],
    enum: ['super_admin', 'admin', 'manager', 'user', 'guest'],
    index: true
  },

  // ==================== Organization & Multi-Tenancy ====================
  organizations: [{
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    },
    teamIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    }],
    roles: [{
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
      },
      roleName: String,
      scope: {
        type: String,
        enum: ['organization', 'tenant', 'team', 'department']
      },
      assignedAt: Date,
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiresAt: Date
    }],
    permissions: [{
      permissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
      },
      resource: String,
      actions: [String],
      conditions: mongoose.Schema.Types.Mixed,
      grantedAt: Date,
      grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiresAt: Date
    }],
    joinedAt: {
      type: Date,
      default: Date.now
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending'],
      default: 'pending'
    },
    employeeId: String,
    jobTitle: String,
    isPrimary: Boolean
  }],

  defaultOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },

  // ==================== Account Status & Lifecycle ====================
  accountStatus: {
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending', 'deleted', 'locked'],
      default: 'pending',
      index: true
    },
    reason: String,
    statusHistory: [{
      status: String,
      reason: String,
      changedAt: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    activatedAt: Date,
    suspendedAt: Date,
    suspendedUntil: Date,
    deletedAt: Date,
    scheduledDeletionDate: Date
  },

  verification: {
    email: {
      verified: {
        type: Boolean,
        default: false
      },
      token: {
        type: String,
        select: false
      },
      tokenExpires: Date,
      verifiedAt: Date,
      attempts: {
        type: Number,
        default: 0
      }
    },
    phone: {
      verified: {
        type: Boolean,
        default: false
      },
      code: {
        type: String,
        select: false
      },
      codeExpires: Date,
      verifiedAt: Date,
      attempts: {
        type: Number,
        default: 0
      }
    },
    identity: {
      verified: {
        type: Boolean,
        default: false
      },
      method: String,
      verifiedAt: Date,
      documents: [{
        type: String,
        status: String,
        uploadedAt: Date
      }]
    }
  },

  // ==================== Security & Access Control ====================
  security: {
    loginAttempts: {
      count: {
        type: Number,
        default: 0
      },
      lastAttempt: Date,
      lockUntil: Date
    },
    passwordReset: {
      token: {
        type: String,
        select: false
      },
      tokenExpires: Date,
      requestedAt: Date,
      requestIp: String
    },
    securityQuestions: [{
      questionId: String,
      question: String,
      answerHash: {
        type: String,
        select: false
      },
      setAt: Date
    }],
    recoveryEmail: {
      type: String,
      validate: {
        validator: CommonValidator.isEmail,
        message: 'Invalid recovery email'
      }
    },
    recoveryPhone: String,
    ipWhitelist: [String],
    ipBlacklist: [String],
    allowedCountries: [String],
    blockedCountries: [String],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    threatLevel: {
      type: String,
      enum: ['none', 'low', 'medium', 'high', 'critical'],
      default: 'none'
    }
  },

  // ==================== Subscription & Billing ====================
  billing: {
    customerId: {
      stripe: String,
      paypal: String,
      other: mongoose.Schema.Types.Mixed
    },
    subscriptions: [{
      subscriptionId: String,
      provider: String,
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan'
      },
      status: {
        type: String,
        enum: ['active', 'trialing', 'past_due', 'cancelled', 'unpaid', 'incomplete'],
        default: 'active'
      },
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
      cancelledAt: Date,
      cancelReason: String,
      metadata: mongoose.Schema.Types.Mixed
    }],
    paymentMethods: [{
      methodId: String,
      type: {
        type: String,
        enum: ['card', 'bank_account', 'paypal', 'crypto', 'invoice']
      },
      last4: String,
      brand: String,
      isDefault: Boolean,
      expiryMonth: Number,
      expiryYear: Number
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
    },
    usage: {
      apiCalls: {
        type: Number,
        default: 0
      },
      storage: {
        type: Number,
        default: 0
      },
      bandwidth: {
        type: Number,
        default: 0
      },
      lastResetAt: Date
    }
  },

  // ==================== Profile & Preferences ====================
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    middleName: String,
    displayName: String,
    nickname: String,
    title: String,
    suffix: String,
    avatar: {
      url: String,
      publicId: String,
      source: {
        type: String,
        enum: ['upload', 'gravatar', 'oauth', 'generated']
      }
    },
    cover: {
      url: String,
      publicId: String
    },
    bio: {
      type: String,
      maxlength: 1000
    },
    pronouns: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say']
    }
  },

  preferences: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi']
    },
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
    currency: {
      type: String,
      default: 'USD'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto', 'custom'],
      default: 'auto'
    },
    notifications: {
      email: {
        enabled: { type: Boolean, default: true },
        frequency: {
          type: String,
          enum: ['instant', 'hourly', 'daily', 'weekly'],
          default: 'instant'
        },
        categories: {
          security: { type: Boolean, default: true },
          updates: { type: Boolean, default: true },
          marketing: { type: Boolean, default: false },
          social: { type: Boolean, default: true },
          billing: { type: Boolean, default: true }
        }
      },
      sms: {
        enabled: { type: Boolean, default: false },
        categories: {
          security: { type: Boolean, default: true },
          critical: { type: Boolean, default: true }
        }
      },
      push: {
        enabled: { type: Boolean, default: true },
        tokens: [{
          token: String,
          platform: String,
          deviceId: String,
          addedAt: Date
        }]
      },
      inApp: {
        enabled: { type: Boolean, default: true },
        playSound: { type: Boolean, default: true },
        showBadge: { type: Boolean, default: true }
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'organization', 'team', 'private'],
        default: 'organization'
      },
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: false },
      allowDirectMessages: { type: Boolean, default: true },
      allowMentions: { type: Boolean, default: true },
      dataCollection: {
        analytics: { type: Boolean, default: true },
        personalization: { type: Boolean, default: true },
        thirdParty: { type: Boolean, default: false }
      }
    },
    accessibility: {
      screenReader: { type: Boolean, default: false },
      highContrast: { type: Boolean, default: false },
      reducedMotion: { type: Boolean, default: false },
      fontSize: {
        type: String,
        enum: ['small', 'medium', 'large', 'extra-large'],
        default: 'medium'
      },
      keyboardNavigation: { type: Boolean, default: false }
    }
  },

  // ==================== Activity & Analytics ====================
  activity: {
    lastLoginAt: Date,
    lastActivityAt: Date,
    lastPasswordChangeAt: Date,
    loginCount: {
      type: Number,
      default: 0
    },
    loginHistory: [{
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
      location: {
        country: String,
        city: String,
        coordinates: {
          latitude: Number,
          longitude: Number
        }
      },
      sessionId: String,
      success: Boolean,
      authMethod: String
    }],
    activitySummary: {
      totalLogins: { type: Number, default: 0 },
      totalActions: { type: Number, default: 0 },
      lastWeek: { type: Number, default: 0 },
      lastMonth: { type: Number, default: 0 }
    }
  },

  // ==================== API & Integration ====================
  apiAccess: {
    enabled: {
      type: Boolean,
      default: false
    },
    keys: [{
      keyId: String,
      name: String,
      description: String,
      key: {
        type: String,
        select: false
      },
      scopes: [String],
      rateLimit: {
        requests: Number,
        period: String
      },
      ipWhitelist: [String],
      lastUsedAt: Date,
      expiresAt: Date,
      active: {
        type: Boolean,
        default: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    webhooks: [{
      url: String,
      events: [String],
      secret: {
        type: String,
        select: false
      },
      active: Boolean,
      lastTriggeredAt: Date
    }]
  },

  // ==================== Compliance & Legal ====================
  compliance: {
    gdpr: {
      consentGiven: Boolean,
      consentDate: Date,
      dataExportRequests: [{
        requestedAt: Date,
        completedAt: Date,
        downloadUrl: String,
        expiresAt: Date
      }],
      deletionRequests: [{
        requestedAt: Date,
        scheduledFor: Date,
        reason: String,
        status: String
      }]
    },
    terms: {
      accepted: Boolean,
      acceptedAt: Date,
      version: String,
      ipAddress: String
    },
    privacy: {
      accepted: Boolean,
      acceptedAt: Date,
      version: String
    },
    marketing: {
      consent: Boolean,
      consentDate: Date,
      channels: {
        email: Boolean,
        sms: Boolean,
        push: Boolean
      }
    },
    ageVerification: {
      verified: Boolean,
      verifiedAt: Date,
      method: String
    }
  },

  // ==================== Custom Fields & Metadata ====================
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  metadata: {
    source: {
      type: String,
      enum: [
        'registration',
        'invitation',
        'import',
        'migration',
        'api',
        'admin',
        'web_client',
        'web_consultant',
        'web_candidate',
        'referral',
        'linkedin',
        'job_board',
        'direct_inquiry'
      ]
    },
    referrer: String,
    campaign: String,
    tags: [String],
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }],
    flags: {
      isVip: { type: Boolean, default: false },
      isBetaTester: { type: Boolean, default: false },
      isInfluencer: { type: Boolean, default: false },
      requiresReview: { type: Boolean, default: false }
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  }
};

const userSchema = new Schema(userSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes ====================
userSchema.index({ email: 1, 'accountStatus.status': 1 });
userSchema.index({ email: 1, tenantId: 1 }); // Add tenantId to this index
userSchema.index({ 'accountStatus.status': 1, tenantId: 1 });
userSchema.index({ tenantId: 1, 'organizations.organizationId': 1 });
userSchema.index({ 'organizations.organizationId': 1, 'organizations.status': 1 });
userSchema.index({ 'organizations.tenantId': 1 });
userSchema.index({ 'profile.firstName': 1, 'profile.lastName': 1 });
userSchema.index({ 'accountStatus.status': 1, createdAt: -1 });
userSchema.index({ 'billing.subscriptions.status': 1 });
userSchema.index({ 'activity.lastLoginAt': -1 });
userSchema.index({ 'security.riskScore': -1 });
userSchema.index({ searchTokens: 1 });
userSchema.index({ 'metadata.tags': 1 });
userSchema.index({ createdAt: -1 });

// Text search index
userSchema.index({
  username: 'text',
  email: 'text',
  'profile.firstName': 'text',
  'profile.lastName': 'text',
  'profile.displayName': 'text'
});

// ==================== Virtual Fields ====================
userSchema.virtual('fullName').get(function () {
  if (this.profile.displayName) return this.profile.displayName;
  const parts = [this.profile.firstName, this.profile.middleName, this.profile.lastName].filter(Boolean);
  return parts.join(' ');
});

userSchema.virtual('isLocked').get(function () {
  return this.security.loginAttempts.lockUntil && this.security.loginAttempts.lockUntil > Date.now();
});

userSchema.virtual('isActive').get(function () {
  return this.accountStatus.status === 'active' && !this.isLocked;
});

userSchema.virtual('hasPassword').get(function () {
  return !!this.password;
});

userSchema.virtual('primaryOrganization').get(function () {
  const primary = this.organizations.find(org => org.isPrimary);
  return primary || this.organizations[0];
});

userSchema.virtual('isEmailVerified').get(function () {
  return this.verification.email.verified;
});

userSchema.virtual('isFullyVerified').get(function () {
  return this.verification.email.verified &&
    (this.verification.phone.verified || !this.phoneNumber) &&
    (!this.mfa.enabled || this.mfa.methods.some(m => m.enabled));
});

// ==================== Pre-save Middleware ====================
userSchema.pre('save', async function (next) {
  try {
    // Hash password if modified
    if (this.isModified('password')) {
      // Check password policy
      console.log('DEBUG - Password being saved (first 10 chars):', this.password.substring(0, 10));
      console.log('DEBUG - REGISTRATION: Password being saved:', this.password);
      console.log('DEBUG - REGISTRATION: Password length:', this.password.length);
      console.log('DEBUG - REGISTRATION: Password bytes:', Buffer.from(this.password).toString('hex'));
      await this.validatePasswordPolicy(this.password);

      // Add to password history
      if (this.password) {
        if (!this.passwordHistory) this.passwordHistory = [];
        this.passwordHistory.unshift({
          hash: await HashService.hashPassword(this.password),
          changedAt: new Date()
        });

        // Keep only the last N passwords
        const historyLimit = this.passwordPolicy.preventReuse || 5;
        this.passwordHistory = this.passwordHistory.slice(0, historyLimit);
      }

      this.password = await HashService.hashPassword(this.password);
      this.activity.lastPasswordChangeAt = new Date();
    }

    // Only compute if organizations have changed
    if (this.isModified('organizations') || this.isModified('roles')) {
      this.permissions = this.computePermissions();
    }

    // Generate username from email if not provided
    if (!this.username && this.email) {
      this.username = await this.constructor.generateUniqueUsername(this.email);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Set default display name
    if (!this.profile.displayName) {
      this.profile.displayName = this.fullName;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
userSchema.methods.updateSearchTokens = function () {
  const tokens = new Set();

  // Add name tokens
  if (this.profile.firstName) tokens.add(this.profile.firstName.toLowerCase());
  if (this.profile.lastName) tokens.add(this.profile.lastName.toLowerCase());
  if (this.profile.displayName) tokens.add(this.profile.displayName.toLowerCase());

  // Add email tokens
  if (this.email) {
    tokens.add(this.email.toLowerCase());
    const emailParts = this.email.split('@')[0].split(/[._-]/);
    emailParts.forEach(part => tokens.add(part.toLowerCase()));
  }

  // Add username tokens
  if (this.username) tokens.add(this.username.toLowerCase());

  this.searchTokens = Array.from(tokens);
};

userSchema.methods.validatePasswordPolicy = async function (password) {
  const policy = this.passwordPolicy;

  if (password.length < policy.minLength) {
    throw new AppError(`Password must be at least ${policy.minLength} characters`, 400, 'PASSWORD_TOO_SHORT');
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new AppError('Password must contain uppercase letters', 400, 'PASSWORD_NO_UPPERCASE');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new AppError('Password must contain lowercase letters', 400, 'PASSWORD_NO_LOWERCASE');
  }

  if (policy.requireNumbers && !/\d/.test(password)) {
    throw new AppError('Password must contain numbers', 400, 'PASSWORD_NO_NUMBERS');
  }

  if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new AppError('Password must contain special characters', 400, 'PASSWORD_NO_SPECIAL');
  }

  // Check password history with safety validation
  if (this.passwordHistory && Array.isArray(this.passwordHistory) && policy.preventReuse > 0) {
    for (let i = 0; i < Math.min(policy.preventReuse, this.passwordHistory.length); i++) {
      const historyEntry = this.passwordHistory[i];

      // CRITICAL FIX: Verify the hash exists and is valid before comparison
      if (!historyEntry || !historyEntry.hash || typeof historyEntry.hash !== 'string') {
        // Skip invalid entries rather than failing
        continue;
      }

      const isReused = await HashService.comparePassword(password, historyEntry.hash);
      if (isReused) {
        throw new AppError(`Password cannot be one of your last ${policy.preventReuse} passwords`, 400, 'PASSWORD_REUSED');
      }
    }
  }

  return true;
};

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await HashService.comparePassword(candidatePassword, this.password);
};

userSchema.methods.generatePasswordResetToken = async function () {
  const resetToken = stringHelper.generateRandomString(32);
  this.security.passwordReset.token = await HashService.hashToken(resetToken);
  this.security.passwordReset.tokenExpires = new Date(Date.now() + 3600000); // 1 hour
  this.security.passwordReset.requestedAt = new Date();
  await this.save();
  return resetToken;
};

userSchema.methods.resetPassword = async function (token, newPassword) {
  const { passwordReset } = this.security;

  if (!passwordReset.token || !passwordReset.tokenExpires) {
    throw new AppError('No reset token found', 400, 'NO_RESET_TOKEN');
  }

  if (passwordReset.tokenExpires < new Date()) {
    throw new AppError('Reset token expired', 400, 'TOKEN_EXPIRED');
  }

  const hashedToken = await HashService.hashToken(token);
  if (hashedToken !== passwordReset.token) {
    throw new AppError('Invalid reset token', 400, 'INVALID_TOKEN');
  }

  this.password = newPassword;
  this.security.passwordReset = {};
  await this.save();

  return true;
};

userSchema.methods.generateEmailVerificationToken = async function () {
  const verificationToken = stringHelper.generateRandomString(32);
  this.verification.email.token = await HashService.hashToken(verificationToken);
  this.verification.email.tokenExpires = new Date(Date.now() + 86400000); // 24 hours
  await this.save();
  return verificationToken;
};

userSchema.methods.verifyEmail = async function (token) {
  const { email } = this.verification;

  if (!email.token || !email.tokenExpires) {
    throw new AppError('No verification token found', 400, 'NO_VERIFICATION_TOKEN');
  }

  if (email.tokenExpires < new Date()) {
    throw new AppError('Verification token expired', 400, 'TOKEN_EXPIRED');
  }

  const hashedToken = await HashService.hashToken(token);
  if (hashedToken !== email.token) {
    throw new AppError('Invalid verification token', 400, 'INVALID_TOKEN');
  }

  this.verification.email.verified = true;
  this.verification.email.verifiedAt = new Date();
  this.verification.email.token = undefined;
  this.verification.email.tokenExpires = undefined;

  if (this.accountStatus.status === 'pending') {
    this.accountStatus.status = 'active';
    this.accountStatus.activatedAt = new Date();
  }

  await this.save();
  return true;
};

userSchema.methods.setupTwoFactor = async function (method = 'totp') {
  const secret = await TwoFactorService.generateSecret(this.email);

  const mfaMethod = {
    type: method,
    enabled: false,
    secret: secret.base32,
    verifiedAt: null
  };

  if (method === 'totp') {
    mfaMethod.qrCode = secret.qr;
  }

  this.mfa.methods.push(mfaMethod);
  await this.save();

  return mfaMethod;
};

userSchema.methods.verifyTwoFactor = async function (method, code) {
  const mfaMethod = this.mfa.methods.find(m => m.type === method);

  if (!mfaMethod) {
    throw new AppError('MFA method not found', 404, 'MFA_METHOD_NOT_FOUND');
  }

  const isValid = await TwoFactorService.verifyToken(mfaMethod.secret, code);

  if (!isValid) {
    throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
  }

  mfaMethod.enabled = true;
  mfaMethod.verifiedAt = new Date();
  this.mfa.enabled = true;
  this.mfa.lastUsedMethod = method;
  this.mfa.lastUsedAt = new Date();

  await this.save();
  return true;
};

userSchema.methods.addToOrganization = async function (organizationId, roleNames = ['member']) {
  const orgMembership = {
    organizationId,
    roles: roleNames.map(name => ({ roleName: name, assignedAt: new Date() })),
    joinedAt: new Date(),
    status: 'active'
  };

  // Check if already member
  const existing = this.organizations.find(
    org => org.organizationId.toString() === organizationId.toString()
  );

  if (existing) {
    throw new AppError('Already a member of this organization', 409, 'ALREADY_MEMBER');
  }

  this.organizations.push(orgMembership);

  // Set as default if first organization
  if (this.organizations.length === 1) {
    this.defaultOrganizationId = organizationId;
    orgMembership.isPrimary = true;
  }

  await this.save();
  return orgMembership;
};

userSchema.methods.removeFromOrganization = async function (organizationId) {
  const index = this.organizations.findIndex(
    org => org.organizationId.toString() === organizationId.toString()
  );

  if (index === -1) {
    throw new AppError('Not a member of this organization', 404, 'NOT_MEMBER');
  }

  this.organizations.splice(index, 1);

  // Update default organization if needed
  if (this.defaultOrganizationId?.toString() === organizationId.toString()) {
    this.defaultOrganizationId = this.organizations[0]?.organizationId;
  }

  await this.save();
  return true;
};

userSchema.methods.hasPermissionInOrganization = function (organizationId, resource, action) {
  const membership = this.organizations.find(
    org => org.organizationId.toString() === organizationId.toString()
  );

  if (!membership || membership.status !== 'active') {
    return false;
  }

  // Check direct permissions
  const hasDirectPermission = membership.permissions.some(
    p => p.resource === resource && p.actions.includes(action)
  );

  if (hasDirectPermission) return true;

  // Check role-based permissions (would need to populate roles)
  // This is simplified - in practice would check populated role permissions
  return membership.roles.some(r => r.roleName === 'admin');
};

userSchema.methods.incrementLoginAttempts = async function () {
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  const maxAttempts = 5;

  // Reset attempts if lock has expired
  if (this.security.loginAttempts.lockUntil && this.security.loginAttempts.lockUntil < Date.now()) {
    this.security.loginAttempts = { count: 1, lastAttempt: new Date() };
  } else {
    this.security.loginAttempts.count += 1;
    this.security.loginAttempts.lastAttempt = new Date();

    // Lock account after max attempts
    if (this.security.loginAttempts.count >= maxAttempts) {
      this.security.loginAttempts.lockUntil = new Date(Date.now() + lockTime);
    }
  }

  await this.save();
  return this.security.loginAttempts;
};

userSchema.methods.resetLoginAttempts = async function () {
  this.security.loginAttempts = { count: 0 };
  await this.save();
  return true;
};

userSchema.methods.recordLogin = async function (loginData) {
  const { ipAddress, userAgent, location, sessionId, authMethod, success = true } = loginData;

  this.activity.lastLoginAt = new Date();
  this.activity.loginCount += 1;

  // Update login history
  if (!this.activity.loginHistory) this.activity.loginHistory = [];

  this.activity.loginHistory.unshift({
    timestamp: new Date(),
    ipAddress,
    userAgent,
    location,
    sessionId,
    success,
    authMethod
  });

  // Keep only last 50 login records
  this.activity.loginHistory = this.activity.loginHistory.slice(0, 50);

  if (success) {
    await this.resetLoginAttempts();
  }

  await this.save();
  return true;
};

userSchema.methods.generateApiKey = async function (name, scopes = []) {
  const apiKey = `sk_${stringHelper.generateRandomString(32)}`;
  const hashedKey = await HashService.hashToken(apiKey);

  const keyData = {
    keyId: stringHelper.generateRandomString(16),
    name,
    key: hashedKey,
    scopes,
    active: true,
    createdAt: new Date()
  };

  if (!this.apiAccess.keys) this.apiAccess.keys = [];
  this.apiAccess.keys.push(keyData);
  this.apiAccess.enabled = true;

  await this.save();

  return { ...keyData, key: apiKey };
};

userSchema.methods.revokeApiKey = async function (keyId) {
  const key = this.apiAccess.keys.find(k => k.keyId === keyId);

  if (!key) {
    throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
  }

  key.active = false;
  await this.save();

  return true;
};

userSchema.methods.acceptTerms = async function (version, ipAddress) {
  this.compliance.terms = {
    accepted: true,
    acceptedAt: new Date(),
    version,
    ipAddress
  };

  await this.save();
  return true;
};

userSchema.methods.requestDataExport = async function () {
  if (!this.compliance.gdpr.dataExportRequests) {
    this.compliance.gdpr.dataExportRequests = [];
  }

  this.compliance.gdpr.dataExportRequests.push({
    requestedAt: new Date()
  });

  await this.save();

  // Trigger async export job
  logger.info('Data export requested', { userId: this._id });

  return true;
};

userSchema.methods.scheduleAccountDeletion = async function (reason, daysUntilDeletion = 30) {
  const deletionDate = new Date(Date.now() + daysUntilDeletion * 24 * 60 * 60 * 1000);

  this.accountStatus.scheduledDeletionDate = deletionDate;

  if (!this.compliance.gdpr.deletionRequests) {
    this.compliance.gdpr.deletionRequests = [];
  }

  this.compliance.gdpr.deletionRequests.push({
    requestedAt: new Date(),
    scheduledFor: deletionDate,
    reason,
    status: 'scheduled'
  });

  await this.save();

  logger.info('Account deletion scheduled', {
    userId: this._id,
    scheduledFor: deletionDate
  });

  return deletionDate;
};

/**
 * Compute and cache flat permissions array from all organizations
 * This ensures the permissions middleware can access them easily
 */
userSchema.methods.computePermissions = function () {
  const allPermissions = new Set();

  // Add global permissions based on system roles
  if (this.roles && this.roles.includes('super_admin')) {
    allPermissions.add('*:*'); // Wildcard for all permissions
  }

  // Collect permissions from all active organization memberships
  if (this.organizations && Array.isArray(this.organizations)) {
    this.organizations.forEach(org => {
      if (org.status === 'active' && org.permissions) {
        org.permissions.forEach(perm => {
          if (perm.resource && perm.actions) {
            perm.actions.forEach(action => {
              allPermissions.add(`${perm.resource}:${action}`);
            });
          }
        });
      }
    });
  }

  return Array.from(allPermissions);
};

/**
 * Update cached permissions field
 * Call this after modifying organization permissions
 */
userSchema.methods.updatePermissionsCache = async function () {
  this.permissions = this.computePermissions();
  await this.save();
  return this.permissions;
};

/**
 * Check if user has a specific permission
 * Checks both flat permissions and organization-scoped permissions
 */
userSchema.methods.hasPermission = function (permission, organizationId = null) {
  // Check super admin
  if (this.roles && this.roles.includes('super_admin')) {
    return true;
  }

  // Check flat permissions cache
  if (this.permissions && this.permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions
  const [resource] = permission.split(':');
  if (this.permissions && this.permissions.includes(`${resource}:*`)) {
    return true;
  }

  // If organization specified, check organization-specific permissions
  if (organizationId && this.organizations) {
    const org = this.organizations.find(
      o => o.organizationId.toString() === organizationId.toString()
    );

    if (org && org.status === 'active') {
      return org.permissions.some(
        p => p.resource === resource && p.actions.includes(permission.split(':')[1])
      );
    }
  }

  return false;
};

// ==================== Static Methods ====================
userSchema.statics.findByEmail = async function (email, options = {}) {
  const query = { email: email.toLowerCase() };

  if (options.includeDeleted !== true) {
    query['accountStatus.status'] = { $ne: 'deleted' };
  }

  return await this.findOne(query);
};

userSchema.statics.findByUsername = async function (username, options = {}) {
  const query = { username: username.toLowerCase() };

  if (options.includeDeleted !== true) {
    query['accountStatus.status'] = { $ne: 'deleted' };
  }

  return await this.findOne(query);
};

userSchema.statics.findByCredentials = async function (credential, password) {
  const user = await this.findOne({
    $and: [
      {
        $or: [
          { email: credential.toLowerCase() },
          { username: credential.toLowerCase() }
        ]
      },
      { 'accountStatus.status': { $ne: 'deleted' } }
    ]
  }).select('+password +security.loginAttempts');

  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check if account is locked
  if (user.isLocked) {
    const remainingTime = Math.ceil((user.security.loginAttempts.lockUntil - Date.now()) / 1000 / 60);
    throw new AppError(`Account locked. Try again in ${remainingTime} minutes`, 423, 'ACCOUNT_LOCKED');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check account status
  if (user.accountStatus.status === 'suspended') {
    throw new AppError('Account suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  if (user.accountStatus.status === 'inactive') {
    throw new AppError('Account inactive', 403, 'ACCOUNT_INACTIVE');
  }

  return user;
};

userSchema.statics.findByOAuthProvider = async function (provider, providerId) {
  return await this.findOne({
    'authProviders.provider': provider,
    'authProviders.providerId': providerId,
    'accountStatus.status': { $ne: 'deleted' }
  });
};

userSchema.statics.findByApiKey = async function (apiKey) {
  const hashedKey = await HashService.hashToken(apiKey);

  const user = await this.findOne({
    'apiAccess.keys': {
      $elemMatch: {
        key: hashedKey,
        active: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      }
    },
    'accountStatus.status': 'active'
  }).select('+apiAccess.keys.key');

  if (!user) {
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  // Update last used
  const key = user.apiAccess.keys.find(k => k.key === hashedKey);
  key.lastUsedAt = new Date();
  await user.save();

  return { user, apiKey: key };
};

userSchema.statics.generateUniqueUsername = async function (baseUsername) {
  // Extract base from email
  let username = baseUsername.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');

  // Ensure minimum length
  if (username.length < 3) {
    username = username.padEnd(3, '0');
  }

  // Check uniqueness
  let counter = 0;
  let uniqueUsername = username;

  while (await this.exists({ username: uniqueUsername })) {
    counter++;
    uniqueUsername = `${username}${counter}`;
  }

  return uniqueUsername;
};

userSchema.statics.searchUsers = async function (query, options = {}) {
  const {
    organizationId,
    status = 'active',
    roles,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;

  const searchQuery = {
    $and: [
      { 'accountStatus.status': status },
      {
        $or: [
          { username: new RegExp(query, 'i') },
          { email: new RegExp(query, 'i') },
          { 'profile.firstName': new RegExp(query, 'i') },
          { 'profile.lastName': new RegExp(query, 'i') },
          { 'profile.displayName': new RegExp(query, 'i') },
          { searchTokens: new RegExp(query, 'i') }
        ]
      }
    ]
  };

  if (organizationId) {
    searchQuery.$and.push({
      'organizations.organizationId': organizationId,
      'organizations.status': 'active'
    });
  }

  if (roles && roles.length > 0) {
    searchQuery.$and.push({
      'organizations.roles.roleName': { $in: roles }
    });
  }

  const [users, total] = await Promise.all([
    this.find(searchQuery)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(searchQuery)
  ]);

  return {
    users,
    total,
    hasMore: total > skip + users.length
  };
};

userSchema.statics.getUserStatistics = async function (organizationId) {
  const match = organizationId
    ? { 'organizations.organizationId': organizationId }
    : {};

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
                $sum: { $cond: [{ $eq: ['$accountStatus.status', 'active'] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$accountStatus.status', 'pending'] }, 1, 0] }
              },
              suspended: {
                $sum: { $cond: [{ $eq: ['$accountStatus.status', 'suspended'] }, 1, 0] }
              },
              emailVerified: {
                $sum: { $cond: ['$verification.email.verified', 1, 0] }
              },
              mfaEnabled: {
                $sum: { $cond: ['$mfa.enabled', 1, 0] }
              },
              apiEnabled: {
                $sum: { $cond: ['$apiAccess.enabled', 1, 0] }
              }
            }
          }
        ],
        byRegistrationDate: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ],
        byAuthProvider: [
          { $unwind: '$authProviders' },
          {
            $group: {
              _id: '$authProviders.provider',
              count: { $sum: 1 }
            }
          }
        ],
        bySubscription: [
          { $unwind: { path: '$billing.subscriptions', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: '$billing.subscriptions.status',
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      pending: 0,
      suspended: 0,
      emailVerified: 0,
      mfaEnabled: 0,
      apiEnabled: 0
    },
    trends: {
      registrations: result.byRegistrationDate.reverse(),
      authProviders: result.byAuthProvider,
      subscriptions: result.bySubscription
    }
  };
};

userSchema.statics.bulkInvite = async function (invitations, invitedBy) {
  const results = {
    successful: [],
    failed: []
  };

  for (const invitation of invitations) {
    try {
      const { email, organizationId, roles, metadata } = invitation;

      // Check if user exists
      let user = await this.findByEmail(email);

      if (user) {
        // Add to organization if not already member
        const isMember = user.organizations.some(
          org => org.organizationId.toString() === organizationId.toString()
        );

        if (!isMember) {
          await user.addToOrganization(organizationId, roles);
          results.successful.push({ email, status: 'added_to_organization' });
        } else {
          results.failed.push({ email, error: 'Already a member' });
        }
      } else {
        // Create invited user
        user = new this({
          email,
          username: await this.generateUniqueUsername(email),
          profile: {
            firstName: metadata?.firstName || 'Invited',
            lastName: metadata?.lastName || 'User'
          },
          accountStatus: {
            status: 'pending'
          },
          organizations: [{
            organizationId,
            roles: roles.map(r => ({ roleName: r, assignedAt: new Date() })),
            invitedBy,
            status: 'pending'
          }],
          metadata: {
            source: 'invitation',
            ...metadata
          }
        });

        await user.save();

        // Generate verification token
        const verificationToken = await user.generateEmailVerificationToken();

        results.successful.push({
          email,
          status: 'invited',
          userId: user._id,
          verificationToken
        });
      }
    } catch (error) {
      results.failed.push({
        email: invitation.email,
        error: error.message
      });
    }
  }

  return results;
};

/*
 * Create user with default permissions based on userType
 */
userSchema.statics.createWithDefaults = async function(userData, options = {}) {
  const { organizationId, tenantId, autoCreateClient = false } = options;
  
  // Define default permissions by userType
  const defaultPermissionsByType = {
    client: [
      { resource: 'clients', actions: ['read', 'update'] },
      { resource: 'projects', actions: ['read'] },
      { resource: 'documents', actions: ['read', 'create'] },
      { resource: 'contacts', actions: ['read', 'update'] },
      { resource: 'invoices', actions: ['read'] }
    ],
    consultant: [
      { resource: 'projects', actions: ['read', 'update'] },
      { resource: 'clients', actions: ['read'] },
      { resource: 'timesheets', actions: ['create', 'read', 'update'] },
      { resource: 'documents', actions: ['read', 'create'] }
    ],
    admin: [
      { resource: '*', actions: ['*'] }
    ],
    partner: [
      { resource: 'jobs', actions: ['read', 'create'] },
      { resource: 'candidates', actions: ['read', 'create', 'update'] },
      { resource: 'applications', actions: ['read', 'create'] }
    ]
  };
  
  // Get default permissions for userType
  const defaultPermissions = defaultPermissionsByType[userData.userType] || [];
  
  // Create organization membership with default permissions
  if (organizationId) {
    userData.organizations = [{
      organizationId,
      tenantId: tenantId || userData.tenantId,
      permissions: defaultPermissions.map(p => ({
        resource: p.resource,
        actions: p.actions,
        grantedAt: new Date(),
        grantedBy: options.grantedBy
      })),
      roles: options.roles || [{ roleName: 'user', assignedAt: new Date() }],
      status: 'active',
      joinedAt: new Date()
    }];
    
    userData.defaultOrganizationId = organizationId;
  }
  
  // Create the user
  const user = new this(userData);
  await user.save();
  
  // Auto-create Client document if userType is 'client' and requested
  if (userData.userType === 'client' && autoCreateClient && !userData.clientId) {
    const Client = mongoose.model('Client');
    const client = await Client.create({
      companyName: userData.companyName || `${userData.firstName} ${userData.lastName}'s Company`,
      tenantId: userData.tenantId || tenantId,
      organizationId,
      primaryContact: {
        name: `${userData.firstName} ${userData.lastName}`,
        email: userData.email,
        phone: userData.phone
      },
      relationship: {
        status: 'prospect',
        accountManager: options.accountManager
      },
      metadata: {
        source: 'user_registration',
        linkedUserId: user._id
      }
    });
    
    user.clientId = client._id;
    await user.save();
  }
  
  return user;
};

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 */
module.exports = {
  schema: userSchema,
  modelName: 'User',

  // Legacy export for backward compatibility
  // This will be used if imported directly in environments without ConnectionManager
  createModel: function (connection) {
    if (connection) {
      return connection.model('User', userSchema);
    } else {
      // Fallback to default mongoose connection
      return mongoose.model('User', userSchema);
    }
  }
}

// For backward compatibility, also export as direct model
module.exports.User = mongoose.model('User', userSchema);
module.exports.userSchema = userSchema;
