'use strict';

/**
 * @fileoverview Login history model for tracking user authentication events
 * @module shared/lib/database/models/users/login-history-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const dateHelper = require('../../../utils/helpers/date-helper');

/**
 * Login history schema definition
 */
const loginHistorySchemaDefinition = {
  // User reference
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

  // Login details
  loginType: {
    type: String,
    enum: ['password', 'oauth', 'api_key', 'sso', 'two_factor', 'passkey'],
    required: true,
    index: true
  },

  authProvider: {
    type: String,
    enum: ['local', 'google', 'github', 'linkedin', 'facebook', 'twitter', 'saml', 'oidc'],
    default: 'local'
  },

  loginStatus: {
    type: String,
    enum: ['success', 'failed', 'blocked', 'suspicious'],
    required: true,
    index: true
  },

  failureReason: {
    type: String,
    enum: [
      'invalid_credentials',
      'account_locked',
      'account_suspended',
      'invalid_2fa',
      'expired_token',
      'ip_blocked',
      'rate_limited',
      'suspicious_activity'
    ]
  },

  // Device and location information
  deviceInfo: {
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
      type: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'unknown']
      },
      vendor: String,
      model: String
    },
    fingerprint: {
      type: String,
      index: true
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
    proxyDetected: Boolean,
    vpnDetected: Boolean,
    torDetected: Boolean,
    threatLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }
  },

  // Geolocation
  location: {
    country: String,
    countryCode: String,
    region: String,
    city: String,
    postalCode: String,
    latitude: Number,
    longitude: Number,
    timezone: String,
    isp: String,
    organization: String
  },

  // Session information
  sessionId: {
    type: String,
    index: true
  },

  sessionDuration: Number, // in seconds

  // Security checks
  securityChecks: {
    captchaPassed: Boolean,
    emailVerified: Boolean,
    phoneVerified: Boolean,
    biometricUsed: Boolean,
    trustedDevice: Boolean,
    knownLocation: Boolean,
    riskScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },

  // Additional metadata
  metadata: {
    apiVersion: String,
    clientVersion: String,
    referrer: String,
    loginMethod: String, // 'web', 'mobile_app', 'api'
    customData: mongoose.Schema.Types.Mixed
  },

  // Timestamps
  loginAt: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  logoutAt: Date,

  expiresAt: {
    type: Date,
    index: true
  }
};

// Create schema
const loginHistorySchema = BaseModel.createSchema(loginHistorySchemaDefinition, {
  collection: 'login_history',
  timestamps: true
});

// Indexes
loginHistorySchema.index({ userId: 1, loginAt: -1 });
loginHistorySchema.index({ organizationId: 1, loginAt: -1 });
loginHistorySchema.index({ 'networkInfo.ipAddress': 1, loginAt: -1 });
loginHistorySchema.index({ loginStatus: 1, loginAt: -1 });
loginHistorySchema.index({ 'deviceInfo.fingerprint': 1, userId: 1 });
loginHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Virtual fields
loginHistorySchema.virtual('duration').get(function() {
  if (this.logoutAt && this.loginAt) {
    return Math.floor((this.logoutAt - this.loginAt) / 1000); // in seconds
  }
  return this.sessionDuration || null;
});

loginHistorySchema.virtual('isActive').get(function() {
  return this.loginStatus === 'success' && !this.logoutAt;
});

// Instance methods
loginHistorySchema.methods.markLogout = async function() {
  this.logoutAt = new Date();
  if (this.loginAt) {
    this.sessionDuration = Math.floor((this.logoutAt - this.loginAt) / 1000);
  }
  await this.save();
  return this;
};

loginHistorySchema.methods.updateSecurityCheck = async function(checkType, value) {
  if (!this.securityChecks) {
    this.securityChecks = {};
  }
  this.securityChecks[checkType] = value;
  await this.save();
  return this;
};

loginHistorySchema.methods.calculateRiskScore = function() {
  let riskScore = 0;

  // Network-based risks
  if (this.networkInfo.proxyDetected) riskScore += 20;
  if (this.networkInfo.vpnDetected) riskScore += 15;
  if (this.networkInfo.torDetected) riskScore += 30;

  // Location-based risks
  if (!this.securityChecks.knownLocation) riskScore += 10;

  // Device-based risks
  if (!this.securityChecks.trustedDevice) riskScore += 15;

  // Authentication method risks
  if (this.loginType === 'api_key') riskScore += 5;
  if (!this.securityChecks.emailVerified) riskScore += 10;

  // Failed attempts increase risk
  if (this.loginStatus === 'failed') riskScore += 20;
  if (this.loginStatus === 'suspicious') riskScore += 40;

  return Math.min(riskScore, 100);
};

// Static methods
loginHistorySchema.statics.recordLogin = async function(loginData) {
  const {
    userId,
    organizationId,
    tenantId,
    loginType,
    authProvider,
    success,
    failureReason,
    deviceInfo,
    networkInfo,
    location,
    sessionId,
    securityChecks,
    metadata
  } = loginData;

  const record = new this({
    userId,
    organizationId,
    tenantId,
    loginType,
    authProvider,
    loginStatus: success ? 'success' : 'failed',
    failureReason: success ? undefined : failureReason,
    deviceInfo,
    networkInfo,
    location,
    sessionId,
    securityChecks,
    metadata,
    loginAt: new Date()
  });

  // Calculate initial risk score
  if (record.securityChecks) {
    record.securityChecks.riskScore = record.calculateRiskScore();
  }

  await record.save();

  // Check for suspicious patterns
  await this.checkSuspiciousActivity(userId, record);

  return record;
};

