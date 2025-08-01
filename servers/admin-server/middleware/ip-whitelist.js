'use strict';

/**
 * @fileoverview IP Whitelist model for admin access control
 * @module shared/lib/database/models/ip-whitelist-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../shared/lib/database/models/base-model');
const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const { validateIP, validateCIDR } = require('../../../shared/lib/utils/validators/common-validators');

/**
 * IP Whitelist schema definition for admin access control
 */
const ipWhitelistSchemaDefinition = {
  // ==================== Multi-Tenant Context ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false, // IP whitelist can be global or tenant-specific
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false, // IP whitelist can be global or organization-specific
    index: true
  },

  // ==================== IP Information ====================
  ip: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(value) {
        // Validate either single IP or CIDR range
        return validateIP(value) || validateCIDR(value);
      },
      message: 'Invalid IP address or CIDR range format'
    }
  },

  type: {
    type: String,
    required: true,
    enum: ['single', 'range', 'wildcard'],
    default: 'single',
    index: true
  },

  // ==================== Access Control ====================
  isActive: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },

  priority: {
    type: Number,
    required: true,
    default: 100,
    min: 1,
    max: 1000,
    index: true
  },

  // ==================== Metadata ====================
  description: {
    type: String,
    maxlength: 500,
    trim: true
  },

  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],

  // ==================== Access Patterns ====================
  accessLevel: {
    type: String,
    enum: ['admin', 'read-only', 'limited'],
    default: 'admin',
    index: true
  },

  allowedPaths: [{
    type: String,
    trim: true
  }],

  restrictedPaths: [{
    type: String,
    trim: true
  }],

  // ==================== Time-based Access ====================
  validFrom: {
    type: Date,
    default: Date.now,
    index: true
  },

  validUntil: {
    type: Date,
    index: true,
    validate: {
      validator: function(value) {
        return !value || value > this.validFrom;
      },
      message: 'Valid until date must be after valid from date'
    }
  },

  // ==================== Usage Tracking ====================
  lastUsedAt: {
    type: Date,
    index: true
  },

  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },

  maxUsage: {
    type: Number,
    min: 1
  },

  // ==================== Geographic Information ====================
  country: {
    type: String,
    length: 2, // ISO country code
    uppercase: true
  },

  region: {
    type: String,
    maxlength: 100
  },

  city: {
    type: String,
    maxlength: 100
  },

  // ==================== Administration ====================
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  approvalRequired: {
    type: Boolean,
    default: false
  },

  approvedAt: {
    type: Date,
    index: true
  },

  // ==================== Security Context ====================
  source: {
    type: String,
    enum: ['manual', 'automated', 'emergency', 'bulk_import'],
    default: 'manual',
    index: true
  },

  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },

  securityFlags: [{
    type: String,
    enum: [
      'suspicious_activity',
      'multiple_attempts',
      'unusual_location',
      'tor_exit_node',
      'vpn_detected',
      'cloud_provider',
      'data_center'
    ]
  }],

  // ==================== Audit Trail ====================
  auditLog: [{
    action: {
      type: String,
      enum: ['created', 'modified', 'activated', 'deactivated', 'used', 'expired'],
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
      type: String
    }
  }],

  // ==================== Emergency Access ====================
  isEmergencyAccess: {
    type: Boolean,
    default: false,
    index: true
  },

  emergencyContact: {
    type: String,
    maxlength: 100
  },

  emergencyReason: {
    type: String,
    maxlength: 500
  }
};

/**
 * Create IP Whitelist schema with proper indexes and validation
 */
const ipWhitelistSchema = new mongoose.Schema(ipWhitelistSchemaDefinition, {
  timestamps: true,
  versionKey: false,
  collection: 'ip_whitelist'
});

// ==================== Indexes ====================
ipWhitelistSchema.index({ ip: 1, isActive: 1 });
ipWhitelistSchema.index({ tenantId: 1, isActive: 1 });
ipWhitelistSchema.index({ organizationId: 1, isActive: 1 });
ipWhitelistSchema.index({ type: 1, isActive: 1 });
ipWhitelistSchema.index({ validFrom: 1, validUntil: 1 });
ipWhitelistSchema.index({ addedBy: 1 });
ipWhitelistSchema.index({ lastUsedAt: -1 });
ipWhitelistSchema.index({ priority: -1 });

