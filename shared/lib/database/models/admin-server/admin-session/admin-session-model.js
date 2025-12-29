/**
 * @fileoverview Admin Session Model
 * @module shared/lib/database/models/admin-server/admin-session
 * @description Mongoose model for tracking administrative user sessions with enhanced security,
 *              device fingerprinting, geographic tracking, and comprehensive audit capabilities.
 *              Sessions are tracked separately for detailed analytics and security monitoring.
 * @version 1.0.0
 * @requires mongoose
 * @requires crypto
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * @constant {number} DEFAULT_SESSION_EXPIRY_HOURS - Default session expiry in hours
 */
const DEFAULT_SESSION_EXPIRY_HOURS = 24;

/**
 * @constant {number} REFRESH_TOKEN_EXPIRY_DAYS - Refresh token expiry in days
 */
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * @constant {number} INACTIVITY_TIMEOUT_MINUTES - Session timeout after inactivity
 */
const INACTIVITY_TIMEOUT_MINUTES = 15;

/**
 * Admin Session Schema
 * @typedef {Object} AdminSessionSchema
 * @description Comprehensive schema for tracking admin user sessions
 */
const adminSessionSchema = new mongoose.Schema(
  {
    // ============================================================================
    // Core Session Identification
    // ============================================================================

    /**
     * @property {string} sessionId - Unique session identifier (UUID)
     * @required
     * @unique
     * @index
     */
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      unique: true,
      index: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} adminUser - Reference to AdminUser
     * @required
     * @index
     */
    adminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: [true, 'Admin user reference is required'],
      index: true
    },

    // ============================================================================
    // Token Management
    // ============================================================================

    /**
     * @property {string} accessTokenHash - Hashed JWT access token
     * @required
     * @private
     * @description Access tokens are short-lived (15-60 min)
     */
    accessTokenHash: {
      type: String,
      required: [true, 'Access token hash is required'],
      select: false // Never send to client
    },

    /**
     * @property {string} refreshTokenHash - Hashed JWT refresh token
     * @private
     * @description Refresh tokens are long-lived (7-30 days)
     */
    refreshTokenHash: {
      type: String,
      select: false
    },

    /**
     * @property {Date} accessTokenExpiresAt - Access token expiry timestamp
     * @required
     */
    accessTokenExpiresAt: {
      type: Date,
      required: [true, 'Access token expiry is required'],
      index: true
    },

    /**
     * @property {Date} refreshTokenExpiresAt - Refresh token expiry timestamp
     */
    refreshTokenExpiresAt: {
      type: Date,
      index: true
    },

    /**
     * @property {number} tokenRotationCount - Number of times token has been rotated
     * @description Track token rotation for security monitoring
     */
    tokenRotationCount: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Date} lastTokenRotation - Timestamp of last token rotation
     */
    lastTokenRotation: {
      type: Date
    },

    // ============================================================================
    // Session Status & Lifecycle
    // ============================================================================

    /**
     * @property {string} status - Current session status
     * @required
     * @enum {string} - active, expired, revoked, suspended
     */
    status: {
      type: String,
      required: true,
      enum: {
        values: ['active', 'expired', 'revoked', 'suspended'],
        message: '{VALUE} is not a valid session status'
      },
      default: 'active',
      index: true
    },

    /**
     * @property {Date} expiresAt - Session absolute expiry timestamp
     * @required
     * @index
     */
    expiresAt: {
      type: Date,
      required: [true, 'Session expiry is required'],
      index: true
    },

    /**
     * @property {Date} lastActivity - Timestamp of last session activity
     * @required
     * @index
     * @description Used for inactivity timeout
     */
    lastActivity: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    /**
     * @property {number} inactivityTimeoutMinutes - Minutes of inactivity before timeout
     * @description Overrides default inactivity timeout
     */
    inactivityTimeoutMinutes: {
      type: Number,
      default: INACTIVITY_TIMEOUT_MINUTES,
      min: [1, 'Inactivity timeout must be at least 1 minute'],
      max: [1440, 'Inactivity timeout cannot exceed 24 hours']
    },

    /**
     * @property {boolean} isActive - Whether session is currently active
     * @required
     * @index
     * @description Computed based on expiry and status
     */
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true
    },

    // ============================================================================
    // Authentication & Security
    // ============================================================================

    /**
     * @property {boolean} isMfaVerified - Whether MFA was verified for this session
     * @required
     */
    isMfaVerified: {
      type: Boolean,
      required: true,
      default: false
    },

    /**
     * @property {Date} mfaVerifiedAt - Timestamp when MFA was verified
     */
    mfaVerifiedAt: {
      type: Date
    },

    /**
     * @property {string} mfaMethod - MFA method used
     * @enum {string} - totp, sms, email, backup_code
     */
    mfaMethod: {
      type: String,
      enum: {
        values: ['totp', 'sms', 'email', 'backup_code', null],
        message: '{VALUE} is not a valid MFA method'
      }
    },

    /**
     * @property {boolean} requiresStepUp - Whether session requires step-up authentication
     * @description For sensitive operations requiring re-authentication
     */
    requiresStepUp: {
      type: Boolean,
      default: false
    },

    /**
     * @property {Date} lastStepUpAt - Timestamp of last step-up authentication
     */
    lastStepUpAt: {
      type: Date
    },

    // ============================================================================
    // Device & Client Information
    // ============================================================================

    /**
     * @property {string} ipAddress - Client IP address
     * @required
     * @index
     */
    ipAddress: {
      type: String,
      required: [true, 'IP address is required'],
      index: true
    },

    /**
     * @property {Array<string>} ipAddressHistory - Historical IP addresses for this session
     * @description Tracks IP changes (e.g., mobile device switching networks)
     */
    ipAddressHistory: {
      type: [{
        ip: String,
        timestamp: {
          type: Date,
          default: Date.now
        }
      }],
      default: []
    },

    /**
     * @property {string} userAgent - Client user agent string
     * @required
     */
    userAgent: {
      type: String,
      required: [true, 'User agent is required']
    },

    /**
     * @property {Object} deviceInfo - Parsed device information
     */
    deviceInfo: {
      /**
       * @property {string} deviceType - Type of device
       * @enum {string} - desktop, mobile, tablet, unknown
       */
      deviceType: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'unknown'],
        default: 'unknown'
      },

      /**
       * @property {string} os - Operating system
       */
      os: {
        name: String,
        version: String
      },

      /**
       * @property {string} browser - Browser information
       */
      browser: {
        name: String,
        version: String
      },

      /**
       * @property {string} deviceFingerprint - Unique device fingerprint
       * @description Generated from device characteristics for security
       */
      deviceFingerprint: {
        type: String,
        index: true
      },

      /**
       * @property {boolean} isTrustedDevice - Whether device is marked as trusted
       */
      isTrustedDevice: {
        type: Boolean,
        default: false
      }
    },

    // ============================================================================
    // Geographic & Network Information
    // ============================================================================

    /**
     * @property {Object} location - Geographic location data
     */
    location: {
      /**
       * @property {string} country - Country name
       */
      country: {
        type: String,
        index: true
      },

      /**
       * @property {string} countryCode - ISO country code
       */
      countryCode: String,

      /**
       * @property {string} region - Region/state
       */
      region: String,

      /**
       * @property {string} city - City name
       */
      city: String,

      /**
       * @property {string} timezone - Timezone
       */
      timezone: String,

      /**
       * @property {Array<number>} coordinates - [longitude, latitude]
       */
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function(coords) {
            return coords.length === 0 || (coords.length === 2 &&
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90);
          },
          message: 'Invalid coordinates format'
        }
      },

      /**
       * @property {string} isp - Internet Service Provider
       */
      isp: String,

      /**
       * @property {string} organization - Organization owning the IP
       */
      organization: String
    },

    // ============================================================================
    // Security Flags & Monitoring
    // ============================================================================

    /**
     * @property {boolean} isSuspicious - Flag for suspicious activity
     * @index
     */
    isSuspicious: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * @property {Array<string>} suspiciousReasons - Reasons for suspicious flag
     */
    suspiciousReasons: {
      type: [String],
      default: []
    },

    /**
     * @property {boolean} isProxy - Whether IP is from a proxy/VPN
     */
    isProxy: {
      type: Boolean,
      default: false
    },

    /**
     * @property {boolean} isTor - Whether IP is from Tor network
     */
    isTor: {
      type: Boolean,
      default: false
    },

    /**
     * @property {number} riskScore - Calculated risk score (0-100)
     * @description Higher score = higher risk
     */
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    // ============================================================================
    // Session Metadata & Analytics
    // ============================================================================

    /**
     * @property {number} requestCount - Number of requests made in this session
     */
    requestCount: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Array<Object>} activityLog - Session activity log
     * @description Tracks significant actions during session
     */
    activityLog: {
      type: [{
        action: {
          type: String,
          required: true
        },
        resource: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        ipAddress: String,
        metadata: mongoose.Schema.Types.Mixed
      }],
      default: [],
      validate: {
        validator: function(log) {
          return log.length <= 1000; // Limit log size
        },
        message: 'Activity log cannot exceed 1000 entries'
      }
    },

    /**
     * @property {Object} sessionMetadata - Additional flexible metadata
     */
    sessionMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // ============================================================================
    // Termination Information
    // ============================================================================

    /**
     * @property {Date} terminatedAt - When session was terminated
     */
    terminatedAt: {
      type: Date,
      index: true
    },

    /**
     * @property {string} terminationReason - Reason for session termination
     * @enum {string} - logout, timeout, revoked, expired, forced, suspicious
     */
    terminationReason: {
      type: String,
      enum: {
        values: [
          'logout',
          'timeout',
          'revoked',
          'expired',
          'forced',
          'suspicious',
          'password_change',
          'mfa_change',
          'admin_action',
          null
        ],
        message: '{VALUE} is not a valid termination reason'
      }
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} terminatedBy - Admin who terminated session
     */
    terminatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    }
  },
  {
    // Schema options
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'admin_sessions',

    // Indexes
    indexes: [
      { sessionId: 1 },
      { adminUser: 1, status: 1 },
      { adminUser: 1, isActive: 1 },
      { expiresAt: 1 },
      { lastActivity: 1 },
      { ipAddress: 1 },
      { 'deviceInfo.deviceFingerprint': 1 },
      { createdAt: -1 }
    ],

    // JSON transformation
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        // Remove sensitive fields
        delete ret.accessTokenHash;
        delete ret.refreshTokenHash;
        delete ret.__v;
        return ret;
      }
    },

    toObject: {
      virtuals: true
    }
  }
);

