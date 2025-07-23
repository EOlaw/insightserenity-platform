'use strict';

/**
 * @fileoverview User model with authentication and profile management
 * @module shared/lib/database/models/user-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const HashService = require('../../security/encryption/hash-service');
const validators = require('../../utils/validators/common-validators');
const stringHelper = require('../../utils/helpers/string-helper');

/**
 * User schema definition
 */
const userSchemaDefinition = {
  // Basic Information
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
      validator: validators.isEmail,
      message: 'Invalid email address'
    }
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  emailVerificationToken: {
    type: String,
    select: false
  },

  emailVerificationExpires: {
    type: Date,
    select: false
  },

  // Authentication
  password: {
    type: String,
    required: function() {
      return !this.oauthProviders || this.oauthProviders.length === 0;
    },
    select: false,
    minlength: 8
  },

  passwordResetToken: {
    type: String,
    select: false
  },

  passwordResetExpires: {
    type: Date,
    select: false
  },

  passwordChangedAt: {
    type: Date,
    select: false
  },

  // Profile Information
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
    displayName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    avatar: {
      url: String,
      publicId: String
    },
    bio: {
      type: String,
      maxlength: 500
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function(value) {
          if (!value) return true;
          const age = new Date().getFullYear() - value.getFullYear();
          return age >= 13 && age <= 120;
        },
        message: 'Invalid date of birth'
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
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
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
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko']
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },

  // Roles and Permissions
  roles: [{
    type: String,
    enum: ['user', 'moderator', 'admin', 'super_admin'],
    default: 'user'
  }],

  permissions: [{
    resource: String,
    actions: [String]
  }],

  // Organization & Tenant
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },

  // Account Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending', 'deleted'],
    default: 'pending',
    index: true
  },

  suspendedAt: Date,
  suspendedReason: String,
  suspendedUntil: Date,

  // Security Settings
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },

  twoFactorSecret: {
    type: String,
    select: false
  },

  twoFactorBackupCodes: {
    type: [String],
    select: false
  },

  securityQuestions: [{
    question: String,
    answerHash: String
  }],

  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },

  lockUntil: {
    type: Date,
    select: false
  },

  // OAuth Providers
  oauthProviders: [{
    provider: {
      type: String,
      enum: ['google', 'github', 'linkedin', 'facebook', 'twitter']
    },
    providerId: String,
    profile: mongoose.Schema.Types.Mixed,
    accessToken: {
      type: String,
      select: false
    },
    refreshToken: {
      type: String,
      select: false
    },
    tokenExpires: Date
  }],

  // Activity Tracking
  lastLoginAt: Date,
  lastLoginIp: String,
  lastLoginDevice: String,
  loginHistory: [{
    timestamp: Date,
    ip: String,
    userAgent: String,
    device: String,
    location: String,
    success: Boolean
  }],

  // Preferences
  preferences: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'contacts'],
        default: 'contacts'
      },
      showEmail: {
        type: Boolean,
        default: false
      },
      showPhone: {
        type: Boolean,
        default: false
      },
      allowMessaging: {
        type: Boolean,
        default: true
      }
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },

  // Subscription & Billing
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'cancelled', 'trialing'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date,
    trialEndsAt: Date,
    customerId: String,
    subscriptionId: String
  },

  // API Access
  apiKeys: [{
    key: {
      type: String,
      select: false
    },
    name: String,
    description: String,
    permissions: [String],
    lastUsedAt: Date,
    expiresAt: Date,
    active: {
      type: Boolean,
      default: true
    }
  }],

  // Compliance
  termsAcceptedAt: Date,
  termsVersion: String,
  privacyAcceptedAt: Date,
  privacyVersion: String,
  marketingConsentAt: Date,
  dataRetentionConsentAt: Date,

  // Search
  searchableText: {
    type: String,
    select: false,
    searchable: true
  }
};

// Create schema
const userSchema = BaseModel.createSchema(userSchemaDefinition, {
  collection: 'users',
  timestamps: true
});

// Indexes
userSchema.index({ 'profile.firstName': 1, 'profile.lastName': 1 });
userSchema.index({ organizationId: 1, status: 1 });
userSchema.index({ 'subscription.plan': 1, 'subscription.status': 1 });
userSchema.index({ lastLoginAt: -1 });
userSchema.index({ createdAt: -1 });