// Compound indexes for common queries
ipWhitelistSchema.index({ 
  ip: 1, 
  isActive: 1, 
  validFrom: 1, 
  validUntil: 1 
});

ipWhitelistSchema.index({
  organizationId: 1,
  tenantId: 1,
  isActive: 1
});

// ==================== Instance Methods ====================

/**
 * Check if IP whitelist entry is currently valid
 * @returns {boolean} True if entry is valid
 */
ipWhitelistSchema.methods.isValid = function() {
  const now = new Date();
  
  if (!this.isActive) {
    return false;
  }
  
  if (this.validFrom && this.validFrom > now) {
    return false;
  }
  
  if (this.validUntil && this.validUntil < now) {
    return false;
  }
  
  if (this.maxUsage && this.usageCount >= this.maxUsage) {
    return false;
  }
  
  return true;
};

/**
 * Record usage of this IP whitelist entry
 * @returns {Promise<void>}
 */
ipWhitelistSchema.methods.recordUsage = async function() {
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  
  // Add to audit log
  this.auditLog.push({
    action: 'used',
    performedBy: this.addedBy,
    performedAt: new Date(),
    details: {
      usageCount: this.usageCount,
      lastUsedAt: this.lastUsedAt
    }
  });
  
  await this.save();
};

/**
 * Deactivate the IP whitelist entry
 * @param {ObjectId} userId - User performing the action
 * @param {string} reason - Reason for deactivation
 * @returns {Promise<void>}
 */
ipWhitelistSchema.methods.deactivate = async function(userId, reason = null) {
  this.isActive = false;
  this.modifiedBy = userId;
  
  // Add to audit log
  this.auditLog.push({
    action: 'deactivated',
    performedBy: userId,
    performedAt: new Date(),
    details: {
      reason,
      previousState: 'active'
    }
  });
  
  await this.save();
};

/**
 * Extend the validity period of the IP whitelist entry
 * @param {Date} newValidUntil - New expiration date
 * @param {ObjectId} userId - User performing the action
 * @returns {Promise<void>}
 */
ipWhitelistSchema.methods.extendValidity = async function(newValidUntil, userId) {
  const previousValidUntil = this.validUntil;
  this.validUntil = newValidUntil;
  this.modifiedBy = userId;
  
  // Add to audit log
  this.auditLog.push({
    action: 'modified',
    performedBy: userId,
    performedAt: new Date(),
    details: {
      field: 'validUntil',
      previousValue: previousValidUntil,
      newValue: newValidUntil
    }
  });
  
  await this.save();
};

// ==================== Static Methods ====================

/**
 * Find active IP whitelist entries for an IP address
 * @param {string} ip - IP address to check
 * @param {Object} [options] - Query options
 * @returns {Promise<Array>} Matching entries
 */
ipWhitelistSchema.statics.findActiveByIP = function(ip, options = {}) {
  const query = {
    ip: ip,
    isActive: true
  };
  
  // Add time-based filtering
  const now = new Date();
  query.$or = [
    { validFrom: { $lte: now } },
    { validFrom: { $exists: false } }
  ];
  
  query.$and = [
    {
      $or: [
        { validUntil: { $gte: now } },
        { validUntil: { $exists: false } }
      ]
    }
  ];
  
  // Add tenant/organization filtering if provided
  if (options.tenantId) {
    query.tenantId = options.tenantId;
  }
  
  if (options.organizationId) {
    query.organizationId = options.organizationId;
  }
  
  return this.find(query).sort({ priority: -1 });
};

/**
 * Find expired entries that need cleanup
 * @returns {Promise<Array>} Expired entries
 */
ipWhitelistSchema.statics.findExpired = function() {
  const now = new Date();
  
  return this.find({
    isActive: true,
    validUntil: { $lt: now }
  });
};

/**
 * Clean up expired entries
 * @returns {Promise<Object>} Cleanup result
 */