// ============================================================================
// Virtual Properties
// ============================================================================

/**
 * Virtual: isExpired
 * @returns {boolean} Whether session has expired
 */
adminSessionSchema.virtual('isExpired').get(function() {
  return Date.now() > this.expiresAt;
});

/**
 * Virtual: isInactive
 * @returns {boolean} Whether session has been inactive too long
 */
adminSessionSchema.virtual('isInactive').get(function() {
  const inactivityMs = this.inactivityTimeoutMinutes * 60 * 1000;
  return Date.now() - this.lastActivity > inactivityMs;
});

/**
 * Virtual: isValid
 * @returns {boolean} Whether session is currently valid
 */
adminSessionSchema.virtual('isValid').get(function() {
  return (
    this.isActive &&
    !this.isExpired &&
    !this.isInactive &&
    this.status === 'active'
  );
});

/**
 * Virtual: durationMinutes
 * @returns {number} Session duration in minutes
 */
adminSessionSchema.virtual('durationMinutes').get(function() {
  const endTime = this.terminatedAt || Date.now();
  return Math.round((endTime - this.createdAt) / (1000 * 60));
});

/**
 * Virtual: inactivityMinutes
 * @returns {number} Minutes since last activity
 */
adminSessionSchema.virtual('inactivityMinutes').get(function() {
  return Math.round((Date.now() - this.lastActivity) / (1000 * 60));
});

