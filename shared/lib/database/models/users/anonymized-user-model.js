'use strict';

/**
 * @fileoverview Anonymized user data model for GDPR compliance
 * @module shared/lib/database/models/anonymized-user-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');

/**
 * Anonymized user schema definition
 */
const anonymizedUserSchemaDefinition = {
  // Original user reference (kept for legal/audit purposes)
  originalUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Anonymization details
  anonymizationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  anonymizedAt: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  anonymizationMethod: {
    type: String,
    required: true,
    enum: ['deletion', 'hashing', 'encryption', 'pseudonymization', 'generalization', 'suppression']
  },

  // Preserved data (non-identifiable)
  preservedData: {
    country: String,
    yearOfBirth: Number,
    accountCreatedYear: Number,
    lastActiveYear: Number,
    organizationId: mongoose.Schema.Types.ObjectId,
    subscriptionType: String,
    accountType: String,
    totalOrders: Number,
    lifetimeValue: Number,
    dataCategories: [String]
  },

  // Pseudonymized identifiers
  pseudonyms: {
    email: String,
    username: String,
    displayName: String,
    customerId: String
  },

  // Legal/compliance data
  legalRetention: {
    required: {
      type: Boolean,
      default: false
    },
    reason: String,
    categories: [String],
    retentionUntil: Date
  },

  // Anonymization request details
  requestDetails: {
    requestedBy: {
      type: String,
      enum: ['user', 'admin', 'system', 'legal']
    },
    requestedAt: Date,
    reason: String,
    ticketId: String
  },

  // Fields that were anonymized
  anonymizedFields: [{
    fieldName: String,
    originalType: String,
    anonymizationType: String,
    wasDeleted: Boolean
  }],

  // Metadata
  metadata: {
    gdprCompliant: {
      type: Boolean,
      default: true
    },
    dataMinimization: {
      type: Boolean,
      default: true
    },
    version: {
      type: String,
      default: '1.0'
    }
  },

  // Audit trail
  verificationHash: {
    type: String,
    required: true
  },

  // Expiration for fully anonymized data
  expiresAt: {
    type: Date,
    index: true
  }
};

// Create schema
const anonymizedUserSchema = BaseModel.createSchema(anonymizedUserSchemaDefinition, {
  collection: 'anonymized_users',
  timestamps: true
});

// Indexes
anonymizedUserSchema.index({ anonymizedAt: -1 });
anonymizedUserSchema.index({ 'legalRetention.retentionUntil': 1 });
anonymizedUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
anonymizedUserSchema.methods.canBeDeleted = function() {
  if (this.legalRetention.required) {
    return this.legalRetention.retentionUntil < new Date();
  }
  return true;
};

anonymizedUserSchema.methods.addAnonymizedField = function(fieldName, originalType, anonymizationType, wasDeleted = false) {
  this.anonymizedFields.push({
    fieldName,
    originalType,
    anonymizationType,
    wasDeleted
  });
};

// Static methods
anonymizedUserSchema.statics.findByOriginalUserId = async function(userId) {
  return await this.find({ originalUserId: userId }).sort({ anonymizedAt: -1 });
};

anonymizedUserSchema.statics.countByMethod = async function(startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match.anonymizedAt = {};
    if (startDate) match.anonymizedAt.$gte = startDate;
    if (endDate) match.anonymizedAt.$lte = endDate;
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$anonymizationMethod',
        count: { $sum: 1 }
      }
    }
  ]);
};

anonymizedUserSchema.statics.findExpiredRetentions = async function() {
  return await this.find({
    'legalRetention.required': true,
    'legalRetention.retentionUntil': { $lt: new Date() }
  });
};

// Create and export model
const AnonymizedUser = BaseModel.createModel('AnonymizedUser', anonymizedUserSchema);

module.exports = AnonymizedUser;