'use strict';

/**
 * @fileoverview User session model for managing active user sessions
 * @module shared/lib/database/models/users/user-session-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/hash-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const stringHelper = require('../../../utils/helpers/string-helper');
const HashService = require('../../../security/encryption/hash-service');

/**
 * User session schema definition
 */
const userSessionSchemaDefinition = {
  // User and organization context
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

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  // Session identification
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  sessionToken: {
    type: String,
    required: true,
    select: false
  },

  refreshToken: {
    type: String,
    select: false
  },

  // Session type and authentication
  sessionType: {
    type: String,
    enum: ['web', 'mobile', 'api', 'desktop', 'cli'],
    default: 'web',
    index: true
  },

  authMethod: {
    type: String,
    enum: ['password', 'oauth', 'sso', 'api_key', 'biometric', 'passkey'],
    required: true
  },

  authProvider: {
    type: String,
    default: 'local'
  },

  // Session status
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked', 'idle', 'locked'],
    default: 'active',
    index: true
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Device and client information
  deviceInfo: {
    deviceId: {
      type: String,
      index: true
    },
    deviceName: String,
    deviceType: {
      type: String,
      enum: ['desktop', 'laptop', 'mobile', 'tablet', 'wearable', 'unknown']
    },
    platform: String,
    platformVersion: String,
    browser: String,
    browserVersion: String,
    userAgent: String,
    fingerprint: String,
    trusted: {
      type: Boolean,
      default: false
    }
  },

  // Network information
  networkInfo: {
    ipAddress: {
      type: String,
      required: true,
      index: true
    },
    ipVersion: {
      type: String,
      enum: ['IPv4', 'IPv6']
    },
    hostname: String,
    proxy: Boolean,
    vpn: Boolean
  },

  // Location information
  location: {
    country: String,
    countryCode: String,
    region: String,
    city: String,
    postalCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    timezone: String
  },

  // Session lifecycle
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },

  lastActivityAt: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  expiresAt: {
    type: Date,
    required: true,
    index: true
  },

  refreshExpiresAt: Date,

  terminatedAt: Date,

  terminationReason: {
    type: String,
    enum: ['logout', 'timeout', 'revoked', 'security', 'concurrent_limit', 'admin_action']
  },

  // Session settings
  settings: {
    keepAlive: {
      type: Boolean,
      default: false
    },
    idleTimeout: {
      type: Number, // in minutes
      default: 30
    },
    absoluteTimeout: {
      type: Number, // in minutes
      default: 480 // 8 hours
    },
    slidingExpiration: {
      type: Boolean,
      default: true
    },
    requireMfa: Boolean,
    mfaVerified: Boolean,
    mfaVerifiedAt: Date
  },

  // Security features
  security: {
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
    },
    anomalies: [{
      type: String,
      timestamp: Date,
      description: String
    }],
    challenges: [{
      type: {
        type: String,
        enum: ['captcha', 'mfa', 'security_question', 'email_verification']
      },
      issuedAt: Date,
      completedAt: Date,
      passed: Boolean
    }]
  },

  // Access control
  permissions: {
    grantedPermissions: [String],
    deniedPermissions: [String],
    temporaryPermissions: [{
      permission: String,
      grantedAt: Date,
      expiresAt: Date
    }]
  },

  // Activity tracking
  activityMetrics: {
    requestCount: {
      type: Number,
      default: 0
    },
    lastRequestAt: Date,
    totalDuration: {
      type: Number, // in seconds
      default: 0
    },
    pageViews: {
      type: Number,
      default: 0
    },
    apiCalls: {
      type: Number,
      default: 0
    }
  },

  // Session metadata
  metadata: {
    applicationVersion: String,
    sdkVersion: String,
    customData: mongoose.Schema.Types.Mixed
  },

  // Linked sessions (for multi-device scenarios)
  linkedSessions: [{
    sessionId: String,
    deviceName: String,
    linkedAt: Date
  }],

  // Parent session (for sub-sessions)
  parentSessionId: String
};

// Create schema
const userSessionSchema = BaseModel.createSchema(userSessionSchemaDefinition, {
  collection: 'user_sessions',
  timestamps: true
});

// Indexes
userSessionSchema.index({ userId: 1, status: 1 });
userSessionSchema.index({ userId: 1, deviceInfo.deviceId: 1 });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userSessionSchema.index({ lastActivityAt: 1, status: 1 });
userSessionSchema.index({ 'security.riskScore': -1, status: 1 });

// Virtual fields
userSessionSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date() || this.status === 'expired';
});

userSessionSchema.virtual('isIdle').get(function() {
  const idleTime = this.settings.idleTimeout * 60 * 1000; // Convert to milliseconds
  return new Date() - this.lastActivityAt > idleTime;
});