// ============================================================================
// Indexes for Performance
// ============================================================================

// TTL index for automatic cleanup of expired sessions
adminSessionSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60, // Keep for 7 days after expiry for audit
    partialFilterExpression: { status: 'expired' }
  }
);

// Compound index for common queries
adminSessionSchema.index({ adminUser: 1, createdAt: -1 });
adminSessionSchema.index({ adminUser: 1, isActive: 1, expiresAt: -1 });

// Geospatial index for location queries
adminSessionSchema.index({ 'location.coordinates': '2dsphere' });

// ============================================================================
// Pre-Save Middleware
// ============================================================================

/**
 * Pre-save hook: Update isActive based on session state
 */
adminSessionSchema.pre('save', function(next) {
  // Automatically set isActive based on expiry and status
  this.isActive = (
    this.status === 'active' &&
    this.expiresAt > Date.now() &&
    (Date.now() - this.lastActivity) < (this.inactivityTimeoutMinutes * 60 * 1000)
  );

  next();
});

/**
 * Pre-save hook: Limit activity log size
 */
adminSessionSchema.pre('save', function(next) {
  // Keep only last 1000 activity entries
  if (this.activityLog && this.activityLog.length > 1000) {
    this.activityLog = this.activityLog.slice(-1000);
  }

  next();
});

