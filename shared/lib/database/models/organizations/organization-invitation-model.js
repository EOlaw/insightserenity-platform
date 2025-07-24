'use strict';

/**
 * @fileoverview Organization invitation model for managing member invitations
 * @module shared/lib/database/models/organizations/organization-invitation-model
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
 * Organization invitation schema definition
 */
const organizationInvitationSchemaDefinition = {
  // Invitation Details
  invitationToken: {
    type: String,
    required: true,
    unique: true,
    index: true,
    select: false
  },

  invitationCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Organization
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  organizationName: {
    type: String,
    required: true
  },

  // Invitee Information
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },

  firstName: String,
  lastName: String,

  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Role and Permissions
  role: {
    type: String,
    required: true,
    enum: ['admin', 'manager', 'member', 'viewer'],
    default: 'member'
  },

  permissions: [String],

  department: String,
  title: String,

  // Invitation Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'accepted', 'declined', 'expired', 'cancelled', 'bounced'],
    default: 'pending',
    index: true
  },

  // Sender Information
  invitedBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: String,
    email: String,
    role: String
  },

  // Timing
  sentAt: Date,
  
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },

  acceptedAt: Date,
  declinedAt: Date,

  // Response Tracking
  responseMetadata: {
    ipAddress: String,
    userAgent: String,
    location: String,
    device: String
  },

  // Email Tracking
  emailStatus: {
    sent: {
      type: Boolean,
      default: false
    },
    delivered: {
      type: Boolean,
      default: false
    },
    opened: {
      type: Boolean,
      default: false
    },
    clicked: {
      type: Boolean,
      default: false
    },
    bounced: {
      type: Boolean,
      default: false
    },
    lastEventAt: Date
  },

  // Reminder Management
  reminders: [{
    sentAt: Date,
    type: {
      type: String,
      enum: ['email', 'in_app']
    }
  }],

  maxReminders: {
    type: Number,
    default: 3
  },

  // Custom Message
  customMessage: {
    type: String,
    maxlength: 1000
  },

  // Team Assignment
  teams: [String],
  projects: [{
    projectId: mongoose.Schema.Types.ObjectId,
    role: String
  }],

  // Access Configuration
  accessConfig: {
    startDate: Date,
    endDate: Date,
    temporaryAccess: {
      type: Boolean,
      default: false
    },
    restrictedAccess: [String]
  },

  // Invitation Type
  type: {
    type: String,
    enum: ['standard', 'guest', 'contractor', 'partner'],
    default: 'standard'
  },

  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'bulk', 'api', 'integration']
    },
    campaign: String,
    referrer: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  },

  // Bulk Invitation Reference
  bulkInvitationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BulkInvitation'
  },

  // Security
  requiresApproval: {
    type: Boolean,
    default: false
  },

  approvedBy: {
    userId: mongoose.Schema.Types.ObjectId,
    approvedAt: Date
  },

  // Notes
  internalNotes: {
    type: String,
    maxlength: 500,
    select: false
  },

  declineReason: String,

  // Onboarding
  onboardingConfig: {
    skipTutorial: {
      type: Boolean,
      default: false
    },
    assignedMentor: mongoose.Schema.Types.ObjectId,
    welcomeMessage: String,
    requiredActions: [String]
  }
};

// Create schema
const organizationInvitationSchema = BaseModel.createSchema(organizationInvitationSchemaDefinition, {
  collection: 'organization_invitations',
  timestamps: true
});

// Indexes
organizationInvitationSchema.index({ organizationId: 1, email: 1 });
organizationInvitationSchema.index({ 'invitedBy.userId': 1 });
organizationInvitationSchema.index({ status: 1, expiresAt: 1 });
organizationInvitationSchema.index({ bulkInvitationId: 1 });

// Virtual fields
organizationInvitationSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && this.expiresAt < new Date();
});

organizationInvitationSchema.virtual('isActive').get(function() {
  return this.status === 'pending' && this.expiresAt > new Date();
});

organizationInvitationSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.isActive) return 0;
  
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

organizationInvitationSchema.virtual('reminderCount').get(function() {
  return this.reminders ? this.reminders.length : 0;
});

