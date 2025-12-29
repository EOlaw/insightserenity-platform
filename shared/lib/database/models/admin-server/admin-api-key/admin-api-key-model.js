/**
 * @fileoverview Admin API Key Model
 * @module shared/lib/database/models/admin-server/admin-api-key
 * @description Mongoose model for managing programmatic API access for admin users.
 *              Supports scoped permissions, rate limiting, IP restrictions, and comprehensive audit trails.
 * @version 1.0.0
 * @requires mongoose
 * @requires crypto
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * @constant {number} API_KEY_LENGTH - Length of generated API keys
 */
const API_KEY_LENGTH = 32;

/**
 * @constant {string} API_KEY_PREFIX - Prefix for API keys for easy identification
 */
const API_KEY_PREFIX = 'isk_'; // InsightSerenity Key

/**
 * Admin API Key Schema
 * @typedef {Object} AdminAPIKeySchema
 * @description Schema for admin API keys with security and usage tracking
 */
const adminAPIKeySchema = new mongoose.Schema(
  {
    // ============================================================================
    // Core Identification
    // ============================================================================

    /**
     * @property {string} name - Descriptive name for the API key
     * @required
     */
    name: {
      type: String,
      required: [true, 'API key name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters']
    },

    /**
     * @property {string} description - Detailed description of API key purpose
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} adminUser - Reference to owner AdminUser
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
    // Key Management
    // ============================================================================

    /**
     * @property {string} keyHash - Hashed API key
     * @required
     * @unique
     * @private
     */
    keyHash: {
      type: String,
      required: [true, 'API key hash is required'],
      unique: true,
      index: true,
      select: false
    },

    /**
     * @property {string} keyPrefix - First 8 characters of key for identification
     * @description Stored in plain text for display purposes (e.g., "isk_1a2b...")
     */
    keyPrefix: {
      type: String,
      required: true,
      index: true
    },

    /**
     * @property {string} keyId - Unique identifier for this key
     * @required
     * @unique
     */
    keyId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // ============================================================================
    // Permissions & Scopes
    // ============================================================================

    /**
     * @property {Array<string>} scopes - API scopes/permissions
     * @description Defines what this API key can access
     * @example ['users:read', 'analytics:read', 'billing:write']
     */
    scopes: {
      type: [String],
      default: [],
      validate: {
        validator: function(scopes) {
          return scopes.every(scope => /^[a-z-]+:[a-z-]+$/i.test(scope));
        },
        message: 'Invalid scope format. Use resource:action (e.g., users:read)'
      }
    },

    /**
     * @property {Array<mongoose.Schema.Types.ObjectId>} roles - Reference to AdminRole documents
     * @description Additional roles assigned to this API key
     */
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminRole'
    }],

    /**
     * @property {string} accessLevel - Overall access level
     * @enum {string} - read_only, read_write, admin
     */
    accessLevel: {
      type: String,
      enum: {
        values: ['read_only', 'read_write', 'admin'],
        message: '{VALUE} is not a valid access level'
      },
      default: 'read_only'
    },

    // ============================================================================
    // Security & Restrictions
    // ============================================================================

    /**
     * @property {Array<string>} ipWhitelist - Allowed IP addresses/ranges
     * @description If empty, all IPs are allowed
     */
    ipWhitelist: {
      type: [String],
      default: []
    },

    /**
     * @property {Array<string>} allowedOrigins - Allowed CORS origins
     */
    allowedOrigins: {
      type: [String],
      default: []
    },

    /**
     * @property {Object} rateLimit - Rate limiting configuration
     */
    rateLimit: {
      /**
       * @property {number} requestsPerMinute - Maximum requests per minute
       */
      requestsPerMinute: {
        type: Number,
        default: 60,
        min: [1, 'Rate limit must be at least 1 request per minute'],
        max: [10000, 'Rate limit cannot exceed 10000 requests per minute']
      },

      /**
       * @property {number} requestsPerHour - Maximum requests per hour
       */
      requestsPerHour: {
        type: Number,
        default: 1000,
        min: [1, 'Rate limit must be at least 1 request per hour'],
        max: [100000, 'Rate limit cannot exceed 100000 requests per hour']
      },

      /**
       * @property {number} requestsPerDay - Maximum requests per day
       */
      requestsPerDay: {
        type: Number,
        default: 10000,
        min: [1, 'Rate limit must be at least 1 request per day'],
        max: [1000000, 'Rate limit cannot exceed 1000000 requests per day']
      }
    },

    // ============================================================================
    // Status & Lifecycle
    // ============================================================================

    /**
     * @property {boolean} isActive - Whether API key is active
     * @required
     * @index
     */
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true
    },

    /**
     * @property {Date} expiresAt - When API key expires
     * @index
     */
    expiresAt: {
      type: Date,
      index: true,
      validate: {
        validator: function(date) {
          return !date || date > Date.now();
        },
        message: 'Expiry date must be in the future'
      }
    },

    /**
     * @property {Date} revokedAt - When API key was revoked
     */
    revokedAt: {
      type: Date
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} revokedBy - Admin who revoked the key
     */
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {string} revocationReason - Reason for revocation
     */
    revocationReason: {
      type: String,
      trim: true
    },

    // ============================================================================
    // Usage Tracking
    // ============================================================================

    /**
     * @property {Date} lastUsed - Last time API key was used
     * @index
     */
    lastUsed: {
      type: Date,
      index: true
    },

    /**
     * @property {string} lastUsedIp - IP address of last use
     */
    lastUsedIp: {
      type: String
    },

    /**
     * @property {number} totalRequests - Total number of requests made
     */
    totalRequests: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Object} usageStats - Usage statistics
     */
    usageStats: {
      /**
       * @property {number} successfulRequests - Count of successful requests
       */
      successfulRequests: {
        type: Number,
        default: 0,
        min: 0
      },

      /**
       * @property {number} failedRequests - Count of failed requests
       */
      failedRequests: {
        type: Number,
        default: 0,
        min: 0
      },

      /**
       * @property {number} rateLimitExceeded - Count of rate limit violations
       */
      rateLimitExceeded: {
        type: Number,
        default: 0,
        min: 0
      },

      /**
       * @property {Array<Object>} requestsByDay - Daily request counts (last 30 days)
       */
      requestsByDay: {
        type: [{
          date: {
            type: Date,
            required: true
          },
          count: {
            type: Number,
            default: 0,
            min: 0
          }
        }],
        default: []
      }
    },

    /**
     * @property {Array<Object>} recentActivity - Recent API activity (last 100 requests)
     */
    recentActivity: {
      type: [{
        endpoint: String,
        method: String,
        statusCode: Number,
        ipAddress: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        responseTime: Number, // milliseconds
        errorMessage: String
      }],
      default: [],
      validate: {
        validator: function(activity) {
          return activity.length <= 100;
        },
        message: 'Recent activity cannot exceed 100 entries'
      }
    },

    // ============================================================================
    // Metadata & Audit
    // ============================================================================

    /**
     * @property {mongoose.Schema.Types.ObjectId} createdBy - Admin who created the key
     * @required
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: [true, 'Creator reference is required']
    },

    /**
     * @property {string} environment - Environment this key is intended for
     * @enum {string} - production, staging, development, testing
     */
    environment: {
      type: String,
      enum: {
        values: ['production', 'staging', 'development', 'testing'],
        message: '{VALUE} is not a valid environment'
      },
      default: 'production'
    },

    /**
     * @property {Object} metadata - Additional flexible metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'admin_api_keys',
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.keyHash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ============================================================================
// Virtual Properties
// ============================================================================

adminAPIKeySchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < Date.now();
});

adminAPIKeySchema.virtual('isRevoked').get(function() {
  return !!this.revokedAt;
});

adminAPIKeySchema.virtual('isValid').get(function() {
  return this.isActive && !this.isExpired && !this.isRevoked;
});

adminAPIKeySchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const days = Math.ceil((this.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
});

adminAPIKeySchema.virtual('successRate').get(function() {
  const total = this.usageStats.successfulRequests + this.usageStats.failedRequests;
  if (total === 0) return 0;
  return (this.usageStats.successfulRequests / total) * 100;
});

// ============================================================================
// Indexes
// ============================================================================

adminAPIKeySchema.index({ adminUser: 1, isActive: 1 });
adminAPIKeySchema.index({ keyPrefix: 1 });
adminAPIKeySchema.index({ expiresAt: 1 }, { sparse: true });
adminAPIKeySchema.index({ lastUsed: -1 });
adminAPIKeySchema.index({ createdAt: -1 });

// TTL index for automatic cleanup of expired keys (30 days after expiry)
adminAPIKeySchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { isActive: false }
  }
);

// ============================================================================
// Pre-Save Middleware
// ============================================================================

adminAPIKeySchema.pre('save', function(next) {
  // Limit recent activity to last 100 entries
  if (this.recentActivity && this.recentActivity.length > 100) {
    this.recentActivity = this.recentActivity.slice(-100);
  }

  // Limit daily stats to last 30 days
  if (this.usageStats.requestsByDay && this.usageStats.requestsByDay.length > 30) {
    this.usageStats.requestsByDay = this.usageStats.requestsByDay.slice(-30);
  }

  next();
});

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Generate a new API key
 * @returns {string} Plain text API key (show to user once)
 * @static
 */
