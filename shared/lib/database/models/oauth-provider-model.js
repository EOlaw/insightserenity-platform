'use strict';

/**
 * @fileoverview OAuth provider model for managing third-party authentication providers and token storage
 * @module shared/lib/database/models/oauth-provider-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const validators = require('../../utils/validators/common-validators');
const encryptionService = require('../../security/encryption/encryption-service');
const cryptoHelper = require('../../utils/helpers/crypto-helper');

/**
 * OAuth provider schema definition
 */
const oauthProviderSchemaDefinition = {
  // ==================== Core Identity ====================
  providerId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `oauth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

  // ==================== Provider Information ====================
  provider: {
    name: {
      type: String,
      enum: ['google', 'github', 'linkedin', 'microsoft', 'apple', 'facebook', 'twitter', 'slack', 'discord', 'okta', 'auth0', 'custom'],
      required: true,
      index: true
    },
    version: {
      type: String,
      default: 'v2.0'
    },
    environment: {
      type: String,
      enum: ['production', 'sandbox', 'development'],
      default: 'production'
    },
    displayName: {
      type: String,
      required: true
    },
    iconUrl: String,
    websiteUrl: String
  },

  // ==================== OAuth Configuration ====================
  config: {
    clientId: {
      type: String,
      required: true,
      select: false
    },
    clientSecret: {
      type: String,
      required: true,
      select: false
    },
    scope: {
      type: [String],
      required: true,
      default: ['profile', 'email']
    },
    endpoints: {
      authorization: {
        type: String,
        required: true
      },
      token: {
        type: String,
        required: true
      },
      userInfo: String,
      revoke: String,
      jwks: String
    },
    redirectUri: {
      type: String,
      required: true,
      validate: {
        validator: function(value) {
          return validators.isURL(value);
        },
        message: 'Invalid redirect URI'
      }
    },
    state: {
      enabled: {
        type: Boolean,
        default: true
      },
      expiry: {
        type: Number,
        default: 600000 // 10 minutes
      }
    },
    pkce: {
      enabled: {
        type: Boolean,
        default: false
      },
      method: {
        type: String,
        enum: ['S256', 'plain'],
        default: 'S256'
      }
    }
  },

  // ==================== Token Storage ====================
  tokens: {
    accessToken: {
      value: {
        type: String,
        select: false
      },
      expiresAt: Date,
      scope: [String],
      tokenType: {
        type: String,
        default: 'Bearer'
      }
    },
    refreshToken: {
      value: {
        type: String,
        select: false
      },
      expiresAt: Date
    },
    idToken: {
      value: {
        type: String,
        select: false
      },
      expiresAt: Date,
      claims: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      }
    },
    lastRefreshed: Date,
    refreshCount: {
      type: Number,
      default: 0
    }
  },

  // ==================== User Profile Data ====================
  profile: {
    providerId: {
      type: String,
      required: true,
      index: true
    },
    username: String,
    displayName: String,
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
    emailVerified: {
      type: Boolean,
      default: false
    },
    firstName: String,
    lastName: String,
    profileUrl: String,
    avatarUrl: String,
    location: String,
    locale: String,
    timezone: String,
    raw: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  },

  // ==================== Connection Status ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'revoked', 'expired', 'error', 'pending'],
      default: 'pending',
      index: true
    },
    connectedAt: Date,
    lastUsedAt: Date,
    lastSyncAt: Date,
    revokedAt: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    revokeReason: {
      type: String,
      enum: ['user_request', 'admin_action', 'security_violation', 'token_expired', 'provider_revoked', 'compliance_requirement']
    }
  },

  // ==================== Security Features ====================
  security: {
    ipWhitelist: [String],
    ipBlacklist: [String],
    allowedDomains: [String],
    requireMFA: {
      type: Boolean,
      default: false
    },
    sessionTimeout: {
      type: Number,
      default: 3600000 // 1 hour
    },
    maxConcurrentSessions: {
      type: Number,
      default: 3
    },
    tokenRotation: {
      enabled: {
        type: Boolean,
        default: true
      },
      interval: {
        type: Number,
        default: 3600000 // 1 hour
      }
    }
  },

  // ==================== Provider Specific Data ====================
  providerData: {
    // Google specific
    google: {
      workspace: {
        domain: String,
        orgUnitPath: String
      },
      permissions: [String]
    },
    // GitHub specific
    github: {
      login: String,
      company: String,
      hireable: Boolean,
      publicRepos: Number,
      followers: Number,
      following: Number
    },
    // LinkedIn specific
    linkedin: {
      industryName: String,
      headline: String,
      summary: String,
      numConnections: Number,
      positions: [{
        title: String,
        company: String,
        startDate: Date,
        endDate: Date,
        isCurrent: Boolean
      }]
    },
    // Microsoft specific
    microsoft: {
      tenant: String,
      upn: String,
      jobTitle: String,
      department: String,
      companyName: String
    },
    // Custom provider data
    custom: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },

  // ==================== Usage Analytics ====================
  analytics: {
    totalLogins: {
      type: Number,
      default: 0
    },
    lastLoginAt: Date,
    averageSessionDuration: Number,
    failedAttempts: {
      count: {
        type: Number,
        default: 0
      },
      lastFailedAt: Date,
      consecutiveFailures: {
        type: Number,
        default: 0
      }
    },
    dataRequests: [{
      type: {
        type: String,
        enum: ['profile', 'email', 'calendar', 'contacts', 'files', 'repositories']
      },
      requestedAt: Date,
      granted: Boolean,
      scope: [String]
    }]
  },

  // ==================== Sync Configuration ====================
  sync: {
    enabled: {
      type: Boolean,
      default: true
    },
    frequency: {
      type: String,
      enum: ['realtime', 'hourly', 'daily', 'weekly', 'manual'],
      default: 'daily'
    },
    lastSync: {
      at: Date,
      status: {
        type: String,
        enum: ['success', 'partial', 'failed', 'pending']
      },
      itemsProcessed: Number,
      errors: [{
        field: String,
        message: String,
        code: String
      }]
    },
    syncFields: [{
      field: String,
      enabled: Boolean,
      lastSynced: Date
    }],
    conflicts: [{
      field: String,
      localValue: mongoose.Schema.Types.Mixed,
      remoteValue: mongoose.Schema.Types.Mixed,
      resolvedAt: Date,
      resolution: {
        type: String,
        enum: ['use_local', 'use_remote', 'merge', 'skip']
      }
    }]
  },

  // ==================== Compliance & Privacy ====================
  compliance: {
    gdpr: {
      dataProcessingConsent: {
        granted: Boolean,
        grantedAt: Date,
        withdrawnAt: Date
      },
      dataRetention: {
        retainUntil: Date,
        reason: String
      },
      rightToPortability: {
        requested: Boolean,
        requestedAt: Date,
        fulfilledAt: Date
      }
    },
    ccpa: {
      doNotSell: {
        type: Boolean,
        default: false
      },
      optOutDate: Date
    },
    dataMinimization: {
      collectOnlyNecessary: {
        type: Boolean,
        default: true
      },
      fields: [{
        name: String,
        necessary: Boolean,
        purpose: String
      }]
    }
  },

  // ==================== Error Handling ====================
  errors: {
    lastError: {
      code: String,
      message: String,
      occurredAt: Date,
      type: {
        type: String,
        enum: ['auth_error', 'token_error', 'api_error', 'network_error', 'rate_limit', 'permission_error', 'configuration_error']
      },
      details: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      }
    },
    errorHistory: [{
      code: String,
      message: String,
      occurredAt: Date,
      type: String,
      resolved: Boolean,
      resolvedAt: Date
    }],
    retryPolicy: {
      maxRetries: {
        type: Number,
        default: 3
      },
      backoffMultiplier: {
        type: Number,
        default: 2
      },
      currentRetryCount: {
        type: Number,
        default: 0
      },
      nextRetryAt: Date
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['user_initiated', 'admin_setup', 'api_integration', 'migration'],
      default: 'user_initiated'
    },
    integrationId: String,
    externalId: String,
    tags: [String],
    labels: {
      type: Map,
      of: String
    },
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
      category: {
        type: String,
        enum: ['general', 'security', 'compliance', 'technical', 'support']
      },
      internal: {
        type: Boolean,
        default: true
      }
    }]
  }
};

// Create schema
const oauthProviderSchema = BaseModel.createSchema(oauthProviderSchemaDefinition, {
  collection: 'oauth_providers',
  timestamps: true
});

// ==================== Indexes ====================
oauthProviderSchema.index({ userId: 1, 'provider.name': 1 }, { unique: true });
oauthProviderSchema.index({ organizationId: 1, 'status.state': 1 });
oauthProviderSchema.index({ tenantId: 1, 'status.state': 1 });
oauthProviderSchema.index({ 'provider.name': 1, 'status.state': 1 });
oauthProviderSchema.index({ 'profile.providerId': 1, 'provider.name': 1 });
oauthProviderSchema.index({ 'profile.email': 1 });
oauthProviderSchema.index({ 'status.connectedAt': -1 });
oauthProviderSchema.index({ 'status.lastUsedAt': -1 });
oauthProviderSchema.index({ 'tokens.accessToken.expiresAt': 1 });
oauthProviderSchema.index({ 'tokens.refreshToken.expiresAt': 1 });
oauthProviderSchema.index({ 'sync.lastSync.at': -1 });

// ==================== Virtual Fields ====================
oauthProviderSchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

oauthProviderSchema.virtual('isTokenExpired').get(function() {
  if (!this.tokens.accessToken.expiresAt) return false;
  return this.tokens.accessToken.expiresAt < new Date();
});

oauthProviderSchema.virtual('isRefreshTokenExpired').get(function() {
  if (!this.tokens.refreshToken.expiresAt) return false;
  return this.tokens.refreshToken.expiresAt < new Date();
});

oauthProviderSchema.virtual('needsTokenRefresh').get(function() {
  if (!this.tokens.accessToken.expiresAt) return false;
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return this.tokens.accessToken.expiresAt < fiveMinutesFromNow;
});

oauthProviderSchema.virtual('connectionAge').get(function() {
  if (!this.status.connectedAt) return null;
  return Date.now() - this.status.connectedAt.getTime();
});

oauthProviderSchema.virtual('daysSinceLastUse').get(function() {
  if (!this.status.lastUsedAt) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - this.status.lastUsedAt.getTime()) / msPerDay);
});

// ==================== Pre-save Middleware ====================
oauthProviderSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive tokens before saving
    if (this.isModified('config.clientSecret') && this.config.clientSecret) {
      this.config.clientSecret = await encryptionService.encrypt(this.config.clientSecret);
    }

    if (this.isModified('tokens.accessToken.value') && this.tokens.accessToken.value) {
      this.tokens.accessToken.value = await encryptionService.encrypt(this.tokens.accessToken.value);
    }

    if (this.isModified('tokens.refreshToken.value') && this.tokens.refreshToken.value) {
      this.tokens.refreshToken.value = await encryptionService.encrypt(this.tokens.refreshToken.value);
    }

    if (this.isModified('tokens.idToken.value') && this.tokens.idToken.value) {
      this.tokens.idToken.value = await encryptionService.encrypt(this.tokens.idToken.value);
    }

    // Set connection timestamp on first activation
    if (this.isModified('status.state') && this.status.state === 'active' && !this.status.connectedAt) {
      this.status.connectedAt = new Date();
    }

    // Update last used timestamp
    if (this.isModified('analytics.totalLogins')) {
      this.status.lastUsedAt = new Date();
      this.analytics.lastLoginAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
oauthProviderSchema.methods.refreshAccessToken = async function() {
  if (!this.tokens.refreshToken.value || this.isRefreshTokenExpired) {
    throw new AppError('No valid refresh token available', 401, 'REFRESH_TOKEN_INVALID');
  }

  try {
    // This would integrate with the actual OAuth provider's token refresh endpoint
    // Placeholder for actual token refresh logic
    this.tokens.refreshCount += 1;
    this.tokens.lastRefreshed = new Date();
    
    await this.save();
    
    logger.info('OAuth token refreshed', {
      providerId: this._id,
      provider: this.provider.name,
      userId: this.userId
    });

    return this;
  } catch (error) {
    this.errors.lastError = {
      code: 'TOKEN_REFRESH_FAILED',
      message: error.message,
      occurredAt: new Date(),
      type: 'token_error'
    };
    
    await this.save();
    throw error;
  }
};

oauthProviderSchema.methods.revoke = async function(reason, revokedBy) {
  this.status.state = 'revoked';
  this.status.revokedAt = new Date();
  this.status.revokedBy = revokedBy;
  this.status.revokeReason = reason;

  // Clear sensitive tokens
  this.tokens.accessToken.value = undefined;
  this.tokens.refreshToken.value = undefined;
  this.tokens.idToken.value = undefined;

  await this.save();

  logger.info('OAuth provider revoked', {
    providerId: this._id,
    provider: this.provider.name,
    userId: this.userId,
    reason,
    revokedBy
  });

  return this;
};

oauthProviderSchema.methods.syncProfile = async function() {
  if (!this.isActive || this.isTokenExpired) {
    throw new AppError('Cannot sync - provider inactive or token expired', 400, 'SYNC_UNAVAILABLE');
  }

  try {
    // This would integrate with the actual provider's API to fetch updated profile data
    // Placeholder for actual profile sync logic
    
    this.sync.lastSync = {
      at: new Date(),
      status: 'success',
      itemsProcessed: 1
    };

    await this.save();

    logger.info('OAuth profile synced', {
      providerId: this._id,
      provider: this.provider.name,
      userId: this.userId
    });

    return this;
  } catch (error) {
    this.sync.lastSync = {
      at: new Date(),
      status: 'failed',
      errors: [{
        field: 'profile',
        message: error.message,
        code: error.code || 'SYNC_ERROR'
      }]
    };

    await this.save();
    throw error;
  }
};

oauthProviderSchema.methods.recordLogin = async function() {
  this.analytics.totalLogins += 1;
  this.analytics.lastLoginAt = new Date();
  this.status.lastUsedAt = new Date();
  this.analytics.failedAttempts.consecutiveFailures = 0;

  await this.save();
  return this;
};

oauthProviderSchema.methods.recordFailedAttempt = async function(error) {
  this.analytics.failedAttempts.count += 1;
  this.analytics.failedAttempts.consecutiveFailures += 1;
  this.analytics.failedAttempts.lastFailedAt = new Date();

  this.errors.lastError = {
    code: error.code || 'AUTH_FAILED',
    message: error.message,
    occurredAt: new Date(),
    type: 'auth_error'
  };

  await this.save();
  return this;
};

oauthProviderSchema.methods.getDecryptedTokens = async function() {
  const tokens = {};

  if (this.tokens.accessToken.value) {
    tokens.accessToken = await encryptionService.decrypt(this.tokens.accessToken.value);
  }

  if (this.tokens.refreshToken.value) {
    tokens.refreshToken = await encryptionService.decrypt(this.tokens.refreshToken.value);
  }

  if (this.tokens.idToken.value) {
    tokens.idToken = await encryptionService.decrypt(this.tokens.idToken.value);
  }

  return tokens;
};

// ==================== Static Methods ====================
oauthProviderSchema.statics.findByUser = async function(userId, providerName) {
  return await this.findOne({
    userId,
    'provider.name': providerName,
    'status.state': { $ne: 'revoked' }
  });
};

oauthProviderSchema.statics.findActiveProviders = async function(userId) {
  return await this.find({
    userId,
    'status.state': 'active'
  }).populate('userId', 'displayName email');
};

oauthProviderSchema.statics.findExpiredTokens = async function() {
  return await this.find({
    'status.state': 'active',
    'tokens.accessToken.expiresAt': { $lt: new Date() }
  });
};

oauthProviderSchema.statics.getProviderStats = async function(organizationId) {
  const stats = await this.aggregate([
    { $match: { organizationId: organizationId } },
    {
      $group: {
        _id: '$provider.name',
        totalConnections: { $sum: 1 },
        activeConnections: {
          $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
        },
        totalLogins: { $sum: '$analytics.totalLogins' },
        lastUsed: { $max: '$status.lastUsedAt' }
      }
    },
    { $sort: { totalConnections: -1 } }
  ]);

  return stats;
};

oauthProviderSchema.statics.cleanupExpiredProviders = async function() {
  const result = await this.updateMany(
    {
      'status.state': { $ne: 'revoked' },
      $or: [
        { 'tokens.refreshToken.expiresAt': { $lt: new Date() } },
        { 'status.lastUsedAt': { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } // 90 days
      ]
    },
    {
      'status.state': 'expired',
      'tokens.accessToken.value': null,
      'tokens.refreshToken.value': null,
      'tokens.idToken.value': null
    }
  );

  logger.info('OAuth provider cleanup completed', {
    expiredProviders: result.modifiedCount
  });

  return result;
};

// Create and export model
const OAuthProviderModel = BaseModel.createModel('OAuthProvider', oauthProviderSchema);

module.exports = {
  schema: oauthProviderSchema,
  model: OAuthProviderModel
};