// Pre-save middleware
organizationInvitationSchema.pre('save', async function(next) {
  try {
    // Generate invitation token and code if new
    if (this.isNew) {
      const token = stringHelper.generateRandomString(32);
      this.invitationToken = await HashService.hashToken(token);
      this.invitationCode = await this.constructor.generateInvitationCode();
      
      // Set default expiration (7 days)
      if (!this.expiresAt) {
        this.expiresAt = new Date();
        this.expiresAt.setDate(this.expiresAt.getDate() + 7);
      }
    }

    // Check if invitation expired
    if (this.isModified('status') && this.isExpired) {
      this.status = 'expired';
    }

    // Update email status
    if (this.emailStatus.bounced) {
      this.status = 'bounced';
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
organizationInvitationSchema.methods.send = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Invitation has already been processed', 400, 'INVALID_STATUS');
  }

  this.sentAt = new Date();
  this.emailStatus.sent = true;
  
  await this.save();

  // TODO: Integrate with email service
  logger.info('Organization invitation sent', {
    invitationCode: this.invitationCode,
    email: this.email,
    organizationId: this.organizationId
  });

  return this;
};

organizationInvitationSchema.methods.accept = async function(userId, metadata = {}) {
  if (this.status !== 'pending') {
    throw new AppError('Invitation is no longer valid', 400, 'INVALID_INVITATION');
  }

  if (this.isExpired) {
    throw new AppError('Invitation has expired', 400, 'EXPIRED_INVITATION');
  }

  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.recipientUserId = userId;
  this.responseMetadata = metadata;

  await this.save();

  // Add user to organization
  const Organization = mongoose.model('Organization');
  const organization = await Organization.findById(this.organizationId);
  
  if (!organization) {
    throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
  }

  await organization.addMember(userId, this.role, this.invitedBy.userId);

  logger.info('Organization invitation accepted', {
    invitationCode: this.invitationCode,
    userId,
    organizationId: this.organizationId
  });

  return this;
};

organizationInvitationSchema.methods.decline = async function(reason, metadata = {}) {
  if (this.status !== 'pending') {
    throw new AppError('Invitation is no longer valid', 400, 'INVALID_INVITATION');
  }

  this.status = 'declined';
  this.declinedAt = new Date();
  this.declineReason = reason;
  this.responseMetadata = metadata;

  await this.save();

  logger.info('Organization invitation declined', {
    invitationCode: this.invitationCode,
    reason
  });

  return this;
};

organizationInvitationSchema.methods.cancel = async function(cancelledBy) {
  if (!['pending', 'accepted'].includes(this.status)) {
    throw new AppError('Invitation cannot be cancelled', 400, 'CANNOT_CANCEL');
  }

  this.status = 'cancelled';
  
  await this.save();

  logger.info('Organization invitation cancelled', {
    invitationCode: this.invitationCode,
    cancelledBy
  });

  return this;
};

organizationInvitationSchema.methods.resend = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Only pending invitations can be resent', 400, 'INVALID_STATUS');
  }

  if (this.isExpired) {
    // Extend expiration
    this.expiresAt = new Date();
    this.expiresAt.setDate(this.expiresAt.getDate() + 7);
    this.status = 'pending';
  }

  await this.send();

  return this;
};

organizationInvitationSchema.methods.sendReminder = async function() {
  if (this.status !== 'pending') {
    throw new AppError('Only pending invitations can receive reminders', 400, 'INVALID_STATUS');
  }

  if (this.reminderCount >= this.maxReminders) {
    throw new AppError('Maximum reminders sent', 400, 'MAX_REMINDERS_REACHED');
  }

  if (!this.reminders) {
    this.reminders = [];
  }

  this.reminders.push({
    sentAt: new Date(),
    type: 'email'
  });

  await this.save();

  // TODO: Send reminder email
  logger.info('Invitation reminder sent', {
    invitationCode: this.invitationCode,
    reminderCount: this.reminderCount
  });

  return this;
};

organizationInvitationSchema.methods.updateEmailStatus = async function(event) {
  const validEvents = ['delivered', 'opened', 'clicked', 'bounced'];
  
  if (!validEvents.includes(event)) {
    throw new AppError('Invalid email event', 400, 'INVALID_EVENT');
  }

  this.emailStatus[event] = true;
  this.emailStatus.lastEventAt = new Date();

  await this.save();

  return this;
};

organizationInvitationSchema.methods.approve = async function(approvedBy) {
  if (!this.requiresApproval) {
    throw new AppError('Invitation does not require approval', 400, 'NO_APPROVAL_REQUIRED');
  }

  if (this.approvedBy?.userId) {
    throw new AppError('Invitation already approved', 400, 'ALREADY_APPROVED');
  }

  this.approvedBy = {
    userId: approvedBy,
    approvedAt: new Date()
  };

  await this.save();
  
  // Send invitation after approval
  await this.send();

  return this;
};

