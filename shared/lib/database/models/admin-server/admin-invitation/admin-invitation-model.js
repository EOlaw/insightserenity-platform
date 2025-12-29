/**
 * @fileoverview Admin Invitation Model
 * @module shared/lib/database/models/admin-server/admin-invitation
 * @description Mongoose model for inviting new admin users with secure token-based system.
 * @version 1.0.0
 * @requires mongoose
 * @requires crypto
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const validator = require('validator');

/**
 * @constant {number} INVITATION_EXPIRY_DAYS - Days until invitation expires
 */
const INVITATION_EXPIRY_DAYS = 7;

/**
 * Admin Invitation Schema
 * @typedef {Object} AdminInvitationSchema
 */
const adminInvitationSchema = new mongoose.Schema(
  {
    /**
     * @property {string} email - Invitee email address
     * @required
     * @index
     */
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (email) => validator.isEmail(email),
        message: 'Invalid email format'
      }
    },

    /**
     * @property {string} firstName - Invitee first name
     */
    firstName: {
      type: String,
      trim: true
    },

    /**
     * @property {string} lastName - Invitee last name
     */
    lastName: {
      type: String,
      trim: true
    },

    /**
     * @property {string} role - Assigned role
     * @required
     */
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: ['superadmin', 'admin', 'support', 'analyst', 'viewer'],
      default: 'viewer'
    },

    /**
     * @property {Array<string>} permissions - Direct permissions
     */
    permissions: {
      type: [String],
      default: []
    },

    /**
     * @property {string} department - Department assignment
     */
    department: {
      type: String,
      trim: true
    },

    /**
     * @property {string} invitationToken - Secure invitation token
     * @private
     */
    invitationToken: {
      type: String,
      required: true,
      unique: true,
      select: false
    },

    /**
     * @property {Date} expiresAt - Invitation expiry
     * @required
     * @index
     */
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    /**
     * @property {string} status - Invitation status
     * @enum {string}
     */
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
      index: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} invitedBy - Admin who sent invitation
     * @required
     */
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: [true, 'Inviter reference is required']
    },

    /**
     * @property {Date} acceptedAt - When invitation was accepted
     */
    acceptedAt: Date,

    /**
     * @property {mongoose.Schema.Types.ObjectId} acceptedAdminUser - Created admin user
     */
    acceptedAdminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {Date} revokedAt - When invitation was revoked
     */
    revokedAt: Date,

    /**
     * @property {mongoose.Schema.Types.ObjectId} revokedBy - Admin who revoked
     */
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {string} revocationReason - Reason for revocation
     */
    revocationReason: String,

    /**
     * @property {string} message - Custom invitation message
     */
    message: {
      type: String,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },

    /**
     * @property {number} resendCount - Number of times invitation was resent
     */
    resendCount: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Date} lastResent - Last resend timestamp
     */
    lastResent: Date,

    /**
     * @property {Object} metadata - Additional metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'admin_invitations',
    toJSON: {
      transform: function(doc, ret) {
        delete ret.invitationToken;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ============================================================================
// Indexes
// ============================================================================

adminInvitationSchema.index({ email: 1, status: 1 });
adminInvitationSchema.index({ invitedBy: 1, createdAt: -1 });
adminInvitationSchema.index({ expiresAt: 1 });

// TTL index for auto-cleanup of expired invitations
adminInvitationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // Delete 30 days after expiry
    partialFilterExpression: { status: { $in: ['expired', 'revoked'] } }
  }
);

// ============================================================================
// Virtual Properties
// ============================================================================

adminInvitationSchema.virtual('isExpired').get(function() {
  return this.status === 'expired' || this.expiresAt < Date.now();
});

adminInvitationSchema.virtual('isValid').get(function() {
  return this.status === 'pending' && !this.isExpired;
});

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Generate invitation token
 * @returns {string} Plain text token
 */
adminInvitationSchema.methods.generateToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.invitationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return token;
};

/**
 * Accept invitation
 * @param {mongoose.Schema.Types.ObjectId} adminUserId - Created admin user ID
 */
adminInvitationSchema.methods.accept = async function(adminUserId) {
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.acceptedAdminUser = adminUserId;
  return this.save();
};

/**
 * Revoke invitation
 * @param {mongoose.Schema.Types.ObjectId} revokedBy - Admin revoking
 * @param {string} reason - Revocation reason
 */
adminInvitationSchema.methods.revoke = async function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  return this.save();
};

/**
 * Resend invitation
 */
adminInvitationSchema.methods.resend = async function() {
  const newToken = this.generateToken();
  this.resendCount += 1;
  this.lastResent = new Date();
  await this.save();
  return newToken;
};

// ============================================================================
// Static Methods
// ============================================================================

adminInvitationSchema.statics.findByToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return this.findOne({
    invitationToken: hashedToken,
    status: 'pending',
    expiresAt: { $gt: Date.now() }
  }).select('+invitationToken');
};

adminInvitationSchema.statics.findPendingByEmail = function(email) {
  return this.findOne({
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: Date.now() }
  });
};

adminInvitationSchema.statics.expireOld = function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: Date.now() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminInvitationSchema,
  modelName: 'AdminInvitation'
};