ipWhitelistSchema.statics.cleanupExpired = async function() {
  const expiredEntries = await this.findExpired();
  
  if (expiredEntries.length === 0) {
    return { cleaned: 0 };
  }
  
  // Deactivate expired entries
  const result = await this.updateMany(
    {
      isActive: true,
      validUntil: { $lt: new Date() }
    },
    {
      $set: { isActive: false },
      $push: {
        auditLog: {
          action: 'expired',
          performedBy: null,
          performedAt: new Date(),
          details: {
            reason: 'automatic_cleanup',
            expiredAt: new Date()
          }
        }
      }
    }
  );
  
  logger.info('IP whitelist cleanup completed', {
    expiredEntries: expiredEntries.length,
    cleaned: result.modifiedCount
  });
  
  return {
    expired: expiredEntries.length,
    cleaned: result.modifiedCount
  };
};

/**
 * Get usage statistics
 * @param {Object} [filters] - Optional filters
 * @returns {Promise<Object>} Usage statistics
 */
ipWhitelistSchema.statics.getUsageStats = async function(filters = {}) {
  const pipeline = [
    {
      $match: {
        isActive: true,
        ...filters
      }
    },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        totalUsage: { $sum: '$usageCount' },
        activeEntries: {
          $sum: {
            $cond: [
              { $ne: ['$lastUsedAt', null] },
              1,
              0
            ]
          }
        },
        emergencyEntries: {
          $sum: {
            $cond: [
              { $eq: ['$isEmergencyAccess', true] },
              1,
              0
            ]
          }
        }
      }
    }
  ];
  
  const results = await this.aggregate(pipeline);
  return results[0] || {
    totalEntries: 0,
    totalUsage: 0,
    activeEntries: 0,
    emergencyEntries: 0
  };
};

// ==================== Middleware ====================

/**
 * Pre-save middleware for validation and audit
 */
ipWhitelistSchema.pre('save', function(next) {
  // Validate IP format based on type
  if (this.type === 'single' && !validateIP(this.ip)) {
    return next(new AppError('Invalid IP address format', 400));
  }
  
  if (this.type === 'range' && !validateCIDR(this.ip)) {
    return next(new AppError('Invalid CIDR range format', 400));
  }
  
  // Set default priority based on type
  if (!this.priority) {
    this.priority = this.type === 'single' ? 100 : 200;
  }
  
  // Ensure audit log entry for new documents
  if (this.isNew && this.addedBy) {
    this.auditLog.push({
      action: 'created',
      performedBy: this.addedBy,
      performedAt: new Date(),
      details: {
        ip: this.ip,
        type: this.type,
        description: this.description
      }
    });
  }
  
  next();
});

/**
 * Post-save middleware for cache invalidation
 */
ipWhitelistSchema.post('save', function(doc) {
  // Clear relevant caches
  logger.debug('IP whitelist entry saved', {
    id: doc._id,
    ip: doc.ip,
    type: doc.type,
    isActive: doc.isActive
  });
});

/**
 * Pre-remove middleware for audit trail
 */
ipWhitelistSchema.pre('deleteOne', { document: true, query: false }, function(next) {
  logger.info('IP whitelist entry being removed', {
    id: this._id,
    ip: this.ip,
    type: this.type
  });
  next();
});

// ==================== Virtual Properties ====================

/**
 * Virtual property for entry status
 */
ipWhitelistSchema.virtual('status').get(function() {
  const now = new Date();
  
  if (!this.isActive) {
    return 'inactive';
  }
  
  if (this.validFrom && this.validFrom > now) {
    return 'pending';
  }
  
  if (this.validUntil && this.validUntil < now) {
    return 'expired';
  }
  
  if (this.maxUsage && this.usageCount >= this.maxUsage) {
    return 'exhausted';
  }
  
  return 'active';
});

/**
 * Virtual property for remaining usage
 */
ipWhitelistSchema.virtual('remainingUsage').get(function() {
  if (!this.maxUsage) {
    return null;
  }
  
  return Math.max(0, this.maxUsage - this.usageCount);
});

// ==================== JSON Transform ====================

/**
 * Transform function for JSON serialization
 */
ipWhitelistSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Include virtual fields
    ret.status = doc.status;
    ret.remainingUsage = doc.remainingUsage;
    
    // Remove sensitive fields in some contexts
    if (!doc.$includeAuditLog) {
      delete ret.auditLog;
    }
    
    return ret;
  },
  virtuals: true
});

// Create and export the model
const IpWhitelistModel = BaseModel.createModel('IpWhitelist', ipWhitelistSchema);

module.exports = IpWhitelistModel;