// Virtual fields
userSchema.virtual('profile.fullName').get(function() {
  if (this.profile.displayName) {
    return this.profile.displayName;
  }
  return `${this.profile.firstName} ${this.profile.lastName}`.trim();
});

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.isLocked;
});

userSchema.virtual('hasPassword').get(function() {
  return !!this.password;
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    // Hash password if modified
    if (this.isModified('password')) {
      this.password = await HashService.hashPassword(this.password);
      this.passwordChangedAt = new Date();
    }

    // Generate username from email if not provided
    if (!this.username && this.email) {
      const baseUsername = this.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      this.username = await this.constructor.generateUniqueUsername(baseUsername);
    }

    // Update searchable text
    this.searchableText = [
      this.username,
      this.email,
      this.profile.firstName,
      this.profile.lastName,
      this.profile.displayName
    ].filter(Boolean).join(' ').toLowerCase();

    // Set display name if not provided
    if (!this.profile.displayName) {
      this.profile.displayName = this.profile.fullName;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await HashService.comparePassword(candidatePassword, this.password);
};

userSchema.methods.generatePasswordResetToken = async function() {
  const resetToken = stringHelper.generateRandomString(32);
  this.passwordResetToken = await HashService.hashToken(resetToken);
  this.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
  await this.save();
  return resetToken;
};

userSchema.methods.generateEmailVerificationToken = async function() {
  const verificationToken = stringHelper.generateRandomString(32);
  this.emailVerificationToken = await HashService.hashToken(verificationToken);
  this.emailVerificationExpires = new Date(Date.now() + 86400000); // 24 hours
  await this.save();
  return verificationToken;
};

userSchema.methods.verifyEmail = async function(token) {
  if (!this.emailVerificationToken || !this.emailVerificationExpires) {
    throw new AppError('No verification token found', 400, 'NO_VERIFICATION_TOKEN');
  }

  if (this.emailVerificationExpires < new Date()) {
    throw new AppError('Verification token expired', 400, 'TOKEN_EXPIRED');
  }

  const hashedToken = await HashService.hashToken(token);
  
  if (hashedToken !== this.emailVerificationToken) {
    throw new AppError('Invalid verification token', 400, 'INVALID_TOKEN');
  }

  this.emailVerified = true;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  
  if (this.status === 'pending') {
    this.status = 'active';
  }

  await this.save();
  return true;
};

userSchema.methods.resetPassword = async function(token, newPassword) {
  if (!this.passwordResetToken || !this.passwordResetExpires) {
    throw new AppError('No reset token found', 400, 'NO_RESET_TOKEN');
  }

  if (this.passwordResetExpires < new Date()) {
    throw new AppError('Reset token expired', 400, 'TOKEN_EXPIRED');
  }

  const hashedToken = await HashService.hashToken(token);
  
  if (hashedToken !== this.passwordResetToken) {
    throw new AppError('Invalid reset token', 400, 'INVALID_TOKEN');
  }

  this.password = newPassword;
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;
  this.passwordChangedAt = new Date();

  await this.save();
  return true;
};

userSchema.methods.incrementLoginAttempts = async function() {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  // Lock account after max attempts
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + lockTime) };
  }

  return await this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function() {
  return await this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

userSchema.methods.recordLogin = async function(loginData) {
  const { ip, userAgent, device, location, success = true } = loginData;

  this.lastLoginAt = new Date();
  this.lastLoginIp = ip;
  this.lastLoginDevice = device;

  // Add to login history
  if (!this.loginHistory) {
    this.loginHistory = [];
  }

  this.loginHistory.unshift({
    timestamp: new Date(),
    ip,
    userAgent,
    device,
    location,
    success
  });

  // Keep only last 20 login records
  if (this.loginHistory.length > 20) {
    this.loginHistory = this.loginHistory.slice(0, 20);
  }

  if (success) {
    await this.resetLoginAttempts();
  }

  await this.save();
};

userSchema.methods.hasRole = function(role) {
  return this.roles.includes(role);
};

userSchema.methods.hasAnyRole = function(roles) {
  return roles.some(role => this.roles.includes(role));
};

userSchema.methods.hasPermission = function(resource, action) {
  // Super admin has all permissions
  if (this.roles.includes('super_admin')) {
    return true;
  }

  // Check specific permissions
  const permission = this.permissions.find(p => p.resource === resource);
  return permission && permission.actions.includes(action);
};

userSchema.methods.addRole = async function(role) {
  if (!this.roles.includes(role)) {
    this.roles.push(role);
    await this.save();
  }
  return this;
};

userSchema.methods.removeRole = async function(role) {
  this.roles = this.roles.filter(r => r !== role);
  await this.save();
  return this;
};

userSchema.methods.suspend = async function(reason, until) {
  this.status = 'suspended';
  this.suspendedAt = new Date();
  this.suspendedReason = reason;
  this.suspendedUntil = until;
  await this.save();
  return this;
};

userSchema.methods.reactivate = async function() {
  if (this.status === 'suspended') {
    this.status = 'active';
    this.suspendedAt = undefined;
    this.suspendedReason = undefined;
    this.suspendedUntil = undefined;
  }
  await this.save();
  return this;
};

userSchema.methods.generateApiKey = async function(name, permissions = []) {
  const apiKey = stringHelper.generateRandomString(32);
  const hashedKey = await HashService.hashToken(apiKey);

  if (!this.apiKeys) {
    this.apiKeys = [];
  }

  this.apiKeys.push({
    key: hashedKey,
    name,
    permissions,
    active: true
  });

  await this.save();
  return apiKey;
};

userSchema.methods.revokeApiKey = async function(keyId) {
  const key = this.apiKeys.id(keyId);
  if (key) {
    key.active = false;
    await this.save();
  }
  return this;
};

userSchema.methods.acceptTerms = async function(version) {
  this.termsAcceptedAt = new Date();
  this.termsVersion = version;
  await this.save();
  return this;
};

userSchema.methods.acceptPrivacy = async function(version) {
  this.privacyAcceptedAt = new Date();
  this.privacyVersion = version;
  await this.save();
  return this;
};

// Static methods
userSchema.statics.findByEmail = async function(email) {
  return await this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByUsername = async function(username) {
  return await this.findOne({ username: username.toLowerCase() });
};

userSchema.statics.findByCredentials = async function(credential, password) {
  const user = await this.findOne({
    $or: [
      { email: credential.toLowerCase() },
      { username: credential.toLowerCase() }
    ]
  }).select('+password +loginAttempts +lockUntil');

  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw new AppError('Account is locked', 423, 'ACCOUNT_LOCKED');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check account status
  if (user.status !== 'active' && user.status !== 'pending') {
    throw new AppError(`Account is ${user.status}`, 403, 'ACCOUNT_INACTIVE');
  }

  return user;
};

userSchema.statics.findByOAuthProvider = async function(provider, providerId) {
  return await this.findOne({
    'oauthProviders.provider': provider,
    'oauthProviders.providerId': providerId
  });
};

userSchema.statics.generateUniqueUsername = async function(baseUsername) {
  let username = baseUsername;
  let counter = 1;

  while (await this.exists({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
};

userSchema.statics.searchUsers = async function(query, options = {}) {
  const {
    organizationId,
    status = 'active',
    roles,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;

  const searchQuery = {
    $or: [
      { username: new RegExp(query, 'i') },
      { email: new RegExp(query, 'i') },
      { 'profile.firstName': new RegExp(query, 'i') },
      { 'profile.lastName': new RegExp(query, 'i') },
      { 'profile.displayName': new RegExp(query, 'i') }
    ]
  };

  if (organizationId) {
    searchQuery.organizationId = organizationId;
  }

  if (status) {
    searchQuery.status = status;
  }

  if (roles && roles.length > 0) {
    searchQuery.roles = { $in: roles };
  }

  return await this.find(searchQuery)
    .limit(limit)
    .skip(skip)
    .sort(sort);
};

userSchema.statics.getUserStatistics = async function(organizationId) {
  const match = organizationId ? { organizationId } : {};

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        suspended: {
          $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
        },
        verified: {
          $sum: { $cond: ['$emailVerified', 1, 0] }
        },
        twoFactorEnabled: {
          $sum: { $cond: ['$twoFactorEnabled', 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        active: 1,
        pending: 1,
        suspended: 1,
        verified: 1,
        twoFactorEnabled: 1,
        verificationRate: {
          $multiply: [{ $divide: ['$verified', '$total'] }, 100]
        },
        twoFactorRate: {
          $multiply: [{ $divide: ['$twoFactorEnabled', '$total'] }, 100]
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    verified: 0,
    twoFactorEnabled: 0,
    verificationRate: 0,
    twoFactorRate: 0
  };
};

// Create and export model
const UserModel = BaseModel.createModel('User', userSchema);

module.exports = {
  schema: userSchema,
  model: UserModel
};