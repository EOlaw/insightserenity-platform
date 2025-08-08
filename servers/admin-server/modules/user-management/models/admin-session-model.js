'use strict';

/**
 * @fileoverview Administrative session model for session management and tracking
 * @module servers/admin-server/modules/user-management/models/admin-session-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const HashService = require('../../../../../shared/lib/security/encryption/hash-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { STATUS_CODES } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * Administrative session schema for secure session management
 */
const adminSessionSchema = new mongoose.Schema({
  // ==================== Core Session Identity ====================
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `SESS-${Date.now()}-${Math.random().toString(36).substr(2, 15).toUpperCase()}`;
    },
    description: 'Unique session identifier'
  },
  
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Hashed session token for authentication'
  },
  
  refreshToken: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    description: 'Hashed refresh token for session renewal'
  },
  
  adminUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: true,
    index: true,
    description: 'Reference to the admin user'
  },
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    description: 'Reference to the core user'
  },
  
  // ==================== Session Configuration ====================
  sessionType: {
    type: String,
    enum: ['STANDARD', 'ELEVATED', 'EMERGENCY', 'IMPERSONATION', 'SERVICE', 'API', 'SSO'],
    default: 'STANDARD',
    required: true,
    description: 'Type of administrative session'
  },
  
  authenticationMethod: {
    type: String,
    enum: ['PASSWORD', 'MFA', 'SSO', 'CERTIFICATE', 'BIOMETRIC', 'PASSKEY', 'API_KEY'],
    required: true,
    description: 'Method used for authentication'
  },
  
  mfaVerified: {
    type: Boolean,
    default: false,
    description: 'Whether MFA was verified for this session'
  },
  
  mfaMethod: {
    type: String,
    enum: ['TOTP', 'SMS', 'EMAIL', 'HARDWARE_TOKEN', 'BIOMETRIC', 'PUSH_NOTIFICATION'],
    description: 'MFA method used if verified'
  },
  
  elevatedPrivileges: {
    enabled: {
      type: Boolean,
      default: false,
      description: 'Whether session has elevated privileges'
    },
    grantedAt: Date,
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    expiresAt: Date,
    reason: String,
    approvalTicket: String
  },
  
  impersonation: {
    isImpersonating: {
      type: Boolean,
      default: false
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    originalAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    reason: String,
    startedAt: Date,
    maxDuration: Number, // milliseconds
    restrictions: [String]
  },
  
  // ==================== Session Lifecycle ====================
  lifecycle: {
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    
    lastActivityAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    
    lastRefreshedAt: Date,
    
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    
    absoluteExpiryAt: {
      type: Date,
      required: true,
      index: true,
      description: 'Absolute expiry regardless of activity'
    },
    
    terminatedAt: Date,
    
    terminationReason: {
      type: String,
      enum: ['LOGOUT', 'TIMEOUT', 'FORCED', 'EXPIRED', 'SECURITY', 'ERROR', 'MAINTENANCE']
    },
    
    terminatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    }
  },
  
  // ==================== Session Context ====================
  context: {
    ipAddress: {
      type: String,
      required: true,
      validate: {
        validator: CommonValidator.isValidIP,
        message: 'Invalid IP address format'
      },
      index: true
    },
    
    userAgent: {
      type: String,
      required: true
    },
    
    deviceInfo: {
      deviceId: String,
      deviceType: {
        type: String,
        enum: ['DESKTOP', 'LAPTOP', 'TABLET', 'MOBILE', 'API', 'UNKNOWN']
      },
      deviceName: String,
      platform: String,
      os: String,
      osVersion: String,
      browser: String,
      browserVersion: String,
      fingerprint: String,
      trusted: {
        type: Boolean,
        default: false
      }
    },
    
    location: {
      country: String,
      countryCode: {
        type: String,
        uppercase: true,
        minlength: 2,
        maxlength: 2
      },
      region: String,
      city: String,
      postalCode: String,
      timezone: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
      },
      isp: String,
      org: String,
      asn: String
    },
    
    network: {
      connectionType: {
        type: String,
        enum: ['CORPORATE', 'VPN', 'PUBLIC', 'HOME', 'MOBILE', 'UNKNOWN']
      },
      vpnDetected: {
        type: Boolean,
        default: false
      },
      proxyDetected: {
        type: Boolean,
        default: false
      },
      torDetected: {
        type: Boolean,
        default: false
      },
      threatLevel: {
        type: String,
        enum: ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'SAFE'
      }
    }
  },
  
  // ==================== Session Security ====================
  security: {
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      description: 'Calculated risk score for the session'
    },
    
    riskFactors: [{
      factor: String,
      score: Number,
      severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      },
      detectedAt: Date
    }],
    
    anomalies: [{
      type: {
        type: String,
        enum: ['LOCATION', 'TIME', 'BEHAVIOR', 'DEVICE', 'NETWORK', 'USAGE']
      },
      description: String,
      severity: {
        type: String,
        enum: ['INFO', 'WARNING', 'ALERT', 'CRITICAL']
      },
      detectedAt: {
        type: Date,
        default: Date.now
      },
      resolved: {
        type: Boolean,
        default: false
      },
      resolvedAt: Date,
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    verificationChallenges: [{
      challengeType: {
        type: String,
        enum: ['CAPTCHA', 'MFA', 'SECURITY_QUESTION', 'EMAIL_VERIFICATION', 'SMS_VERIFICATION']
      },
      issuedAt: {
        type: Date,
        default: Date.now
      },
      completedAt: Date,
      success: Boolean,
      attempts: {
        type: Number,
        default: 0
      },
      maxAttempts: {
        type: Number,
        default: 3
      }
    }],
    
    securityEvents: [{
      eventType: {
        type: String,
        enum: ['LOGIN', 'LOGOUT', 'PRIVILEGE_ELEVATION', 'SUSPICIOUS_ACTIVITY', 
               'FAILED_VERIFICATION', 'PERMISSION_DENIED', 'DATA_ACCESS', 'CONFIGURATION_CHANGE']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      details: mongoose.Schema.Types.Mixed,
      severity: {
        type: String,
        enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL']
      },
      handled: {
        type: Boolean,
        default: false
      }
    }],
    
    encryptionKey: {
      type: String,
      description: 'Encrypted session encryption key'
    },
    
    integrityHash: {
      type: String,
      description: 'Hash for session data integrity verification'
    }
  },
  
  // ==================== Session Permissions & Restrictions ====================
  permissions: {
    grantedPermissions: [{
      permissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserPermission'
      },
      permissionCode: String,
      scope: {
        type: String,
        enum: ['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PROJECT', 'PERSONAL']
      },
      grantedAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: Date
    }],
    
    deniedPermissions: [{
      permissionCode: String,
      reason: String,
      deniedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    temporaryPermissions: [{
      permissionCode: String,
      grantedFor: String,
      grantedAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        required: true
      },
      reason: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    restrictions: {
      readOnly: {
        type: Boolean,
        default: false
      },
      allowedResources: [String],
      deniedResources: [String],
      allowedActions: [{
        type: String,
        enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE', 'EXPORT', 'IMPORT']
      }],
      deniedActions: [{
        type: String,
        enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE', 'EXPORT', 'IMPORT']
      }],
      dataFilters: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
      }],
      maxRecordsPerQuery: Number,
      maxQueriesPerMinute: Number
    }
  },
  
  // ==================== Session Activity Tracking ====================
  activity: {
    pageViews: [{
      path: String,
      title: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      duration: Number, // milliseconds
      referrer: String
    }],
    
    apiCalls: [{
      method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
      },
      endpoint: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      responseTime: Number, // milliseconds
      statusCode: Number,
      bytesTransferred: Number,
      error: String
    }],
    
    dataAccess: [{
      resourceType: String,
      resourceId: String,
      action: {
        type: String,
        enum: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      recordCount: Number,
      fields: [String],
      filters: mongoose.Schema.Types.Mixed,
      success: Boolean
    }],
    
    commands: [{
      command: String,
      parameters: mongoose.Schema.Types.Mixed,
      timestamp: {
        type: Date,
        default: Date.now
      },
      executionTime: Number,
      result: {
        success: Boolean,
        output: mongoose.Schema.Types.Mixed,
        error: String
      }
    }],
    
    searches: [{
      query: String,
      filters: mongoose.Schema.Types.Mixed,
      timestamp: {
        type: Date,
        default: Date.now
      },
      resultCount: Number,
      clickedResults: [String]
    }],
    
    exports: [{
      dataType: String,
      format: {
        type: String,
        enum: ['CSV', 'EXCEL', 'JSON', 'XML', 'PDF']
      },
      recordCount: Number,
      fileSize: Number,
      timestamp: {
        type: Date,
        default: Date.now
      },
      destination: String,
      success: Boolean
    }]
  },
  
  // ==================== Session Metrics ====================
  metrics: {
    duration: {
      total: {
        type: Number,
        default: 0,
        description: 'Total session duration in milliseconds'
      },
      active: {
        type: Number,
        default: 0,
        description: 'Active time in milliseconds'
      },
      idle: {
        type: Number,
        default: 0,
        description: 'Idle time in milliseconds'
      }
    },
    
    interactions: {
      totalRequests: {
        type: Number,
        default: 0
      },
      successfulRequests: {
        type: Number,
        default: 0
      },
      failedRequests: {
        type: Number,
        default: 0
      },
      averageResponseTime: Number,
      totalDataTransferred: Number
    },
    
    resources: {
      cpuUsage: Number,
      memoryUsage: Number,
      bandwidthUsage: Number,
      storageUsage: Number
    },
    
    performance: {
      loadTime: Number,
      renderTime: Number,
      apiLatency: Number,
      databaseQueries: Number,
      cacheHits: Number,
      cacheMisses: Number
    }
  },
  
  // ==================== Session State Management ====================
  state: {
    status: {
      type: String,
      enum: ['ACTIVE', 'IDLE', 'LOCKED', 'SUSPENDED', 'EXPIRED', 'TERMINATED'],
      default: 'ACTIVE',
      required: true,
      index: true
    },
    
    lockReason: String,
    lockedAt: Date,
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    unlockAttempts: {
      type: Number,
      default: 0
    },
    
    suspensionReason: String,
    suspendedAt: Date,
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    suspendedUntil: Date,
    
    lastHeartbeat: {
      type: Date,
      default: Date.now
    },
    
    clientState: {
      activeTab: {
        type: Boolean,
        default: true
      },
      windowFocused: {
        type: Boolean,
        default: true
      },
      screenLocked: {
        type: Boolean,
        default: false
      },
      connectionStatus: {
        type: String,
        enum: ['ONLINE', 'OFFLINE', 'UNSTABLE'],
        default: 'ONLINE'
      }
    },
    
    sessionData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      description: 'Custom session data storage'
    },
    
    flags: {
      requiresReauth: {
        type: Boolean,
        default: false
      },
      pendingMfa: {
        type: Boolean,
        default: false
      },
      underReview: {
        type: Boolean,
        default: false
      },
      compromised: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // ==================== Compliance & Audit ====================
  compliance: {
    consentGiven: {
      type: Boolean,
      default: false
    },
    consentTimestamp: Date,
    consentVersion: String,
    
    dataProcessingAgreement: {
      accepted: Boolean,
      version: String,
      acceptedAt: Date
    },
    
    regulatoryRequirements: [{
      regulation: {
        type: String,
        enum: ['GDPR', 'CCPA', 'HIPAA', 'SOX', 'PCI_DSS']
      },
      compliant: Boolean,
      validatedAt: Date,
      notes: String
    }],
    
    auditTrail: [{
      action: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      details: mongoose.Schema.Types.Mixed,
      ipAddress: String,
      result: {
        success: Boolean,
        error: String
      }
    }],
    
    dataRetention: {
      retainUntil: Date,
      retentionReason: String,
      legalHold: {
        type: Boolean,
        default: false
      },
      legalHoldReason: String
    }
  },
  
  // ==================== Notification Settings ====================
  notifications: {
    channels: [{
      type: {
        type: String,
        enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP', 'SLACK', 'TEAMS'],
        required: true
      },
      enabled: {
        type: Boolean,
        default: true
      },
      endpoint: String,
      verified: {
        type: Boolean,
        default: false
      }
    }],
    
    preferences: {
      sessionAlerts: {
        type: Boolean,
        default: true
      },
      securityAlerts: {
        type: Boolean,
        default: true
      },
      activitySummary: {
        type: Boolean,
        default: false
      },
      frequency: {
        type: String,
        enum: ['IMMEDIATE', 'HOURLY', 'DAILY', 'WEEKLY'],
        default: 'IMMEDIATE'
      }
    },
    
    sentNotifications: [{
      type: String,
      subject: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      channel: String,
      success: Boolean,
      error: String
    }]
  }
}, {
  timestamps: true,
  collection: 'admin_sessions',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes for Performance ====================
adminSessionSchema.index({ sessionToken: 1 }, { unique: true });
adminSessionSchema.index({ refreshToken: 1 }, { sparse: true });
adminSessionSchema.index({ adminUserId: 1, 'state.status': 1 });
adminSessionSchema.index({ 'lifecycle.expiresAt': 1 });
adminSessionSchema.index({ 'lifecycle.lastActivityAt': -1 });
adminSessionSchema.index({ 'context.ipAddress': 1, adminUserId: 1 });
adminSessionSchema.index({ 'state.status': 1, 'lifecycle.createdAt': -1 });
adminSessionSchema.index({ 'security.riskScore': -1 });
adminSessionSchema.index({ 'impersonation.isImpersonating': 1, 'impersonation.targetUserId': 1 });

// ==================== Virtual Properties ====================
adminSessionSchema.virtual('isActive').get(function() {
  return this.state.status === 'ACTIVE' && 
         this.lifecycle.expiresAt > new Date() &&
         !this.state.flags.compromised;
});

adminSessionSchema.virtual('isExpired').get(function() {
  return this.lifecycle.expiresAt <= new Date() ||
         this.lifecycle.absoluteExpiryAt <= new Date();
});

adminSessionSchema.virtual('requiresRefresh').get(function() {
  const refreshThreshold = new Date(Date.now() + (5 * 60 * 1000)); // 5 minutes
  return this.lifecycle.expiresAt <= refreshThreshold;
});

adminSessionSchema.virtual('isHighRisk').get(function() {
  return this.security.riskScore >= 70 ||
         this.security.anomalies.some(a => a.severity === 'CRITICAL' && !a.resolved);
});

adminSessionSchema.virtual('sessionAge').get(function() {
  return Date.now() - this.lifecycle.createdAt.getTime();
});

adminSessionSchema.virtual('idleTime').get(function() {
  return Date.now() - this.lifecycle.lastActivityAt.getTime();
});

// ==================== Pre-Save Middleware ====================
adminSessionSchema.pre('save', async function(next) {
  try {
    // Hash tokens if new
    if (this.isNew) {
      if (this.sessionToken && !this.sessionToken.startsWith('$2')) {
        this.sessionToken = await HashService.hash(this.sessionToken);
      }
      
      if (this.refreshToken && !this.refreshToken.startsWith('$2')) {
        this.refreshToken = await HashService.hash(this.refreshToken);
      }
      
      // Set expiry times if not set
      if (!this.lifecycle.expiresAt) {
        const sessionDuration = this.sessionType === 'ELEVATED' ? 30 * 60 * 1000 : 60 * 60 * 1000;
        this.lifecycle.expiresAt = new Date(Date.now() + sessionDuration);
      }
      
      if (!this.lifecycle.absoluteExpiryAt) {
        const absoluteDuration = 24 * 60 * 60 * 1000; // 24 hours
        this.lifecycle.absoluteExpiryAt = new Date(Date.now() + absoluteDuration);
      }
    }
    
    // Update metrics
    if (this.isModified('lifecycle.lastActivityAt')) {
      this.updateMetrics();
    }
    
    // Calculate risk score
    if (this.isModified('security.riskFactors')) {
      this.calculateRiskScore();
    }
    
    // Check for expired elevated privileges
    if (this.elevatedPrivileges?.enabled && this.elevatedPrivileges.expiresAt) {
      if (this.elevatedPrivileges.expiresAt <= new Date()) {
        this.elevatedPrivileges.enabled = false;
      }
    }
    
    // Update session integrity hash
    this.updateIntegrityHash();
    
    next();
  } catch (error) {
    logger.error('Pre-save error in AdminSession model:', error);
    next(error);
  }
});

// ==================== Instance Methods ====================
adminSessionSchema.methods.validateToken = async function(token) {
  try {
    return await HashService.compare(token, this.sessionToken);
  } catch (error) {
    logger.error('Error validating session token:', error);
    return false;
  }
};

adminSessionSchema.methods.validateRefreshToken = async function(token) {
  try {
    if (!this.refreshToken) {
      return false;
    }
    return await HashService.compare(token, this.refreshToken);
  } catch (error) {
    logger.error('Error validating refresh token:', error);
    return false;
  }
};

adminSessionSchema.methods.refresh = async function(newExpiryMinutes = 60) {
  try {
    const now = new Date();
    
    // Check if session can be refreshed
    if (this.lifecycle.absoluteExpiryAt <= now) {
      throw new AppError('Session has reached absolute expiry', 401);
    }
    
    if (this.state.status !== 'ACTIVE' && this.state.status !== 'IDLE') {
      throw new AppError('Session cannot be refreshed in current state', 401);
    }
    
    // Generate new tokens
    const newSessionToken = stringHelper.generateRandomString(64);
    const newRefreshToken = stringHelper.generateRandomString(64);
    
    // Update session
    this.sessionToken = await HashService.hash(newSessionToken);
    this.refreshToken = await HashService.hash(newRefreshToken);
    this.lifecycle.lastRefreshedAt = now;
    this.lifecycle.expiresAt = new Date(now.getTime() + (newExpiryMinutes * 60 * 1000));
    
    // Ensure expiry doesn't exceed absolute expiry
    if (this.lifecycle.expiresAt > this.lifecycle.absoluteExpiryAt) {
      this.lifecycle.expiresAt = this.lifecycle.absoluteExpiryAt;
    }
    
    await this.save();
    
    logger.info(`Session ${this.sessionId} refreshed`);
    
    return {
      sessionToken: newSessionToken,
      refreshToken: newRefreshToken,
      expiresAt: this.lifecycle.expiresAt
    };
  } catch (error) {
    logger.error('Error refreshing session:', error);
    throw error;
  }
};

adminSessionSchema.methods.updateActivity = async function(activityData = {}) {
  try {
    this.lifecycle.lastActivityAt = new Date();
    
    // Update state if idle
    if (this.state.status === 'IDLE') {
      this.state.status = 'ACTIVE';
    }
    
    // Record activity based on type
    if (activityData.type === 'PAGE_VIEW' && activityData.pageView) {
      this.activity.pageViews.push(activityData.pageView);
      
      // Keep only last 100 page views
      if (this.activity.pageViews.length > 100) {
        this.activity.pageViews = this.activity.pageViews.slice(-100);
      }
    }
    
    if (activityData.type === 'API_CALL' && activityData.apiCall) {
      this.activity.apiCalls.push(activityData.apiCall);
      this.metrics.interactions.totalRequests += 1;
      
      if (activityData.apiCall.statusCode < 400) {
        this.metrics.interactions.successfulRequests += 1;
      } else {
        this.metrics.interactions.failedRequests += 1;
      }
      
      // Keep only last 500 API calls
      if (this.activity.apiCalls.length > 500) {
        this.activity.apiCalls = this.activity.apiCalls.slice(-500);
      }
    }
    
    if (activityData.type === 'DATA_ACCESS' && activityData.dataAccess) {
      this.activity.dataAccess.push(activityData.dataAccess);
      
      // Keep only last 200 data access records
      if (this.activity.dataAccess.length > 200) {
        this.activity.dataAccess = this.activity.dataAccess.slice(-200);
      }
    }
    
    // Update heartbeat
    this.state.lastHeartbeat = new Date();
    
    await this.save();
    
    return this;
  } catch (error) {
    logger.error('Error updating session activity:', error);
    throw error;
  }
};

adminSessionSchema.methods.updateMetrics = function() {
  const now = Date.now();
  const sessionAge = now - this.lifecycle.createdAt.getTime();
  const idleTime = now - this.lifecycle.lastActivityAt.getTime();
  
  this.metrics.duration.total = sessionAge;
  this.metrics.duration.idle = idleTime;
  this.metrics.duration.active = sessionAge - idleTime;
  
  // Calculate average response time
  if (this.activity.apiCalls.length > 0) {
    const totalResponseTime = this.activity.apiCalls.reduce(
      (sum, call) => sum + (call.responseTime || 0), 0
    );
    this.metrics.interactions.averageResponseTime = 
      Math.round(totalResponseTime / this.activity.apiCalls.length);
  }
};

adminSessionSchema.methods.calculateRiskScore = function() {
  let totalScore = 0;
  let factorCount = 0;
  
  // Calculate score from risk factors
  for (const factor of this.security.riskFactors) {
    totalScore += factor.score || 0;
    factorCount++;
  }
  
  // Add score for anomalies
  for (const anomaly of this.security.anomalies) {
    if (!anomaly.resolved) {
      switch (anomaly.severity) {
        case 'INFO':
          totalScore += 5;
          break;
        case 'WARNING':
          totalScore += 15;
          break;
        case 'ALERT':
          totalScore += 30;
          break;
        case 'CRITICAL':
          totalScore += 50;
          break;
      }
      factorCount++;
    }
  }
  
  // Add score for network threats
  if (this.context.network) {
    switch (this.context.network.threatLevel) {
      case 'LOW':
        totalScore += 10;
        break;
      case 'MEDIUM':
        totalScore += 25;
        break;
      case 'HIGH':
        totalScore += 40;
        break;
      case 'CRITICAL':
        totalScore += 60;
        break;
    }
    
    if (this.context.network.vpnDetected) totalScore += 10;
    if (this.context.network.proxyDetected) totalScore += 15;
    if (this.context.network.torDetected) totalScore += 30;
  }
  
  // Calculate average and cap at 100
  this.security.riskScore = factorCount > 0 
    ? Math.min(100, Math.round(totalScore / Math.max(1, factorCount)))
    : 0;
};

adminSessionSchema.methods.updateIntegrityHash = function() {
  const dataToHash = {
    sessionId: this.sessionId,
    adminUserId: this.adminUserId,
    ipAddress: this.context.ipAddress,
    userAgent: this.context.userAgent,
    createdAt: this.lifecycle.createdAt
  };
  
  this.security.integrityHash = HashService.generateHash(JSON.stringify(dataToHash));
};

adminSessionSchema.methods.addSecurityEvent = async function(eventData) {
  try {
    this.security.securityEvents.push({
      eventType: eventData.type,
      timestamp: new Date(),
      details: eventData.details,
      severity: eventData.severity || 'INFO',
      handled: eventData.handled || false
    });
    
    // Keep only last 100 security events
    if (this.security.securityEvents.length > 100) {
      this.security.securityEvents = this.security.securityEvents.slice(-100);
    }
    
    // Update risk score if high severity
    if (eventData.severity === 'ERROR' || eventData.severity === 'CRITICAL') {
      this.security.riskFactors.push({
        factor: eventData.type,
        score: eventData.severity === 'CRITICAL' ? 50 : 25,
        severity: eventData.severity,
        detectedAt: new Date()
      });
      
      this.calculateRiskScore();
    }
    
    await this.save();
    
    return this;
  } catch (error) {
    logger.error('Error adding security event:', error);
    throw error;
  }
};

adminSessionSchema.methods.detectAnomaly = async function(anomalyData) {
  try {
    this.security.anomalies.push({
      type: anomalyData.type,
      description: anomalyData.description,
      severity: anomalyData.severity || 'WARNING',
      detectedAt: new Date(),
      resolved: false
    });
    
    // Recalculate risk score
    this.calculateRiskScore();
    
    // Auto-lock session for critical anomalies
    if (anomalyData.severity === 'CRITICAL') {
      await this.lock('Critical security anomaly detected');
    }
    
    await this.save();
    
    logger.warn(`Anomaly detected in session ${this.sessionId}: ${anomalyData.description}`);
    
    return this;
  } catch (error) {
    logger.error('Error detecting anomaly:', error);
    throw error;
  }
};

adminSessionSchema.methods.elevatePrivileges = async function(elevationData) {
  try {
    if (this.elevatedPrivileges.enabled) {
      throw new AppError('Session already has elevated privileges', 400);
    }
    
    this.elevatedPrivileges = {
      enabled: true,
      grantedAt: new Date(),
      grantedBy: elevationData.grantedBy,
      expiresAt: elevationData.expiresAt || new Date(Date.now() + (15 * 60 * 1000)), // 15 minutes default
      reason: elevationData.reason,
      approvalTicket: elevationData.approvalTicket
    };
    
    // Add security event
    await this.addSecurityEvent({
      type: 'PRIVILEGE_ELEVATION',
      details: { reason: elevationData.reason },
      severity: 'WARNING'
    });
    
    await this.save();
    
    logger.info(`Privileges elevated for session ${this.sessionId}`);
    
    return this;
  } catch (error) {
    logger.error('Error elevating privileges:', error);
    throw error;
  }
};

adminSessionSchema.methods.startImpersonation = async function(impersonationData) {
  try {
    if (this.impersonation.isImpersonating) {
      throw new AppError('Session is already impersonating', 400);
    }
    
    this.impersonation = {
      isImpersonating: true,
      targetUserId: impersonationData.targetUserId,
      originalAdminId: this.adminUserId,
      reason: impersonationData.reason,
      startedAt: new Date(),
      maxDuration: impersonationData.maxDuration || (60 * 60 * 1000), // 1 hour default
      restrictions: impersonationData.restrictions || []
    };
    
    // Add security event
    await this.addSecurityEvent({
      type: 'IMPERSONATION_START',
      details: { 
        targetUserId: impersonationData.targetUserId,
        reason: impersonationData.reason 
      },
      severity: 'WARNING'
    });
    
    await this.save();
    
    logger.info(`Impersonation started in session ${this.sessionId}`);
    
    return this;
  } catch (error) {
    logger.error('Error starting impersonation:', error);
    throw error;
  }
};

adminSessionSchema.methods.endImpersonation = async function() {
  try {
    if (!this.impersonation.isImpersonating) {
      throw new AppError('Session is not impersonating', 400);
    }
    
    const impersonationDuration = Date.now() - this.impersonation.startedAt.getTime();
    
    // Add security event
    await this.addSecurityEvent({
      type: 'IMPERSONATION_END',
      details: { 
        duration: impersonationDuration,
        targetUserId: this.impersonation.targetUserId 
      },
      severity: 'INFO'
    });
    
    // Reset impersonation
    this.impersonation = {
      isImpersonating: false,
      targetUserId: null,
      originalAdminId: null,
      reason: null,
      startedAt: null,
      maxDuration: null,
      restrictions: []
    };
    
    await this.save();
    
    logger.info(`Impersonation ended in session ${this.sessionId}`);
    
    return this;
  } catch (error) {
    logger.error('Error ending impersonation:', error);
    throw error;
  }
};

adminSessionSchema.methods.lock = async function(reason) {
  try {
    this.state.status = 'LOCKED';
    this.state.lockReason = reason;
    this.state.lockedAt = new Date();
    
    await this.save();
    
    logger.info(`Session ${this.sessionId} locked: ${reason}`);
    
    return this;
  } catch (error) {
    logger.error('Error locking session:', error);
    throw error;
  }
};

adminSessionSchema.methods.unlock = async function(unlockedBy) {
  try {
    if (this.state.status !== 'LOCKED') {
      throw new AppError('Session is not locked', 400);
    }
    
    this.state.status = 'ACTIVE';
    this.state.lockReason = null;
    this.state.lockedAt = null;
    this.state.unlockAttempts = 0;
    
    // Add audit entry
    this.compliance.auditTrail.push({
      action: 'SESSION_UNLOCKED',
      performedBy: unlockedBy,
      details: { previousLockReason: this.state.lockReason },
      result: { success: true }
    });
    
    await this.save();
    
    logger.info(`Session ${this.sessionId} unlocked`);
    
    return this;
  } catch (error) {
    logger.error('Error unlocking session:', error);
    throw error;
  }
};

adminSessionSchema.methods.suspend = async function(suspensionData) {
  try {
    this.state.status = 'SUSPENDED';
    this.state.suspensionReason = suspensionData.reason;
    this.state.suspendedAt = new Date();
    this.state.suspendedBy = suspensionData.suspendedBy;
    this.state.suspendedUntil = suspensionData.until;
    
    await this.save();
    
    logger.info(`Session ${this.sessionId} suspended: ${suspensionData.reason}`);
    
    return this;
  } catch (error) {
    logger.error('Error suspending session:', error);
    throw error;
  }
};

adminSessionSchema.methods.terminate = async function(terminationReason, terminatedBy) {
  try {
    this.state.status = 'TERMINATED';
    this.lifecycle.terminatedAt = new Date();
    this.lifecycle.terminationReason = terminationReason;
    this.lifecycle.terminatedBy = terminatedBy;
    
    // Clear sensitive data
    this.sessionToken = null;
    this.refreshToken = null;
    this.security.encryptionKey = null;
    
    await this.save();
    
    logger.info(`Session ${this.sessionId} terminated: ${terminationReason}`);
    
    return this;
  } catch (error) {
    logger.error('Error terminating session:', error);
    throw error;
  }
};

adminSessionSchema.methods.issueChallenge = async function(challengeType) {
  try {
    const challenge = {
      challengeType,
      issuedAt: new Date(),
      completedAt: null,
      success: false,
      attempts: 0,
      maxAttempts: 3
    };
    
    this.security.verificationChallenges.push(challenge);
    
    await this.save();
    
    logger.info(`Challenge issued for session ${this.sessionId}: ${challengeType}`);
    
    return challenge;
  } catch (error) {
    logger.error('Error issuing challenge:', error);
    throw error;
  }
};

adminSessionSchema.methods.completeChallenge = async function(challengeType, success) {
  try {
    const challenge = this.security.verificationChallenges.find(
      c => c.challengeType === challengeType && !c.completedAt
    );
    
    if (!challenge) {
      throw new AppError('Challenge not found', 404);
    }
    
    challenge.attempts += 1;
    
    if (success) {
      challenge.success = true;
      challenge.completedAt = new Date();
    } else if (challenge.attempts >= challenge.maxAttempts) {
      challenge.completedAt = new Date();
      
      // Lock session after max failed attempts
      await this.lock('Maximum challenge attempts exceeded');
    }
    
    await this.save();
    
    return challenge;
  } catch (error) {
    logger.error('Error completing challenge:', error);
    throw error;
  }
};

adminSessionSchema.methods.addNotification = async function(notification) {
  try {
    this.notifications.sentNotifications.push({
      type: notification.type,
      subject: notification.subject,
      timestamp: new Date(),
      channel: notification.channel,
      success: notification.success || false,
      error: notification.error
    });
    
    // Keep only last 50 notifications
    if (this.notifications.sentNotifications.length > 50) {
      this.notifications.sentNotifications = this.notifications.sentNotifications.slice(-50);
    }
    
    await this.save();
    
    return this;
  } catch (error) {
    logger.error('Error adding notification:', error);
    throw error;
  }
};

adminSessionSchema.methods.toSafeJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive fields
  delete obj.sessionToken;
  delete obj.refreshToken;
  delete obj.security.encryptionKey;
  delete obj.security.integrityHash;
  
  return obj;
};

// ==================== Static Methods ====================
adminSessionSchema.statics.findByToken = async function(token) {
  const sessions = await this.find({ 
    'state.status': 'ACTIVE',
    'lifecycle.expiresAt': { $gt: new Date() }
  });
  
  for (const session of sessions) {
    if (await session.validateToken(token)) {
      return session;
    }
  }
  
  return null;
};

adminSessionSchema.statics.findActiveSessions = async function(adminUserId) {
  return this.find({
    adminUserId,
    'state.status': 'ACTIVE',
    'lifecycle.expiresAt': { $gt: new Date() }
  });
};

adminSessionSchema.statics.findByUser = async function(userId, options = {}) {
  const query = { userId };
  
  if (options.activeOnly) {
    query['state.status'] = 'ACTIVE';
    query['lifecycle.expiresAt'] = { $gt: new Date() };
  }
  
  return this.find(query).sort('-lifecycle.createdAt');
};

adminSessionSchema.statics.terminateUserSessions = async function(userId, reason) {
  const sessions = await this.find({
    userId,
    'state.status': { $in: ['ACTIVE', 'IDLE'] }
  });
  
  const terminated = [];
  
  for (const session of sessions) {
    await session.terminate(reason);
    terminated.push(session.sessionId);
  }
  
  logger.info(`Terminated ${terminated.length} sessions for user ${userId}`);
  
  return terminated;
};

adminSessionSchema.statics.findExpiredSessions = async function() {
  return this.find({
    'state.status': { $in: ['ACTIVE', 'IDLE'] },
    $or: [
      { 'lifecycle.expiresAt': { $lte: new Date() } },
      { 'lifecycle.absoluteExpiryAt': { $lte: new Date() } }
    ]
  });
};

adminSessionSchema.statics.findIdleSessions = async function(idleMinutes = 15) {
  const idleThreshold = new Date(Date.now() - (idleMinutes * 60 * 1000));
  
  return this.find({
    'state.status': 'ACTIVE',
    'lifecycle.lastActivityAt': { $lt: idleThreshold }
  });
};

adminSessionSchema.statics.findHighRiskSessions = async function() {
  return this.find({
    'state.status': 'ACTIVE',
    $or: [
      { 'security.riskScore': { $gte: 70 } },
      { 'security.anomalies': { 
          $elemMatch: { 
            severity: 'CRITICAL',
            resolved: false 
          }
        }
      }
    ]
  });
};

adminSessionSchema.statics.findImpersonatingSessions = async function() {
  return this.find({
    'impersonation.isImpersonating': true,
    'state.status': 'ACTIVE'
  });
};

adminSessionSchema.statics.cleanupExpiredSessions = async function() {
  const expired = await this.findExpiredSessions();
  let cleaned = 0;
  
  for (const session of expired) {
    await session.terminate('EXPIRED');
    cleaned++;
  }
  
  logger.info(`Cleaned up ${cleaned} expired sessions`);
  
  return cleaned;
};

adminSessionSchema.statics.generateSessionReport = async function(adminUserId, days = 30) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  const sessions = await this.find({
    adminUserId,
    'lifecycle.createdAt': { $gte: startDate }
  });
  
  const report = {
    totalSessions: sessions.length,
    activeSessions: 0,
    terminatedSessions: 0,
    averageDuration: 0,
    totalApiCalls: 0,
    totalDataAccess: 0,
    securityEvents: 0,
    highRiskSessions: 0,
    locations: new Set(),
    devices: new Set()
  };
  
  let totalDuration = 0;
  
  for (const session of sessions) {
    if (session.state.status === 'ACTIVE') {
      report.activeSessions++;
    } else if (session.state.status === 'TERMINATED') {
      report.terminatedSessions++;
    }
    
    totalDuration += session.metrics.duration.total || 0;
    report.totalApiCalls += session.activity.apiCalls?.length || 0;
    report.totalDataAccess += session.activity.dataAccess?.length || 0;
    report.securityEvents += session.security.securityEvents?.length || 0;
    
    if (session.security.riskScore >= 70) {
      report.highRiskSessions++;
    }
    
    if (session.context.location?.country) {
      report.locations.add(session.context.location.country);
    }
    
    if (session.context.deviceInfo?.deviceType) {
      report.devices.add(session.context.deviceInfo.deviceType);
    }
  }
  
  report.averageDuration = sessions.length > 0 
    ? Math.round(totalDuration / sessions.length) 
    : 0;
  
  report.locations = Array.from(report.locations);
  report.devices = Array.from(report.devices);
  
  return report;
};

// ==================== Model Registration ====================
const AdminSession = mongoose.model('AdminSession', adminSessionSchema);

module.exports = AdminSession;