loginHistorySchema.statics.checkSuspiciousActivity = async function(userId, currentLogin) {
  const recentLogins = await this.find({
    userId,
    loginAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
  }).sort({ loginAt: -1 }).limit(10);

  const suspiciousPatterns = [];

  // Check for rapid location changes
  const differentLocations = new Set(
    recentLogins
      .filter(login => login.location && login.location.country)
      .map(login => login.location.country)
  );

  if (differentLocations.size > 2) {
    suspiciousPatterns.push('multiple_locations');
  }

  // Check for multiple failed attempts
  const failedAttempts = recentLogins.filter(login => login.loginStatus === 'failed').length;
  if (failedAttempts > 3) {
    suspiciousPatterns.push('multiple_failures');
  }

  // Check for different devices
  const differentDevices = new Set(
    recentLogins
      .filter(login => login.deviceInfo && login.deviceInfo.fingerprint)
      .map(login => login.deviceInfo.fingerprint)
  );

  if (differentDevices.size > 3) {
    suspiciousPatterns.push('multiple_devices');
  }

  if (suspiciousPatterns.length > 0) {
    currentLogin.loginStatus = 'suspicious';
    currentLogin.metadata = {
      ...currentLogin.metadata,
      suspiciousPatterns
    };
    await currentLogin.save();

    logger.warn('Suspicious login activity detected', {
      userId,
      patterns: suspiciousPatterns,
      loginId: currentLogin._id
    });
  }

  return suspiciousPatterns;
};

loginHistorySchema.statics.getLoginStatistics = async function(userId, options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
    endDate = new Date(),
    groupBy = 'day'
  } = options;

  const dateFormat = {
    day: '%Y-%m-%d',
    week: '%Y-W%V',
    month: '%Y-%m'
  };

  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        loginAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: dateFormat[groupBy], date: '$loginAt' } },
          status: '$loginStatus'
        },
        count: { $sum: 1 },
        avgRiskScore: { $avg: '$securityChecks.riskScore' }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        total: { $sum: '$count' },
        successful: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'success'] }, '$count', 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'failed'] }, '$count', 0] }
        },
        suspicious: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'suspicious'] }, '$count', 0] }
        },
        avgRiskScore: { $avg: '$avgRiskScore' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return stats;
};

loginHistorySchema.statics.getDeviceStatistics = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        loginStatus: 'success'
      }
    },
    {
      $group: {
        _id: {
          type: '$deviceInfo.device.type',
          browser: '$deviceInfo.browser.name',
          os: '$deviceInfo.os.name'
        },
        count: { $sum: 1 },
        lastUsed: { $max: '$loginAt' },
        locations: { $addToSet: '$location.country' }
      }
    },
    {
      $project: {
        _id: 0,
        device: '$_id',
        loginCount: '$count',
        lastUsed: 1,
        locationCount: { $size: '$locations' }
      }
    },
    { $sort: { lastUsed: -1 } }
  ]);

  return stats;
};

loginHistorySchema.statics.getLocationStatistics = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        'location.country': { $exists: true }
      }
    },
    {
      $group: {
        _id: {
          country: '$location.country',
          city: '$location.city'
        },
        count: { $sum: 1 },
        lastAccess: { $max: '$loginAt' },
        successRate: {
          $avg: { $cond: [{ $eq: ['$loginStatus', 'success'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        location: '$_id',
        accessCount: '$count',
        lastAccess: 1,
        successRate: { $multiply: ['$successRate', 100] }
      }
    },
    { $sort: { accessCount: -1 } }
  ]);

  return stats;
};

loginHistorySchema.statics.detectAnomalies = async function(userId, currentLogin) {
  const userPattern = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        loginStatus: 'success',
        loginAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // 90 days
      }
    },
    {
      $group: {
        _id: null,
        commonLocations: { $addToSet: '$location.country' },
        commonDevices: { $addToSet: '$deviceInfo.fingerprint' },
        commonIPs: { $addToSet: '$networkInfo.ipAddress' },
        avgHour: { $avg: { $hour: '$loginAt' } }
      }
    }
  ]);

  if (!userPattern.length) {
    return { isAnomaly: false, reasons: [] };
  }

  const pattern = userPattern[0];
  const anomalies = [];

  // Check location anomaly
  if (currentLogin.location && 
      pattern.commonLocations && 
      !pattern.commonLocations.includes(currentLogin.location.country)) {
    anomalies.push('unusual_location');
  }

  // Check device anomaly
  if (currentLogin.deviceInfo && 
      pattern.commonDevices && 
      !pattern.commonDevices.includes(currentLogin.deviceInfo.fingerprint)) {
    anomalies.push('new_device');
  }

  // Check time anomaly
  const currentHour = new Date(currentLogin.loginAt).getHours();
  if (Math.abs(currentHour - pattern.avgHour) > 6) {
    anomalies.push('unusual_time');
  }

  return {
    isAnomaly: anomalies.length > 0,
    reasons: anomalies
  };
};

loginHistorySchema.statics.cleanupOldRecords = async function(retentionDays = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    loginAt: { $lt: cutoffDate }
  });

  logger.info('Cleaned up old login history records', {
    retentionDays,
    deletedCount: result.deletedCount
  });

  return result.deletedCount;
};

// Create and export model
const LoginHistoryModel = BaseModel.createModel('LoginHistory', loginHistorySchema);

module.exports = LoginHistoryModel;