organizationInvitationSchema.methods.verifyToken = async function(token) {
  const hashedToken = await HashService.hashToken(token);
  return hashedToken === this.invitationToken;
};

// Static methods
organizationInvitationSchema.statics.generateInvitationCode = async function() {
  let code;
  let exists = true;

  while (exists) {
    code = stringHelper.generateRandomString(8).toUpperCase();
    exists = await this.exists({ invitationCode: code });
  }

  return code;
};

organizationInvitationSchema.statics.findByToken = async function(token) {
  const hashedToken = await HashService.hashToken(token);
  
  return await this.findOne({
    invitationToken: hashedToken,
    status: 'pending'
  }).select('+invitationToken');
};

organizationInvitationSchema.statics.findByCode = async function(code) {
  return await this.findOne({
    invitationCode: code.toUpperCase(),
    status: 'pending'
  });
};

organizationInvitationSchema.statics.findPendingByEmail = async function(email, organizationId) {
  const query = {
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  };

  if (organizationId) {
    query.organizationId = organizationId;
  }

  return await this.find(query);
};

organizationInvitationSchema.statics.bulkCreate = async function(invitations, invitedBy) {
  const bulkOps = invitations.map(invitation => ({
    insertOne: {
      document: {
        ...invitation,
        invitedBy: {
          userId: invitedBy.userId,
          name: invitedBy.name,
          email: invitedBy.email,
          role: invitedBy.role
        },
        status: 'pending'
      }
    }
  }));

  const result = await this.bulkWrite(bulkOps);

  logger.info('Bulk invitations created', {
    count: result.insertedCount,
    organizationId: invitations[0]?.organizationId
  });

  return result;
};

organizationInvitationSchema.statics.getExpiringInvitations = async function(daysBefore = 2) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysBefore);

  return await this.find({
    status: 'pending',
    expiresAt: {
      $gte: startDate,
      $lte: endDate
    },
    reminderCount: { $lt: '$maxReminders' }
  });
};

organizationInvitationSchema.statics.expireOldInvitations = async function() {
  const result = await this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      status: 'expired'
    }
  );

  if (result.modifiedCount > 0) {
    logger.info('Expired invitations updated', {
      count: result.modifiedCount
    });
  }

  return result.modifiedCount;
};

organizationInvitationSchema.statics.getInvitationStatistics = async function(organizationId, period) {
  const { startDate, endDate } = period;
  
  const matchQuery = {
    organizationId,
    createdAt: { $gte: startDate, $lte: endDate }
  };

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
        },
        declined: {
          $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
        },
        expired: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
        },
        byRole: {
          $push: {
            role: '$role',
            status: '$status'
          }
        },
        avgAcceptanceTime: {
          $avg: {
            $cond: [
              { $eq: ['$status', 'accepted'] },
              { $subtract: ['$acceptedAt', '$createdAt'] },
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        pending: 1,
        accepted: 1,
        declined: 1,
        expired: 1,
        acceptanceRate: {
          $multiply: [
            { $divide: ['$accepted', '$total'] },
            100
          ]
        },
        avgAcceptanceTime: {
          $divide: ['$avgAcceptanceTime', 1000 * 60 * 60 * 24] // Convert to days
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    pending: 0,
    accepted: 0,
    declined: 0,
    expired: 0,
    acceptanceRate: 0,
    avgAcceptanceTime: 0
  };
};

organizationInvitationSchema.statics.sendPendingInvitations = async function() {
  const pendingInvitations = await this.find({
    status: 'pending',
    sentAt: null,
    'emailStatus.sent': false,
    $or: [
      { requiresApproval: false },
      { 'approvedBy.userId': { $exists: true } }
    ]
  }).limit(100);

  let sentCount = 0;

  for (const invitation of pendingInvitations) {
    try {
      await invitation.send();
      sentCount++;
    } catch (error) {
      logger.error('Failed to send invitation', {
        invitationId: invitation._id,
        error: error.message
      });
    }
  }

  return sentCount;
};

// Create and export model
const OrganizationInvitationModel = BaseModel.createModel('OrganizationInvitation', organizationInvitationSchema);

module.exports = {
  schema: organizationInvitationSchema,
  model: OrganizationInvitationModel
};