userSessionSchema.virtual('duration').get(function() {
  const endTime = this.terminatedAt || new Date();
  return Math.floor((endTime - this.createdAt) / 1000); // in seconds
});

userSessionSchema.virtual('remainingTime').get(function() {
  if (this.isExpired) return 0;
  return Math.max(0, Math.floor((this.expiresAt - new Date()) / 1000)); // in seconds
});

// Pre-save middleware
userSessionSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      // Generate session ID if not provided
      if (!this.sessionId) {
        this.sessionId = stringHelper.generateRandomString(32);
      }

      // Generate and hash tokens
      if (!this.sessionToken) {
        const token = stringHelper.generateRandomString(64);
        this.sessionToken = await HashService.hashToken(token);
      }

      // Set expiration times
      if (!this.expiresAt) {
        const sessionDuration = this.settings.absoluteTimeout * 60 * 1000;
        this.expiresAt = new Date(Date.now() + sessionDuration);
      }

      // Calculate initial risk score
      this.security.riskScore = this.calculateRiskScore();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSessionSchema.methods.calculateRiskScore = function() {
  let score = 0;

  // Network-based risks
  if (this.networkInfo.proxy) score += 15;
  if (this.networkInfo.vpn) score += 10;

  // New device risk
  if (!this.deviceInfo.trusted) score += 20;

  // Authentication method risk
  const lowRiskAuth = ['biometric', 'passkey'];
  const highRiskAuth = ['api_key'];
  
  if (highRiskAuth.includes(this.authMethod)) {
    score += 15;
  } else if (!lowRiskAuth.includes(this.authMethod)) {
    score += 5;
  }

  // MFA not verified
  if (this.settings.requireMfa && !this.settings.mfaVerified) {
    score += 25;
  }

  return Math.min(score, 100);
};

userSessionSchema.methods.updateActivity = async function(activityData = {}) {
  this.lastActivityAt = new Date();
  
  if (activityData.requestType === 'api') {
    this.activityMetrics.apiCalls += 1;
  } else {
    this.activityMetrics.pageViews += 1;
  }
  
  this.activityMetrics.requestCount += 1;
  this.activityMetrics.lastRequestAt = new Date();

  // Sliding expiration
  if (this.settings.slidingExpiration && this.status === 'active') {
    const sessionDuration = this.settings.absoluteTimeout * 60 * 1000;
    const newExpiry = new Date(Date.now() + sessionDuration);
    
    // Don't extend beyond absolute timeout
    const maxExpiry = new Date(this.createdAt.getTime() + sessionDuration);
    this.expiresAt = newExpiry > maxExpiry ? maxExpiry : newExpiry;
  }

  // Check for idle timeout
  if (this.isIdle) {
    this.status = 'idle';
  } else if (this.status === 'idle') {
    this.status = 'active';
  }

  await this.save();
  return this;
};

userSessionSchema.methods.refresh = async function(refreshToken) {
  if (!this.refreshToken) {
    throw new AppError('Session does not support refresh', 400, 'NO_REFRESH_TOKEN');
  }

  const hashedToken = await HashService.hashToken(refreshToken);
  if (hashedToken !== this.refreshToken) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (this.refreshExpiresAt && this.refreshExpiresAt < new Date()) {
    throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  // Generate new tokens
  const newSessionToken = stringHelper.generateRandomString(64);
  const newRefreshToken = stringHelper.generateRandomString(64);

  this.sessionToken = await HashService.hashToken(newSessionToken);
  this.refreshToken = await HashService.hashToken(newRefreshToken);

  // Extend session
  const sessionDuration = this.settings.absoluteTimeout * 60 * 1000;
  this.expiresAt = new Date(Date.now() + sessionDuration);
  this.refreshExpiresAt = new Date(Date.now() + (sessionDuration * 2));

  this.lastActivityAt = new Date();
  this.status = 'active';

  await this.save();

  return {
    sessionToken: newSessionToken,
    refreshToken: newRefreshToken,
    expiresAt: this.expiresAt
  };
};

userSessionSchema.methods.terminate = async function(reason = 'logout') {
  this.status = 'revoked';
  this.isActive = false;
  this.terminatedAt = new Date();
  this.terminationReason = reason;
  
  // Calculate total duration
  this.activityMetrics.totalDuration = this.duration;

  await this.save();

  logger.info('Session terminated', {
    sessionId: this.sessionId,
    userId: this.userId,
    reason,
    duration: this.duration
  });

  return this;
};

userSessionSchema.methods.verifyMfa = async function() {
  this.settings.mfaVerified = true;
  this.settings.mfaVerifiedAt = new Date();
  
  // Reduce risk score after MFA verification
  this.security.riskScore = Math.max(0, this.security.riskScore - 25);
  
  await this.save();
  return this;
};

userSessionSchema.methods.addSecurityChallenge = async function(challengeType) {
  if (!this.security.challenges) {
    this.security.challenges = [];
  }

  this.security.challenges.push({
    type: challengeType,
    issuedAt: new Date()
  });

  await this.save();
  return this;
};

userSessionSchema.methods.completeSecurityChallenge = async function(challengeType, passed) {
  const challenge = this.security.challenges.find(
    c => c.type === challengeType && !c.completedAt
  );

  if (challenge) {
    challenge.completedAt = new Date();
    challenge.passed = passed;

    if (passed) {
      // Reduce risk score on successful challenge
      this.security.riskScore = Math.max(0, this.security.riskScore - 10);
    } else {
      // Increase risk score on failed challenge
      this.security.riskScore = Math.min(100, this.security.riskScore + 15);
    }

    await this.save();
  }

  return this;
};

userSessionSchema.methods.grantTemporaryPermission = async function(permission, durationMinutes) {
  if (!this.permissions.temporaryPermissions) {
    this.permissions.temporaryPermissions = [];
  }

  this.permissions.temporaryPermissions.push({
    permission,
    grantedAt: new Date(),
    expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000)
  });

  await this.save();
  return this;
};

