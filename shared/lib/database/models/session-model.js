'use strict';

/**
 * @fileoverview Session model for user session management
 * @module shared/lib/database/models/session-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/crypto-utils
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const stringHelper = require('../../utils/helpers/string-helper');
const cryptoUtils = require('../../security/encryption/crypto-utils');

/**
 * Session schema definition
 */
const sessionSchemaDefinition = {
  // Session Identification
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  token: {
    type: String,
    required: true,
    unique: true,
    select: false
  },

  refreshToken: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },

  // User & Organization
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // Session Type
  type: {
    type: String,
    enum: ['web', 'mobile', 'api', 'oauth', 'service'],
    default: 'web',
    index: true
  },

  // Device Information
  device: {
    userAgent: String,
    browser: {
      name: String,
      version: String
    },
    os: {
      name: String,
      version: String
    },
    device: {
      type: String,
      vendor: String,
      model: String
    },
    fingerprint: String
  },

  // Location Information
  location: {
    ip: {
      type: String,
      index: true
    },
    country: String,
    region: String,
    city: String,
    postalCode: String,
    latitude: Number,
    longitude: Number,
    timezone: String,
    isp: String,
    vpn: Boolean,
    proxy: Boolean,
    tor: Boolean,
    hosting: Boolean
  },

  // Session Status
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked', 'locked'],
    default: 'active',
    index: true
  },

  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revokedReason: String,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  expiresAt: {
    type: Date,
    required: true,
    index: true
  },

  // Security
  security: {
    mfaVerified: {
      type: Boolean,
      default: false
    },
    mfaVerifiedAt: Date,
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    riskFactors: [String],
    suspicious: {
      type: Boolean,
      default: false
    },
    challengeRequired: {
      type: Boolean,
      default: false
    },
    challengeCompletedAt: Date
  },

  // OAuth Information (for OAuth sessions)
  oauth: {
    provider: String,
    accessToken: {
      type: String,
      select: false
    },
    refreshToken: {
      type: String,
      select: false
    },
    tokenExpiry: Date,
    scope: [String]
  },

  // API Key Information (for API sessions)
  apiKey: {
    keyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey'
    },
    name: String,
    permissions: [String]
  },

  // Activity Tracking
  activity: {
    requests: {
      type: Number,
      default: 0
    },
    lastRequestAt: Date,
    lastEndpoint: String,
    endpoints: [{
      path: String,
      method: String,
      timestamp: Date,
      responseTime: Number,
      statusCode: Number
    }]
  },

  // Session Data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Permissions Cache
  permissions: {
    roles: [String],
    resources: [{
      resource: String,
      actions: [String]
    }],
    cachedAt: Date
  },

  // Tags
  tags: [String]
};

// Create schema
const sessionSchema = BaseModel.createSchema(sessionSchemaDefinition, {
  collection: 'sessions',
  timestamps: false // We manage timestamps manually
});

// Indexes
sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ organizationId: 1, status: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ lastActivityAt: 1 });
sessionSchema.index({ 'location.ip': 1, userId: 1 });
sessionSchema.index({ type: 1, status: 1 });

// Virtual fields
sessionSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.expiresAt > new Date();
});

sessionSchema.virtual('isExpired').get(function() {
  return this.expiresAt <= new Date();
});

sessionSchema.virtual('duration').get(function() {
  return this.lastActivityAt - this.createdAt;
});

sessionSchema.virtual('remainingTime').get(function() {
  const remaining = this.expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
});

sessionSchema.virtual('inactivityPeriod').get(function() {
  return Date.now() - this.lastActivityAt;
});