/**
 * Pre-save hook: Limit IP address history
 */
adminSessionSchema.pre('save', function(next) {
  // Keep only last 50 IP addresses
  if (this.ipAddressHistory && this.ipAddressHistory.length > 50) {
    this.ipAddressHistory = this.ipAddressHistory.slice(-50);
  }

  next();
});

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Update last activity timestamp
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.updateActivity = async function() {
  this.lastActivity = new Date();
  this.requestCount += 1;
  return this.save();
};

/**
 * Add activity to session log
 * @param {string} action - Action performed
 * @param {string} resource - Resource affected
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.logActivity = async function(action, resource, metadata = {}) {
  this.activityLog.push({
    action,
    resource,
    timestamp: new Date(),
    ipAddress: this.ipAddress,
    metadata
  });

  // Update last activity
  this.lastActivity = new Date();
  this.requestCount += 1;

  return this.save();
};

/**
 * Rotate access token
 * @param {string} newTokenHash - Hash of new JWT token
 * @param {Date} expiresAt - New expiry timestamp
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.rotateAccessToken = async function(newTokenHash, expiresAt) {
  this.accessTokenHash = newTokenHash;
  this.accessTokenExpiresAt = expiresAt;
  this.tokenRotationCount += 1;
  this.lastTokenRotation = new Date();
  this.lastActivity = new Date();

  return this.save();
};

/**
 * Rotate refresh token
 * @param {string} newTokenHash - Hash of new refresh token
 * @param {Date} expiresAt - New expiry timestamp
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.rotateRefreshToken = async function(newTokenHash, expiresAt) {
  this.refreshTokenHash = newTokenHash;
  this.refreshTokenExpiresAt = expiresAt;
  this.lastActivity = new Date();

  return this.save();
};

/**
 * Revoke session
 * @param {string} reason - Revocation reason
 * @param {mongoose.Schema.Types.ObjectId} terminatedBy - Admin who revoked
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.revoke = async function(reason, terminatedBy = null) {
  this.status = 'revoked';
  this.isActive = false;
  this.terminatedAt = new Date();
  this.terminationReason = reason;
  if (terminatedBy) {
    this.terminatedBy = terminatedBy;
  }

  return this.save();
};

/**
 * Expire session
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.expire = async function() {
  this.status = 'expired';
  this.isActive = false;
  this.terminatedAt = new Date();
  this.terminationReason = 'expired';

  return this.save();
};

/**
 * Mark session as suspicious
 * @param {Array<string>} reasons - Reasons for suspicious flag
 * @param {number} riskScore - Risk score (0-100)
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.markSuspicious = async function(reasons, riskScore = 75) {
  this.isSuspicious = true;
  this.suspiciousReasons = [...new Set([...this.suspiciousReasons, ...reasons])];
  this.riskScore = Math.max(this.riskScore, riskScore);

  // Optionally suspend high-risk sessions
  if (riskScore >= 90) {
    this.status = 'suspended';
    this.isActive = false;
  }

  return this.save();
};

/**
 * Add IP address change to history
 * @param {string} newIpAddress - New IP address
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.updateIpAddress = async function(newIpAddress) {
  if (newIpAddress !== this.ipAddress) {
    // Add to history
    this.ipAddressHistory.push({
      ip: this.ipAddress,
      timestamp: new Date()
    });

    // Update current IP
    this.ipAddress = newIpAddress;

    // Flag as suspicious if too many IP changes
    if (this.ipAddressHistory.length > 10) {
      await this.markSuspicious(['excessive_ip_changes'], 60);
    }
  }

  return this.save();
};

/**
 * Extend session expiry
 * @param {number} hours - Hours to extend
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.extend = async function(hours = 24) {
  const extension = hours * 60 * 60 * 1000;
  this.expiresAt = new Date(this.expiresAt.getTime() + extension);
  this.lastActivity = new Date();

  return this.save();
};

/**
 * Mark device as trusted
 * @returns {Promise<void>}
 * @async
 */