userSessionSchema.methods.linkSession = async function(otherSessionId, deviceName) {
  if (!this.linkedSessions) {
    this.linkedSessions = [];
  }

  const alreadyLinked = this.linkedSessions.some(s => s.sessionId === otherSessionId);
  
  if (!alreadyLinked) {
    this.linkedSessions.push({
      sessionId: otherSessionId,
      deviceName,
      linkedAt: new Date()
    });

    await this.save();
  }

  return this;
};

// Static methods
userSessionSchema.statics.createSession = async function(sessionData) {
  const session = new this(sessionData);
  await session.save();

  logger.info('Session created', {
    sessionId: session.sessionId,
    userId: session.userId,
    sessionType: session.sessionType,
    authMethod: session.authMethod
  });

  return session;
};

userSessionSchema.statics.findActiveSessionsByUser = async function(userId, options = {}) {
  const query = {
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  };

  if (options.deviceId) {
    query['deviceInfo.deviceId'] = options.deviceId;
  }

  if (options.sessionType) {
    query.sessionType = options.sessionType;
  }

  return await this.find(query).sort({ lastActivityAt: -1 });
};

userSessionSchema.statics.verifySession = async function(sessionId, sessionToken) {
  const session = await this.findOne({ sessionId })
    .select('+sessionToken');

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  if (session.isExpired) {
    throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
  }

  if (session.status !== 'active') {
    throw new AppError(`Session ${session.status}`, 401, 'SESSION_INACTIVE');
  }

  const hashedToken = await HashService.hashToken(sessionToken);
  if (hashedToken !== session.sessionToken) {
    throw new AppError('Invalid session token', 401, 'INVALID_SESSION_TOKEN');
  }

  return session;
};

userSessionSchema.statics.terminateUserSessions = async function(userId, options = {}) {
  const {
    reason = 'admin_action',
    excludeSessionId,
    deviceId,
    sessionType
  } = options;

  const query = { userId, status: 'active' };

  if (excludeSessionId) {
    query.sessionId = { $ne: excludeSessionId };
  }

  if (deviceId) {
    query['deviceInfo.deviceId'] = deviceId;
  }

  if (sessionType) {
    query.sessionType = sessionType;
  }

  const sessions = await this.find(query);
  let terminatedCount = 0;

  for (const session of sessions) {
    await session.terminate(reason);
    terminatedCount++;
  }

  logger.info('User sessions terminated', {
    userId,
    count: terminatedCount,
    reason
  });

  return terminatedCount;
};

