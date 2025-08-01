'use strict';

/**
 * @fileoverview GDPR consent tracking model for recording user consent decisions
 * @module shared/lib/database/models/consent-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');

/**
 * Consent schema definition for GDPR compliance
 */
const consentSchemaDefinition = {
  // Unique consent identifier
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // User who gave consent
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Type of consent
  type: {
    type: String,
    required: true,
    enum: ['marketing', 'analytics', 'cookies', 'third-party-sharing', 'profiling', 'data-processing'],
    index: true
  },

  // Whether consent was granted
  granted: {
    type: Boolean,
    required: true,
    default: false
  },

  // Purpose of data processing
  purpose: {
    type: String,
    required: true,
    maxlength: 500
  },

  // When consent was given
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },

  // When consent expires
  expiresAt: {
    type: Date,
    index: true
  },

  // IP address when consent was given
  ipAddress: {
    type: String,
    required: false
  },

  // User agent when consent was given
  userAgent: {
    type: String,
    required: false
  },

  // Whether consent can be withdrawn
  withdrawable: {
    type: Boolean,
    default: true
  },

  // Withdrawal information
  withdrawn: {
    type: Boolean,
    default: false,
    index: true
  },

  withdrawnAt: {
    type: Date
  },

  withdrawalReason: {
    type: String,
    maxlength: 500
  },

  // Legal basis for processing
  legalBasis: {
    type: String,
    enum: ['consent', 'contract', 'legal-obligation', 'vital-interests', 'public-task', 'legitimate-interests']
  },

  // Consent version
  version: {
    type: String,
    default: '1.0'
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Data categories covered by this consent
  dataCategories: [{
    type: String,
    enum: ['personal-data', 'sensitive-personal-data', 'criminal-conviction-data', 'children-data', 'biometric-data', 'genetic-data', 'health-data']
  }],

  // Third parties data may be shared with
  thirdParties: [{
    name: String,
    purpose: String,
    country: String
  }],

  // Organization context
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // Consent method
  consentMethod: {
    type: String,
    enum: ['explicit', 'implicit', 'opt-in', 'opt-out', 'checkbox', 'written', 'verbal'],
    default: 'explicit'
  }
};

// Create schema
const consentSchema = BaseModel.createSchema(consentSchemaDefinition, {
  collection: 'consents',
  timestamps: true
});

// Indexes
consentSchema.index({ userId: 1, type: 1, withdrawn: 1 });
consentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
consentSchema.index({ timestamp: -1 });
consentSchema.index({ organizationId: 1, type: 1 });

// Instance methods
consentSchema.methods.isActive = function() {
  if (this.withdrawn) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return this.granted;
};

consentSchema.methods.withdraw = async function(reason) {
  this.withdrawn = true;
  this.withdrawnAt = new Date();
  this.withdrawalReason = reason || 'User requested withdrawal';
  await this.save();
  return this;
};

consentSchema.methods.renew = async function(expiresAt) {
  if (this.withdrawn) {
    throw new Error('Cannot renew withdrawn consent');
  }
  this.expiresAt = expiresAt;
  this.timestamp = new Date();
  await this.save();
  return this;
};

// Static methods
consentSchema.statics.findActiveConsents = async function(userId, type) {
  const query = {
    userId,
    granted: true,
    withdrawn: { $ne: true },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (type) {
    query.type = type;
  }

  return await this.find(query);
};

consentSchema.statics.hasValidConsent = async function(userId, type) {
  const consent = await this.findOne({
    userId,
    type,
    granted: true,
    withdrawn: { $ne: true },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  return !!consent;
};

// Create and export model
const Consent = BaseModel.createModel('Consent', consentSchema);

module.exports = Consent;