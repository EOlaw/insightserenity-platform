/**
 * @fileoverview Admin MFA (Multi-Factor Authentication) Model
 * @module shared/lib/database/models/admin-server/admin-mfa
 * @description Mongoose model for managing admin multi-factor authentication configurations,
 *              including TOTP, SMS, email, and backup codes with comprehensive security tracking.
 * @version 1.0.0
 * @requires mongoose
 * @requires crypto
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * @constant {number} BACKUP_CODE_COUNT - Number of backup codes to generate
 */
const BACKUP_CODE_COUNT = 10;

/**
 * @constant {number} BACKUP_CODE_LENGTH - Length of each backup code
 */
const BACKUP_CODE_LENGTH = 8;

/**
 * Admin MFA Schema
 * @typedef {Object} AdminMFASchema
 * @description Schema for admin MFA configurations and verification tracking
 */
const adminMFASchema = new mongoose.Schema(
  {
    // ============================================================================
    // Core References
    // ============================================================================

    /**
     * @property {mongoose.Schema.Types.ObjectId} adminUser - Reference to AdminUser
     * @required
     * @unique
     * @index
     */
    adminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: [true, 'Admin user reference is required'],
      unique: true,
      index: true
    },

    // ============================================================================
    // MFA Configuration
    // ============================================================================

    /**
     * @property {boolean} isEnabled - Whether MFA is enabled
     * @required
     */
    isEnabled: {
      type: Boolean,
      required: true,
      default: false
    },

    /**
     * @property {string} primaryMethod - Primary MFA method
     * @enum {string} - totp, sms, email
     */
    primaryMethod: {
      type: String,
      enum: {
        values: ['totp', 'sms', 'email', null],
        message: '{VALUE} is not a valid MFA method'
      },
      default: null
    },

    /**
     * @property {Array<string>} enabledMethods - All enabled MFA methods
     */
    enabledMethods: {
      type: [String],
      default: [],
      validate: {
        validator: function(methods) {
          const validMethods = ['totp', 'sms', 'email'];
          return methods.every(m => validMethods.includes(m));
        },
        message: 'Invalid MFA method in enabled methods'
      }
    },

    /**
     * @property {Date} enabledAt - When MFA was first enabled
     */
    enabledAt: {
      type: Date
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} enabledBy - Admin who enabled MFA
     */
    enabledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    // ============================================================================
    // TOTP Configuration
    // ============================================================================

    /**
     * @property {Object} totp - TOTP (Time-based One-Time Password) configuration
     */
    totp: {
      /**
       * @property {string} secret - Base32 encoded TOTP secret
       * @private
       */
      secret: {
        type: String,
        select: false
      },

      /**
       * @property {boolean} isVerified - Whether TOTP has been verified
       */
      isVerified: {
        type: Boolean,
        default: false
      },

      /**
       * @property {Date} verifiedAt - When TOTP was verified
       */
      verifiedAt: Date,

      /**
       * @property {string} algorithm - TOTP algorithm (SHA1, SHA256, SHA512)
       */
      algorithm: {
        type: String,
        enum: ['SHA1', 'SHA256', 'SHA512'],
        default: 'SHA1'
      },

      /**
       * @property {number} digits - Number of digits in code
       */
      digits: {
        type: Number,
        default: 6,
        min: 6,
        max: 8
      },

      /**
       * @property {number} period - Time period in seconds
       */
      period: {
        type: Number,
        default: 30,
        min: 15,
        max: 60
      },

      /**
       * @property {string} issuer - TOTP issuer name
       */
      issuer: {
        type: String,
        default: 'InsightSerenity Admin'
      },

      /**
       * @property {Date} lastUsed - Last time TOTP was used
       */
      lastUsed: Date
    },

    // ============================================================================
    // SMS Configuration
    // ============================================================================

    /**
     * @property {Object} sms - SMS-based MFA configuration
     */
    sms: {
      /**
       * @property {string} phoneNumber - Verified phone number
       */
      phoneNumber: {
        type: String,
        sparse: true
      },

      /**
       * @property {boolean} isVerified - Whether phone number is verified
       */
      isVerified: {
        type: Boolean,
        default: false
      },

      /**
       * @property {Date} verifiedAt - When phone number was verified
       */
      verifiedAt: Date,

      /**
       * @property {Date} lastSent - Last time SMS code was sent
       */
      lastSent: Date,

      /**
       * @property {number} sentCount - Number of SMS sent today
       */
      sentCount: {
        type: Number,
        default: 0,
        min: 0
      },

      /**
       * @property {Date} sentCountResetAt - When sent count was last reset
       */
      sentCountResetAt: Date
    },

    // ============================================================================
    // Email Configuration
    // ============================================================================

    /**
     * @property {Object} email - Email-based MFA configuration
     */
    email: {
      /**
       * @property {string} emailAddress - Verified email for MFA
       */
      emailAddress: {
        type: String,
        sparse: true,
        lowercase: true
      },

      /**
       * @property {boolean} isVerified - Whether email is verified
       */
      isVerified: {
        type: Boolean,
        default: false
      },

      /**
       * @property {Date} verifiedAt - When email was verified
       */
      verifiedAt: Date,

      /**
       * @property {Date} lastSent - Last time email code was sent
       */
      lastSent: Date,

      /**
       * @property {number} sentCount - Number of emails sent today
       */
      sentCount: {
        type: Number,
        default: 0,
        min: 0
      },

      /**
       * @property {Date} sentCountResetAt - When sent count was last reset
       */
      sentCountResetAt: Date
    },

    // ============================================================================
    // Backup Codes
    // ============================================================================

    /**
     * @property {Array<Object>} backupCodes - Recovery backup codes
     * @private
     */
    backupCodes: {
      type: [{
        codeHash: {
          type: String,
          required: true
        },
        usedAt: Date,
        isUsed: {
          type: Boolean,
          default: false
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }],
      select: false,
      default: []
    },

    /**
     * @property {Date} backupCodesGeneratedAt - When backup codes were last generated
     */
    backupCodesGeneratedAt: Date,

    // ============================================================================
    // Verification Tracking
    // ============================================================================

    /**
     * @property {Array<Object>} verificationHistory - History of MFA verifications
     */
    verificationHistory: {
      type: [{
        method: {
          type: String,
          enum: ['totp', 'sms', 'email', 'backup_code'],
          required: true
        },
        success: {
          type: Boolean,
          required: true
        },
        ipAddress: String,
        userAgent: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        failureReason: String
      }],
      default: [],
      validate: {
        validator: function(history) {
          return history.length <= 100;
        },
        message: 'Verification history cannot exceed 100 entries'
      }
    },

    /**
     * @property {number} consecutiveFailures - Consecutive failed verification attempts
     */
    consecutiveFailures: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Date} lastVerificationAttempt - Last verification attempt timestamp
     */
    lastVerificationAttempt: Date,

    /**
     * @property {Date} lastSuccessfulVerification - Last successful verification
     */
    lastSuccessfulVerification: Date,

    // ============================================================================
    // Security & Rate Limiting
    // ============================================================================

    /**
     * @property {boolean} isLocked - Whether MFA is temporarily locked
     */
    isLocked: {
      type: Boolean,
      default: false
    },

    /**
     * @property {Date} lockedUntil - When MFA lock expires
     */
    lockedUntil: Date,

    /**
     * @property {string} lockReason - Reason for MFA lock
     */
    lockReason: String,

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
    collection: 'admin_mfa',
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.totp?.secret;
        delete ret.backupCodes;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ============================================================================
// Virtual Properties
// ============================================================================

adminMFASchema.virtual('unusedBackupCodesCount').get(function() {
  if (!this.backupCodes) return 0;
  return this.backupCodes.filter(code => !code.isUsed).length;
});

adminMFASchema.virtual('isCurrentlyLocked').get(function() {
  return this.isLocked && this.lockedUntil && this.lockedUntil > Date.now();
});

// ============================================================================
// Indexes
// ============================================================================

adminMFASchema.index({ adminUser: 1 });
adminMFASchema.index({ isEnabled: 1 });
adminMFASchema.index({ lockedUntil: 1 });

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Generate new backup codes
 * @returns {Array<string>} Plain text backup codes (for display to user)
 */
adminMFASchema.methods.generateBackupCodes = function() {
  const codes = [];
  this.backupCodes = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // Generate random code
    const code = crypto
      .randomBytes(BACKUP_CODE_LENGTH / 2)
      .toString('hex')
      .toUpperCase()
      .match(/.{1,4}/g)
      .join('-'); // Format: XXXX-XXXX

    // Hash and store
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    this.backupCodes.push({
      codeHash: hash,
      isUsed: false,
      createdAt: new Date()
    });

    codes.push(code);
  }

  this.backupCodesGeneratedAt = new Date();
  return codes;
};