userSessionSchema.statics.checkConcurrentSessions = async function(userId, deviceId) {
  const activeSessions = await this.countDocuments({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  const deviceSessions = await this.countDocuments({
    userId,
    'deviceInfo.deviceId': deviceId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  // Get user's session limits (would typically come from user settings)
  const maxConcurrentSessions = 5;
  const maxDeviceSessions = 2;

  return {
    totalActive: activeSessions,
    deviceActive: deviceSessions,
    canCreateNew: activeSessions < maxConcurrentSessions && deviceSessions < maxDeviceSessions,
    limits: {
      maxTotal: maxConcurrentSessions,
      maxPerDevice: maxDeviceSessions
    }
  };
};

userSessionSchema.statics.getSessionAnalytics = async function(userId, options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const analytics = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              avgDuration: { $avg: '$activityMetrics.totalDuration' },
              totalPageViews: { $sum: '$activityMetrics.pageViews' },
              totalApiCalls: { $sum: '$activityMetrics.apiCalls' },
              uniqueDevices: { $addToSet: '$deviceInfo.deviceId' },
              uniqueIPs: { $addToSet: '$networkInfo.ipAddress' }
            }
          },
          {
            $project: {
              _id: 0,
              totalSessions: 1,
              avgDuration: { $round: ['$avgDuration', 0] },
              totalPageViews: 1,
              totalApiCalls: 1,
              uniqueDeviceCount: { $size: '$uniqueDevices' },
              uniqueIPCount: { $size: '$uniqueIPs' }
            }
          }
        ],
        byDevice: [
          {
            $group: {
              _id: '$deviceInfo.deviceType',
              sessions: { $sum: 1 },
              avgDuration: { $avg: '$activityMetrics.totalDuration' }
            }
          },
          { $sort: { sessions: -1 } }
        ],
        byAuthMethod: [
          {
            $group: {
              _id: '$authMethod',
              sessions: { $sum: 1 },
              avgRiskScore: { $avg: '$security.riskScore' }
            }
          },
          { $sort: { sessions: -1 } }
        ],
        byLocation: [
          {
            $group: {
              _id: {
                country: '$location.country',
                city: '$location.city'
              },
              sessions: { $sum: 1 }
            }
          },
          { $sort: { sessions: -1 } },
          { $limit: 10 }
        ],
        securityEvents: [
          {
            $match: {
              $or: [
                { 'security.riskScore': { $gte: 50 } },
                { 'security.anomalies': { $exists: true, $ne: [] } }
              ]
            }
          },
          {
            $group: {
              _id: '$security.threatLevel',
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  return analytics[0];
};

userSessionSchema.statics.detectAnomalies = async function(session) {
  const anomalies = [];
  const userId = session.userId;

  // Check for unusual location
  const recentSessions = await this.find({
    userId,
    _id: { $ne: session._id },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
  }).limit(20);

  const knownCountries = new Set(
    recentSessions
      .filter(s => s.location && s.location.country)
      .map(s => s.location.country)
  );

  if (session.location && 
      session.location.country && 
      knownCountries.size > 0 && 
      !knownCountries.has(session.location.country)) {
    anomalies.push({
      type: 'unusual_location',
      timestamp: new Date(),
      description: `Login from new country: ${session.location.country}`
    });
  }

  // Check for unusual device
  const knownDevices = new Set(
    recentSessions
      .filter(s => s.deviceInfo && s.deviceInfo.fingerprint)
      .map(s => s.deviceInfo.fingerprint)
  );

  if (session.deviceInfo && 
      session.deviceInfo.fingerprint && 
      knownDevices.size > 0 && 
      !knownDevices.has(session.deviceInfo.fingerprint)) {
    anomalies.push({
      type: 'new_device',
      timestamp: new Date(),
      description: 'Login from unrecognized device'
    });
  }

  // Check for impossible travel
  const lastSession = recentSessions
    .filter(s => s.location && s.location.coordinates)
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (lastSession && session.location && session.location.coordinates) {
    const timeDiff = (session.createdAt - lastSession.createdAt) / 1000 / 60; // minutes
    const distance = this.calculateDistance(
      lastSession.location.coordinates,
      session.location.coordinates
    );

    const speed = distance / (timeDiff / 60); // km/h
    if (speed > 1000) { // Faster than commercial flight
      anomalies.push({
        type: 'impossible_travel',
        timestamp: new Date(),
        description: `Impossible travel detected: ${Math.round(distance)}km in ${Math.round(timeDiff)} minutes`
      });
    }
  }

  if (anomalies.length > 0) {
    session.security.anomalies.push(...anomalies);
    session.security.riskScore = Math.min(
      100,
      session.security.riskScore + (anomalies.length * 20)
    );

    if (session.security.riskScore >= 80) {
      session.security.threatLevel = 'high';
    } else if (session.security.riskScore >= 60) {
      session.security.threatLevel = 'medium';
    }

    await session.save();
  }

  return anomalies;
};

userSessionSchema.statics.calculateDistance = function(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const lat1 = coord1.latitude * Math.PI / 180;
  const lat2 = coord2.latitude * Math.PI / 180;
  const deltaLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const deltaLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
};

userSessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: {
        status: 'expired',
        isActive: false,
        terminatedAt: new Date(),
        terminationReason: 'timeout'
      }
    }
  );

  if (result.modifiedCount > 0) {
    logger.info('Expired sessions cleaned up', {
      count: result.modifiedCount
    });
  }

  return result.modifiedCount;
};

// Create and export model
const UserSessionModel = BaseModel.createModel('UserSession', userSessionSchema);

module.exports = {
  schema: userSessionSchema,
  model: UserSessionModel
};