// Pre-save middleware
sessionSchema.pre('save', async function(next) {
  try {
    // Generate session ID if not provided
    if (!this.sessionId && this.isNew) {
      this.sessionId = await this.constructor.generateSessionId();
    }

    // Generate tokens if not provided
    if (!this.token && this.isNew) {
      this.token = await this.constructor.generateToken();
    }

    // Set expiration based on type
    if (!this.expiresAt && this.isNew) {
      this.expiresAt = this.constructor.calculateExpiration(this.type);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
sessionSchema.methods.refresh = async function(extendBy) {
  const extension = extendBy || this.constructor.getSessionDuration(this.type);
  this.expiresAt = new Date(Date.now() + extension);
  
  // Generate new refresh token
  if (this.type === 'web' || this.type === 'mobile') {
    this.refreshToken = await this.constructor.generateToken();
  }

  await this.save();
  return this;
};

sessionSchema.methods.updateActivity = async function(endpoint, method) {
  this.lastActivityAt = new Date();
  this.activity.requests++;
  this.activity.lastRequestAt = new Date();
  
  if (endpoint) {
    this.activity.lastEndpoint = endpoint;
    
    // Keep only last 10 endpoint records
    if (!this.activity.endpoints) {
      this.activity.endpoints = [];
    }
    
    this.activity.endpoints.unshift({
      path: endpoint,
      method,
      timestamp: new Date()
    });
    
    if (this.activity.endpoints.length > 10) {
      this.activity.endpoints = this.activity.endpoints.slice(0, 10);
    }
  }

  // Don't wait for save to complete
  this.save().catch(err => {
    logger.error('Failed to update session activity', err);
  });
};

sessionSchema.methods.revoke = async function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revokedReason = reason || 'Manual revocation';
  
  await this.save();
  await this.audit('SESSION_REVOKED', { reason });
  
  return this;
};

sessionSchema.methods.lock = async function(reason) {
  this.status = 'locked';
  this.security.suspicious = true;
  this.security.riskFactors = this.security.riskFactors || [];
  this.security.riskFactors.push(reason);
  
  await this.save();
  await this.audit('SESSION_LOCKED', { reason });
  
  return this;
};

sessionSchema.methods.unlock = async function() {
  if (this.status === 'locked') {
    this.status = 'active';
    this.security.suspicious = false;
    this.security.challengeRequired = true;
    
    await this.save();
    await this.audit('SESSION_UNLOCKED');
  }
  
  return this;
};

sessionSchema.methods.verifyMFA = async function() {
  this.security.mfaVerified = true;
  this.security.mfaVerifiedAt = new Date();
  this.security.riskScore = Math.max(0, this.security.riskScore - 20);
  
  await this.save();
  return this;
};

sessionSchema.methods.completeChallenge = async function() {
  this.security.challengeRequired = false;
  this.security.challengeCompletedAt = new Date();
  this.security.riskScore = Math.max(0, this.security.riskScore - 10);
  
  await this.save();
  return this;
};

sessionSchema.methods.updateRiskScore = async function(factors = []) {
  let score = 0;
  const riskFactors = [];

  // Location-based risk
  if (this.location.vpn || this.location.proxy || this.location.tor) {
    score += 20;
    riskFactors.push('anonymous_connection');
  }

  // New device
  if (factors.includes('new_device')) {
    score += 15;
    riskFactors.push('new_device');
  }

  // Unusual location
  if (factors.includes('unusual_location')) {
    score += 25;
    riskFactors.push('unusual_location');
  }

  // Rapid requests
  if (this.activity.requests > 1000) {
    score += 10;
    riskFactors.push('high_activity');
  }

  // Time-based risk (odd hours)
  const hour = new Date().getHours();
  if (hour >= 2 && hour <= 5) {
    score += 5;
    riskFactors.push('odd_hours');
  }

  this.security.riskScore = Math.min(100, score);
  this.security.riskFactors = riskFactors;
  this.security.suspicious = score > 50;

  if (score > 75) {
    await this.lock('High risk score');
  }

  await this.save();
  return this.security;
};

sessionSchema.methods.cachePermissions = async function(roles, resources) {
  this.permissions = {
    roles: roles || [],
    resources: resources || [],
    cachedAt: new Date()
  };
  
  await this.save();
  return this;
};

sessionSchema.methods.getCachedPermissions = function() {
  if (!this.permissions.cachedAt) {
    return null;
  }

  // Cache expires after 5 minutes
  const cacheAge = Date.now() - this.permissions.cachedAt;
  if (cacheAge > 300000) {
    return null;
  }

  return this.permissions;
};

sessionSchema.methods.setData = async function(key, value) {
  if (!this.data) {
    this.data = {};
  }
  
  this.data[key] = value;
  this.markModified('data');
  
  await this.save();
  return this;
};

sessionSchema.methods.getData = function(key) {
  if (!this.data) {
    return null;
  }
  
  return key ? this.data[key] : this.data;
};

sessionSchema.methods.clearData = async function(key) {
  if (!this.data) {
    return this;
  }

  if (key) {
    delete this.data[key];
  } else {
    this.data = {};
  }
  
  this.markModified('data');
  await this.save();
  
  return this;
};

// Static methods
sessionSchema.statics.generateSessionId = async function() {
  return `sess_${Date.now()}_${stringHelper.generateRandomString(16)}`;
};

sessionSchema.statics.generateToken = async function() {
  return cryptoUtils.generateSecureToken(32);
};

sessionSchema.statics.hashToken = async function(token) {
  return cryptoUtils.hashString(token);
};

sessionSchema.statics.getSessionDuration = function(type) {
  const durations = {
    web: 24 * 60 * 60 * 1000, // 24 hours
    mobile: 30 * 24 * 60 * 60 * 1000, // 30 days
    api: 365 * 24 * 60 * 60 * 1000, // 1 year
    oauth: 60 * 60 * 1000, // 1 hour
    service: 365 * 24 * 60 * 60 * 1000 // 1 year
  };
  
  return durations[type] || durations.web;
};

sessionSchema.statics.calculateExpiration = function(type) {
  const duration = this.getSessionDuration(type);
  return new Date(Date.now() + duration);
};

sessionSchema.statics.createSession = async function(userData) {
  const {
    userId,
    organizationId,
    type = 'web',
    device,
    location,
    oauth,
    apiKey,
    data
  } = userData;

  const session = new this({
    userId,
    organizationId,
    type,
    device,
    location,
    oauth,
    apiKey,
    data
  });

  await session.save();
  
  // Cleanup old sessions for user
  await this.cleanupUserSessions(userId, type);
  
  return session;
};

sessionSchema.statics.findByToken = async function(token) {
  const hashedToken = await this.hashToken(token);
  
  return await this.findOne({
    token: hashedToken,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

sessionSchema.statics.findByRefreshToken = async function(refreshToken) {
  const hashedToken = await this.hashToken(refreshToken);
  
  return await this.findOne({
    refreshToken: hashedToken,
    status: 'active'
  });
};

sessionSchema.statics.findActiveByUser = async function(userId, type) {
  const query = {
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  };
  
  if (type) {
    query.type = type;
  }
  
  return await this.find(query).sort({ lastActivityAt: -1 });
};

sessionSchema.statics.findActiveByOrganization = async function(organizationId) {
  return await this.find({
    organizationId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ lastActivityAt: -1 });
};

sessionSchema.statics.revokeUserSessions = async function(userId, options = {}) {
  const {
    type,
    excludeSessionId,
    reason = 'Bulk revocation'
  } = options;

  const query = {
    userId,
    status: 'active'
  };
  
  if (type) {
    query.type = type;
  }
  
  if (excludeSessionId) {
    query.sessionId = { $ne: excludeSessionId };
  }

  const result = await this.updateMany(query, {
    status: 'revoked',
    revokedAt: new Date(),
    revokedReason: reason
  });

  logger.info('User sessions revoked', {
    userId,
    count: result.modifiedCount
  });

  return result;
};

sessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      status: 'expired'
    }
  );

  logger.info('Expired sessions cleaned up', {
    count: result.modifiedCount
  });

  return result;
};

sessionSchema.statics.cleanupUserSessions = async function(userId, type) {
  const maxSessions = {
    web: 5,
    mobile: 3,
    api: 10,
    oauth: 10,
    service: 5
  };

  const limit = maxSessions[type] || 5;

  // Get active sessions
  const sessions = await this.find({
    userId,
    type,
    status: 'active'
  }).sort({ lastActivityAt: -1 });

  // Revoke oldest sessions if exceeding limit
  if (sessions.length > limit) {
    const sessionsToRevoke = sessions.slice(limit);
    const sessionIds = sessionsToRevoke.map(s => s._id);

    await this.updateMany(
      { _id: { $in: sessionIds } },
      {
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: 'Session limit exceeded'
      }
    );

    logger.info('Excess sessions cleaned up', {
      userId,
      type,
      count: sessionsToRevoke.length
    });
  }
};

sessionSchema.statics.detectSuspiciousActivity = async function(userId, currentSession) {
  const recentSessions = await this.find({
    userId,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    _id: { $ne: currentSession._id }
  });

  const suspiciousFactors = [];

  // Multiple locations in short time
  const uniqueCountries = new Set(
    recentSessions.map(s => s.location.country).filter(Boolean)
  );
  
  if (uniqueCountries.size > 2) {
    suspiciousFactors.push('multiple_countries');
  }

  // Multiple device types
  const deviceTypes = new Set(
    recentSessions.map(s => s.device.device?.type).filter(Boolean)
  );
  
  if (deviceTypes.size > 3) {
    suspiciousFactors.push('multiple_devices');
  }

  // Rapid session creation
  if (recentSessions.length > 10) {
    suspiciousFactors.push('rapid_sessions');
  }

  return {
    suspicious: suspiciousFactors.length > 0,
    factors: suspiciousFactors,
    sessionCount: recentSessions.length
  };
};

sessionSchema.statics.getSessionStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.userId) {
    match.userId = filters.userId;
  }
  
  if (filters.organizationId) {
    match.organizationId = filters.organizationId;
  }
  
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) {
      match.createdAt.$gte = filters.startDate;
    }
    if (filters.endDate) {
      match.createdAt.$lte = filters.endDate;
    }
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
        expired: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
        },
        revoked: {
          $sum: { $cond: [{ $eq: ['$status', 'revoked'] }, 1, 0] }
        },
        avgDuration: { $avg: '$duration' },
        avgRequests: { $avg: '$activity.requests' },
        byType: {
          $push: '$type'
        },
        byDevice: {
          $push: '$device.device.type'
        },
        suspicious: {
          $sum: { $cond: ['$security.suspicious', 1, 0] }
        },
        mfaVerified: {
          $sum: { $cond: ['$security.mfaVerified', 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        active: 1,
        expired: 1,
        revoked: 1,
        avgDuration: { $round: ['$avgDuration', 2] },
        avgRequests: { $round: ['$avgRequests', 2] },
        suspicious: 1,
        mfaVerified: 1,
        activeRate: {
          $multiply: [{ $divide: ['$active', '$total'] }, 100]
        },
        mfaRate: {
          $multiply: [{ $divide: ['$mfaVerified', '$total'] }, 100]
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    active: 0,
    expired: 0,
    revoked: 0,
    avgDuration: 0,
    avgRequests: 0,
    suspicious: 0,
    mfaVerified: 0,
    activeRate: 0,
    mfaRate: 0
  };
};

// Create and export model
const SessionModel = BaseModel.createModel('Session', sessionSchema);

module.exports = {
  schema: sessionSchema,
  model: SessionModel
};