adminAPIKeySchema.statics.generateKey = function() {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  const key = API_KEY_PREFIX + randomBytes.toString('base64url');
  return key;
};

/**
 * Hash an API key for storage
 * @param {string} key - Plain text API key
 * @returns {string} Hashed key
 * @static
 */
adminAPIKeySchema.statics.hashKey = function(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
};

/**
 * Verify an API key
 * @param {string} providedKey - Plain text key to verify
 * @returns {boolean} True if key matches
 * @async
 */
adminAPIKeySchema.methods.verifyKey = async function(providedKey) {
  const hash = this.constructor.hashKey(providedKey);
  const stored = await this.constructor.findById(this._id).select('+keyHash');
  return hash === stored.keyHash;
};

/**
 * Record API usage
 * @param {Object} requestData - Request information
 * @async
 */
adminAPIKeySchema.methods.recordUsage = async function(requestData) {
  const { endpoint, method, statusCode, ipAddress, responseTime, errorMessage } = requestData;

  // Update last used
  this.lastUsed = new Date();
  this.lastUsedIp = ipAddress;
  this.totalRequests += 1;

  // Update stats
  if (statusCode >= 200 && statusCode < 300) {
    this.usageStats.successfulRequests += 1;
  } else {
    this.usageStats.failedRequests += 1;
  }

  // Add to recent activity
  this.recentActivity.push({
    endpoint,
    method,
    statusCode,
    ipAddress,
    timestamp: new Date(),
    responseTime,
    errorMessage
  });

  // Update daily stats
  const today = new Date().toISOString().split('T')[0];
  const todayStats = this.usageStats.requestsByDay.find(
    day => day.date.toISOString().split('T')[0] === today
  );

  if (todayStats) {
    todayStats.count += 1;
  } else {
    this.usageStats.requestsByDay.push({
      date: new Date(),
      count: 1
    });
  }

  return this.save();
};