/**
 * Verify backup code
 * @param {string} code - Backup code to verify
 * @returns {boolean} True if code is valid and unused
 */
adminMFASchema.methods.verifyBackupCode = async function(code) {
  const hash = crypto.createHash('sha256').update(code.replace(/-/g, '')).digest('hex');

  const backupCode = this.backupCodes.find(
    bc => bc.codeHash === hash && !bc.isUsed
  );

  if (backupCode) {
    backupCode.isUsed = true;
    backupCode.usedAt = new Date();
    await this.save();
    return true;
  }

  return false;
};

/**
 * Record verification attempt
 * @param {string} method - MFA method used
 * @param {boolean} success - Whether verification succeeded
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent
 * @param {string} failureReason - Reason for failure (if applicable)
 */
adminMFASchema.methods.recordVerification = async function(
  method,
  success,
  ipAddress,
  userAgent,
  failureReason = null
) {
  this.verificationHistory.push({
    method,
    success,
    ipAddress,
    userAgent,
    timestamp: new Date(),
    failureReason
  });

  // Keep only last 100 entries
  if (this.verificationHistory.length > 100) {
    this.verificationHistory = this.verificationHistory.slice(-100);
  }

  this.lastVerificationAttempt = new Date();

  if (success) {
    this.consecutiveFailures = 0;
    this.lastSuccessfulVerification = new Date();
  } else {
    this.consecutiveFailures += 1;

    // Lock after 5 consecutive failures
    if (this.consecutiveFailures >= 5) {
      this.isLocked = true;
      this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      this.lockReason = 'Too many failed verification attempts';
    }
  }

  return this.save();
};

/**
 * Unlock MFA
 */
adminMFASchema.methods.unlock = async function() {
  this.isLocked = false;
  this.lockedUntil = null;
  this.lockReason = null;
  this.consecutiveFailures = 0;
  return this.save();
};

// ============================================================================
// Static Methods
// ============================================================================

adminMFASchema.statics.findByAdminUser = function(adminUserId) {
  return this.findOne({ adminUser: adminUserId });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminMFASchema,
  modelName: 'AdminMFA'
};