adminSessionSchema.methods.trustDevice = async function() {
  this.deviceInfo.isTrustedDevice = true;
  return this.save();
};

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Find session by session ID
 * @param {string} sessionId - Session ID to find
 * @returns {Promise<Object|null>} Session document or null
 * @static
 * @async
 */
adminSessionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ sessionId, isActive: true });
};

/**
 * Find all active sessions for an admin user
 * @param {mongoose.Schema.Types.ObjectId} adminUserId - Admin user ID
 * @returns {Promise<Array>} Array of active sessions
 * @static
 * @async
 */
adminSessionSchema.statics.findActiveByUser = function(adminUserId) {
  return this.find({
    adminUser: adminUserId,
    isActive: true,
    expiresAt: { $gt: Date.now() }
  }).sort({ lastActivity: -1 });
};

/**
 * Revoke all sessions for an admin user
 * @param {mongoose.Schema.Types.ObjectId} adminUserId - Admin user ID
 * @param {string} reason - Revocation reason
 * @returns {Promise<Object>} Update result
 * @static
 * @async
 */
adminSessionSchema.statics.revokeAllByUser = function(adminUserId, reason) {
  return this.updateMany(
    {
      adminUser: adminUserId,
      isActive: true
    },
    {
      $set: {
        status: 'revoked',
        isActive: false,
        terminatedAt: new Date(),
        terminationReason: reason
      }
    }
  );
};

/**
 * Clean up expired sessions
 * @returns {Promise<Object>} Deletion result
 * @static
 * @async
 */
adminSessionSchema.statics.cleanupExpired = async function() {
  const now = new Date();

  // Mark as expired
  await this.updateMany(
    {
      isActive: true,
      expiresAt: { $lt: now }
    },
    {
      $set: {
        status: 'expired',
        isActive: false,
        terminatedAt: now,
        terminationReason: 'expired'
      }
    }
  );

  // Delete old expired sessions (older than 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  return this.deleteMany({
    status: 'expired',
    terminatedAt: { $lt: thirtyDaysAgo }
  });
};

/**
 * Clean up inactive sessions
 * @returns {Promise<Object>} Update result
 * @static
 * @async
 */