/**
 * Revoke API key
 * @param {mongoose.Schema.Types.ObjectId} revokedBy - Admin revoking the key
 * @param {string} reason - Revocation reason
 * @async
 */
adminAPIKeySchema.methods.revoke = async function(revokedBy, reason) {
  this.isActive = false;
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  return this.save();
};

/**
 * Check if IP is whitelisted
 * @param {string} ipAddress - IP to check
 * @returns {boolean} True if IP is allowed
 */
adminAPIKeySchema.methods.isIpAllowed = function(ipAddress) {
  if (!this.ipWhitelist || this.ipWhitelist.length === 0) return true;
  return this.ipWhitelist.includes(ipAddress);
};

/**
 * Check if scope is allowed
 * @param {string} requiredScope - Scope to check
 * @returns {boolean} True if scope is granted
 */
adminAPIKeySchema.methods.hasScope = function(requiredScope) {
  if (this.accessLevel === 'admin') return true;
  return this.scopes.includes(requiredScope);
};

// ============================================================================
// Static Methods
// ============================================================================

adminAPIKeySchema.statics.findByKey = async function(plainKey) {
  const hash = this.hashKey(plainKey);
  return this.findOne({ keyHash: hash, isActive: true }).select('+keyHash');
};

adminAPIKeySchema.statics.findByKeyPrefix = function(prefix) {
  return this.find({ keyPrefix: prefix, isActive: true });
};

adminAPIKeySchema.statics.findActiveByUser = function(adminUserId) {
  return this.find({
    adminUser: adminUserId,
    isActive: true,
    $or: [
      { expiresAt: { $gt: Date.now() } },
      { expiresAt: null }
    ]
  }).sort({ createdAt: -1 });
};

adminAPIKeySchema.statics.revokeAllByUser = function(adminUserId, revokedBy, reason) {
  return this.updateMany(
    { adminUser: adminUserId, isActive: true },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy,
        revocationReason: reason
      }
    }
  );
};

adminAPIKeySchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      isActive: true,
      expiresAt: { $lt: Date.now() }
    },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revocationReason: 'expired'
      }
    }
  );
};

// ============================================================================
// Query Helpers
// ============================================================================

adminAPIKeySchema.query.active = function() {
  return this.where({ isActive: true });
};

adminAPIKeySchema.query.expired = function() {
  return this.where({ expiresAt: { $lt: Date.now() } });
};

adminAPIKeySchema.query.revoked = function() {
  return this.where({ revokedAt: { $ne: null } });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminAPIKeySchema,
  modelName: 'AdminAPIKey'
};