adminSessionSchema.statics.cleanupInactive = function() {
  const now = new Date();

  return this.updateMany(
    {
      isActive: true,
      lastActivity: {
        $lt: new Date(now.getTime() - (INACTIVITY_TIMEOUT_MINUTES * 60 * 1000))
      }
    },
    {
      $set: {
        status: 'expired',
        isActive: false,
        terminatedAt: now,
        terminationReason: 'timeout'
      }
    }
  );
};

/**
 * Get session statistics
 * @param {mongoose.Schema.Types.ObjectId} adminUserId - Optional admin user ID filter
 * @returns {Promise<Object>} Statistics object
 * @static
 * @async
 */
adminSessionSchema.statics.getStatistics = async function(adminUserId = null) {
  const matchStage = adminUserId ? { adminUser: adminUserId } : {};

  const [stats] = await this.aggregate([
    { $match: matchStage },
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { isActive: true } },
          { $count: 'count' }
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        byDevice: [
          { $group: { _id: '$deviceInfo.deviceType', count: { $sum: 1 } } }
        ],
        suspicious: [
          { $match: { isSuspicious: true } },
          { $count: 'count' }
        ],
        avgDuration: [
          {
            $group: {
              _id: null,
              avgMinutes: {
                $avg: {
                  $divide: [
                    { $subtract: ['$terminatedAt', '$createdAt'] },
                    1000 * 60
                  ]
                }
              }
            }
          }
        ]
      }
    }
  ]);

  return {
    total: stats.total[0]?.count || 0,
    active: stats.active[0]?.count || 0,
    byStatus: stats.byStatus.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {}),
    byDevice: stats.byDevice.reduce((acc, { _id, count }) => {
      acc[_id || 'unknown'] = count;
      return acc;
    }, {}),
    suspicious: stats.suspicious[0]?.count || 0,
    avgDurationMinutes: stats.avgDuration[0]?.avgMinutes || 0
  };
};

/**
 * Find suspicious sessions
 * @param {number} minRiskScore - Minimum risk score threshold
 * @returns {Promise<Array>} Array of suspicious sessions
 * @static
 * @async
 */
adminSessionSchema.statics.findSuspicious = function(minRiskScore = 50) {
  return this.find({
    $or: [
      { isSuspicious: true },
      { riskScore: { $gte: minRiskScore } }
    ]
  })
  .populate('adminUser', 'email firstName lastName role')
  .sort({ riskScore: -1, createdAt: -1 });
};

/**
 * Find sessions by IP address
 * @param {string} ipAddress - IP address to search
 * @returns {Promise<Array>} Array of sessions
 * @static
 * @async
 */
adminSessionSchema.statics.findByIpAddress = function(ipAddress) {
  return this.find({ ipAddress })
    .populate('adminUser', 'email firstName lastName')
    .sort({ createdAt: -1 });
};

/**
 * Find sessions by device fingerprint
 * @param {string} fingerprint - Device fingerprint
 * @returns {Promise<Array>} Array of sessions
 * @static
 * @async
 */
adminSessionSchema.statics.findByDeviceFingerprint = function(fingerprint) {
  return this.find({ 'deviceInfo.deviceFingerprint': fingerprint })
    .populate('adminUser', 'email firstName lastName')
    .sort({ createdAt: -1 });
};

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Query helper: Find only active sessions
 */
adminSessionSchema.query.active = function() {
  return this.where({ isActive: true, expiresAt: { $gt: Date.now() } });
};

/**
 * Query helper: Find expired sessions
 */
adminSessionSchema.query.expired = function() {
  return this.where({ status: 'expired' });
};

/**
 * Query helper: Find revoked sessions
 */
adminSessionSchema.query.revoked = function() {
  return this.where({ status: 'revoked' });
};

/**
 * Query helper: Find suspicious sessions
 */
adminSessionSchema.query.suspicious = function() {
  return this.where({ isSuspicious: true });
};

/**
 * Query helper: Find MFA verified sessions
 */
adminSessionSchema.query.mfaVerified = function() {
  return this.where({ isMfaVerified: true });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminSessionSchema,
  modelName: 'AdminSession'
};
