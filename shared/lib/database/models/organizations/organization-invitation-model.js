'use strict';

/**
 * @fileoverview Organization invitation model for managing invitations
 * @module shared/lib/database/models/organizations/organization-invitation-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/encryption/hash-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const stringHelper = require('../../../utils/helpers/string-helper');
const validators = require('../../../utils/validators/common-validators');
const HashService = require('../../../security/encryption/hash-service');

/**
 * Organization invitation schema definition
 */
const organizationInvitationSchemaDefinition = {
  // ==================== Core Invitation Details ====================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  invitationType: {
    type: String,
    enum: ['member', 'admin', 'owner_transfer', 'guest', 'partner', 'client'],
    default: 'member',
    index: true
  },

  // ==================== Recipient Information ====================
  recipient: {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      validate: {
        validator: validators.isEmail,
        message: 'Invalid email address'
      }
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      index: true
    },
    phoneNumber: String,
    isExistingUser: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Sender Information ====================
  sender: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: String,
    email: String,
    role: String,
    message: {
      type: String,
      maxlength: 1000
    }
  },

  // ==================== Invitation Details ====================
  invitation: {
    token: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
      index: true
    },
    shortCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    maxUses: {
      type: Number,
      default: 1
    },
    usedCount: {
      type: Number,
      default: 0
    },
    requiresApproval: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Role & Permissions ====================
  access: {
    roles: [{
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
      },
      roleName: {
        type: String,
        required: true
      },
      scope: {
        type: String,
        enum: ['organization', 'department', 'team', 'project'],
        default: 'organization'
      }
    }],
    departments: [{
      departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
      },
      name: String,
      role: String
    }],
    teams: [{
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
      },
      name: String,
      role: String
    }],
    permissions: [{
      resource: String,
      actions: [String],
      conditions: mongoose.Schema.Types.Mixed
    }],
    restrictions: {
      ipWhitelist: [String],
      timeRestrictions: {
        startTime: String,
        endTime: String,
        timezone: String,
        daysOfWeek: [Number]
      },
      dataAccess: {
        type: String,
        enum: ['full', 'limited', 'readonly', 'custom'],
        default: 'limited'
      }
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    state: {
      type: String,
      enum: ['pending', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revoked', 'error'],
      default: 'pending',
      index: true
    },
    sentAt: Date,
    viewedAt: Date,
    acceptedAt: Date,
    declinedAt: Date,
    revokedAt: Date,
    errorDetails: {
      message: String,
      code: String,
      attempts: Number,
      lastAttemptAt: Date
    },
    history: [{
      status: String,
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
      note: String
    }]
  },

  // ==================== Email & Communication ====================
  communication: {
    emailsSent: {
      type: Number,
      default: 0
    },
    lastEmailSentAt: Date,
    remindersSent: {
      type: Number,
      default: 0
    },
    lastReminderAt: Date,
    emailTemplate: {
      type: String,
      enum: ['default', 'custom', 'branded', 'minimal'],
      default: 'default'
    },
    customSubject: String,
    customMessage: String,
    attachments: [{
      name: String,
      url: String,
      type: String,
      size: Number
    }],
    language: {
      type: String,
      default: 'en'
    }
  },

  // ==================== Acceptance Details ====================
  acceptance: {
    acceptedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      email: String,
      name: String
    },
    acceptanceMethod: {
      type: String,
      enum: ['email_link', 'short_code', 'qr_code', 'manual', 'api'],
      default: 'email_link'
    },
    acceptanceIp: String,
    acceptanceUserAgent: String,
    acceptanceLocation: {
      country: String,
      city: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    termsAccepted: {
      accepted: Boolean,
      version: String,
      acceptedAt: Date
    },
    onboardingCompleted: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Onboarding Configuration ====================
  onboarding: {
    required: {
      type: Boolean,
      default: true
    },
    steps: [{
      stepId: String,
      name: String,
      description: String,
      required: Boolean,
      completed: Boolean,
      completedAt: Date,
      data: mongoose.Schema.Types.Mixed
    }],
    customization: {
      welcomeMessage: String,
      introVideo: String,
      resources: [{
        title: String,
        url: String,
        type: String
      }],
      tasks: [{
        title: String,
        description: String,
        dueInDays: Number,
        assigned: Boolean
      }]
    }
  },

  // ==================== Bulk Invitation Support ====================
  bulk: {
    isBulkInvitation: {
      type: Boolean,
      default: false
    },
    bulkId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true
    },
    batchNumber: Number,
    totalInBatch: Number,
    positionInBatch: Number
  },

  // ==================== Analytics & Tracking ====================
  analytics: {
    emailOpens: [{
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
      location: String
    }],
    linkClicks: [{
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
      referrer: String
    }],
    conversionTime: Number, // Time in seconds from sent to accepted
    reminderEffectiveness: {
      remindersSent: Number,
      acceptedAfterReminder: Boolean,
      reminderNumber: Number
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['dashboard', 'api', 'bulk_upload', 'integration', 'public_form', 'referral'],
      default: 'dashboard'
    },
    campaign: {
      campaignId: String,
      campaignName: String,
      campaignType: String
    },
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }],
    referralInfo: {
      referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      referralCode: String,
      referralReward: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Compliance ====================
  compliance: {
    dataProcessingConsent: {
      given: Boolean,
      timestamp: Date,
      version: String
    },
    marketingConsent: {
      given: Boolean,
      timestamp: Date,
      channels: {
        email: Boolean,
        sms: Boolean,
        phone: Boolean
      }
    },
    retentionPolicy: {
      deleteAfterDays: {
        type: Number,
        default: 90
      },
      deletionScheduledFor: Date
    }
  }
};

// Create schema
const organizationInvitationSchema = BaseModel.createSchema(organizationInvitationSchemaDefinition, {
  collection: 'organization_invitations',
  timestamps: true
});

// ==================== Indexes ====================
organizationInvitationSchema.index({ organizationId: 1, 'recipient.email': 1 });
organizationInvitationSchema.index({ 'status.state': 1, 'invitation.expiresAt': 1 });
organizationInvitationSchema.index({ 'sender.userId': 1, createdAt: -1 });
organizationInvitationSchema.index({ 'invitation.shortCode': 1 });
organizationInvitationSchema.index({ 'bulk.bulkId': 1, 'bulk.positionInBatch': 1 });
organizationInvitationSchema.index({ createdAt: -1 });

// Compound indexes for common queries
organizationInvitationSchema.index({ 
  organizationId: 1, 
  'status.state': 1, 
  'invitation.expiresAt': 1 
});

// ==================== Virtual Fields ====================
organizationInvitationSchema.virtual('isExpired').get(function() {
  return this.invitation.expiresAt < new Date() && 
         this.status.state === 'pending';
});

organizationInvitationSchema.virtual('isActive').get(function() {
  return this.status.state === 'sent' && 
         this.invitation.expiresAt > new Date() &&
         this.invitation.usedCount < this.invitation.maxUses;
});

organizationInvitationSchema.virtual('canBeUsed').get(function() {
  return ['pending', 'sent', 'viewed'].includes(this.status.state) &&
         this.invitation.expiresAt > new Date() &&
         this.invitation.usedCount < this.invitation.maxUses;
});

organizationInvitationSchema.virtual('daysUntilExpiry').get(function() {
  if (this.invitation.expiresAt < new Date()) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((this.invitation.expiresAt - new Date()) / msPerDay);
});

organizationInvitationSchema.virtual('acceptanceRate').get(function() {
  if (this.communication.emailsSent === 0) return 0;
  return this.status.state === 'accepted' ? 100 : 0;
});

organizationInvitationSchema.virtual('invitationUrl').get(function() {
  const baseUrl = process.env.APP_URL || 'https://example.com';
  if (this.invitation.shortCode) {
    return `${baseUrl}/invite/${this.invitation.shortCode}`;
  }
  return `${baseUrl}/invitations/${this._id}`;
});

// ==================== Pre-save Middleware ====================
organizationInvitationSchema.pre('save', async function(next) {
  try {
    // Generate invitation token if new
    if (this.isNew && !this.invitation.token) {
      const token = stringHelper.generateRandomString(32);
      this.invitation.token = await HashService.hashToken(token);
      this._plainToken = token; // Store temporarily for sending
    }

    // Generate short code if not provided
    if (this.isNew && !this.invitation.shortCode) {
      this.invitation.shortCode = await this.constructor.generateUniqueShortCode();
    }

    // Set default expiration (7 days)
    if (this.isNew && !this.invitation.expiresAt) {
      const expiryDays = parseInt(process.env.INVITATION_EXPIRY_DAYS || '7');
      this.invitation.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    // Update status history
    if (this.isModified('status.state')) {
      if (!this.status.history) this.status.history = [];
      this.status.history.push({
        status: this.status.state,
        timestamp: new Date()
      });

      // Update specific timestamps
      switch (this.status.state) {
        case 'sent':
          this.status.sentAt = new Date();
          break;
        case 'viewed':
          this.status.viewedAt = new Date();
          break;
        case 'accepted':
          this.status.acceptedAt = new Date();
          // Calculate conversion time
          if (this.status.sentAt) {
            this.analytics.conversionTime = 
              Math.floor((this.status.acceptedAt - this.status.sentAt) / 1000);
          }
          break;
        case 'declined':
          this.status.declinedAt = new Date();
          break;
        case 'revoked':
          this.status.revokedAt = new Date();
          break;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
organizationInvitationSchema.methods.send = async function(options = {}) {
  if (!this.canBeUsed) {
    throw new AppError('Invitation cannot be sent', 400, 'INVITATION_NOT_SENDABLE');
  }

  this.status.state = 'sent';
  this.communication.emailsSent += 1;
  this.communication.lastEmailSentAt = new Date();

  if (options.customSubject) {
    this.communication.customSubject = options.customSubject;
  }
  if (options.customMessage) {
    this.communication.customMessage = options.customMessage;
  }

  await this.save();

  logger.info('Invitation sent', {
    invitationId: this._id,
    organizationId: this.organizationId,
    recipientEmail: this.recipient.email
  });

  return this;
};

organizationInvitationSchema.methods.resend = async function() {
  if (this.status.state === 'accepted') {
    throw new AppError('Invitation already accepted', 400, 'INVITATION_ALREADY_ACCEPTED');
  }

  if (this.status.state === 'declined') {
    throw new AppError('Invitation was declined', 400, 'INVITATION_DECLINED');
  }

  if (this.status.state === 'revoked') {
    throw new AppError('Invitation was revoked', 400, 'INVITATION_REVOKED');
  }

  // Reset expiration
  const expiryDays = parseInt(process.env.INVITATION_EXPIRY_DAYS || '7');
  this.invitation.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Update communication tracking
  this.communication.remindersSent += 1;
  this.communication.lastReminderAt = new Date();
  this.status.state = 'sent';

  await this.save();

  logger.info('Invitation resent', {
    invitationId: this._id,
    reminderNumber: this.communication.remindersSent
  });

  return this;
};

organizationInvitationSchema.methods.markAsViewed = async function(viewData = {}) {
  if (this.status.state === 'sent' || this.status.state === 'pending') {
    this.status.state = 'viewed';
    
    // Track analytics
    if (!this.analytics.linkClicks) this.analytics.linkClicks = [];
    this.analytics.linkClicks.push({
      timestamp: new Date(),
      ipAddress: viewData.ipAddress,
      userAgent: viewData.userAgent,
      referrer: viewData.referrer
    });

    await this.save();
  }

  return this;
};

organizationInvitationSchema.methods.accept = async function(acceptanceData = {}) {
  if (!this.canBeUsed) {
    if (this.isExpired) {
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }
    if (this.invitation.usedCount >= this.invitation.maxUses) {
      throw new AppError('Invitation usage limit reached', 400, 'INVITATION_LIMIT_REACHED');
    }
    throw new AppError('Invitation cannot be accepted', 400, 'INVITATION_NOT_ACCEPTABLE');
  }

  this.status.state = 'accepted';
  this.invitation.usedCount += 1;

  // Set acceptance details
  this.acceptance = {
    ...this.acceptance,
    acceptedBy: {
      userId: acceptanceData.userId,
      email: acceptanceData.email || this.recipient.email,
      name: acceptanceData.name
    },
    acceptanceMethod: acceptanceData.method || 'email_link',
    acceptanceIp: acceptanceData.ipAddress,
    acceptanceUserAgent: acceptanceData.userAgent,
    acceptanceLocation: acceptanceData.location,
    termsAccepted: acceptanceData.termsAccepted
  };

  // Track reminder effectiveness
  if (this.communication.remindersSent > 0) {
    this.analytics.reminderEffectiveness = {
      remindersSent: this.communication.remindersSent,
      acceptedAfterReminder: true,
      reminderNumber: this.communication.remindersSent
    };
  }

  await this.save();

  logger.info('Invitation accepted', {
    invitationId: this._id,
    organizationId: this.organizationId,
    acceptedBy: acceptanceData.userId || acceptanceData.email
  });

  return this;
};

organizationInvitationSchema.methods.decline = async function(declineData = {}) {
  if (this.status.state === 'accepted') {
    throw new AppError('Invitation already accepted', 400, 'INVITATION_ALREADY_ACCEPTED');
  }

  this.status.state = 'declined';
  
  if (declineData.reason) {
    if (!this.metadata.notes) this.metadata.notes = [];
    this.metadata.notes.push({
      content: `Declined: ${declineData.reason}`,
      addedAt: new Date()
    });
  }

  await this.save();

  logger.info('Invitation declined', {
    invitationId: this._id,
    reason: declineData.reason
  });

  return this;
};

organizationInvitationSchema.methods.revoke = async function(revokedBy, reason) {
  if (this.status.state === 'accepted') {
    throw new AppError('Cannot revoke accepted invitation', 400, 'INVITATION_ALREADY_ACCEPTED');
  }

  this.status.state = 'revoked';
  
  if (!this.metadata.notes) this.metadata.notes = [];
  this.metadata.notes.push({
    content: `Revoked: ${reason || 'No reason provided'}`,
    addedBy: revokedBy,
    addedAt: new Date()
  });

  await this.save();

  logger.info('Invitation revoked', {
    invitationId: this._id,
    revokedBy,
    reason
  });

  return this;
};

organizationInvitationSchema.methods.extend = async function(additionalDays, extendedBy) {
  if (this.status.state === 'accepted') {
    throw new AppError('Cannot extend accepted invitation', 400, 'INVITATION_ALREADY_ACCEPTED');
  }

  const newExpiryDate = new Date(this.invitation.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);
  this.invitation.expiresAt = newExpiryDate;

  if (!this.metadata.notes) this.metadata.notes = [];
  this.metadata.notes.push({
    content: `Extended by ${additionalDays} days`,
    addedBy: extendedBy,
    addedAt: new Date()
  });

  await this.save();

  logger.info('Invitation extended', {
    invitationId: this._id,
    additionalDays,
    newExpiryDate
  });

  return this;
};

organizationInvitationSchema.methods.updateRoles = async function(newRoles, updatedBy) {
  if (this.status.state === 'accepted') {
    throw new AppError('Cannot update roles for accepted invitation', 400, 'INVITATION_ALREADY_ACCEPTED');
  }

  const previousRoles = this.access.roles.map(r => r.roleName);
  this.access.roles = newRoles;

  if (!this.metadata.notes) this.metadata.notes = [];
  this.metadata.notes.push({
    content: `Roles updated from [${previousRoles.join(', ')}] to [${newRoles.map(r => r.roleName).join(', ')}]`,
    addedBy: updatedBy,
    addedAt: new Date()
  });

  await this.save();

  logger.info('Invitation roles updated', {
    invitationId: this._id,
    previousRoles,
    newRoles: newRoles.map(r => r.roleName)
  });

  return this;
};

organizationInvitationSchema.methods.trackEmailOpen = async function(trackingData = {}) {
  if (!this.analytics.emailOpens) this.analytics.emailOpens = [];
  
  this.analytics.emailOpens.push({
    timestamp: new Date(),
    ipAddress: trackingData.ipAddress,
    userAgent: trackingData.userAgent,
    location: trackingData.location
  });

  await this.save();
  return this;
};

organizationInvitationSchema.methods.validateToken = async function(token) {
  if (!this.invitation.token) {
    throw new AppError('No invitation token found', 400, 'NO_TOKEN');
  }

  const hashedToken = await HashService.hashToken(token);
  if (hashedToken !== this.invitation.token) {
    throw new AppError('Invalid invitation token', 400, 'INVALID_TOKEN');
  }

  if (!this.canBeUsed) {
    if (this.isExpired) {
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }
    throw new AppError('Invitation is not valid', 400, 'INVITATION_INVALID');
  }

  return true;
};

// ==================== Static Methods ====================
organizationInvitationSchema.statics.generateUniqueShortCode = async function() {
  let shortCode;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    shortCode = stringHelper.generateRandomString(8, 'alphanumeric').toUpperCase();
    attempts++;
  } while (await this.exists({ 'invitation.shortCode': shortCode }) && attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new AppError('Could not generate unique short code', 500, 'SHORT_CODE_GENERATION_FAILED');
  }

  return shortCode;
};

organizationInvitationSchema.statics.findByToken = async function(token) {
  const hashedToken = await HashService.hashToken(token);
  
  return await this.findOne({
    'invitation.token': hashedToken,
    'status.state': { $in: ['pending', 'sent', 'viewed'] }
  }).select('+invitation.token');
};

organizationInvitationSchema.statics.findByShortCode = async function(shortCode) {
  return await this.findOne({
    'invitation.shortCode': shortCode.toUpperCase(),
    'status.state': { $in: ['pending', 'sent', 'viewed'] }
  });
};

organizationInvitationSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    'status.state': { $ne: 'revoked' }
  };

  if (options.state) {
    query['status.state'] = options.state;
  }

  if (options.activeOnly) {
    query['invitation.expiresAt'] = { $gt: new Date() };
    query['status.state'] = { $in: ['sent', 'viewed'] };
  }

  const queryBuilder = this.find(query);

  if (options.populate) {
    queryBuilder.populate('sender.userId', 'profile.firstName profile.lastName email')
                .populate('organizationId', 'name slug');
  }

  return await queryBuilder.sort({ createdAt: -1 });
};

organizationInvitationSchema.statics.findPendingInvitations = async function(email) {
  return await this.find({
    'recipient.email': email.toLowerCase(),
    'status.state': { $in: ['sent', 'viewed'] },
    'invitation.expiresAt': { $gt: new Date() }
  }).populate('organizationId', 'name slug displayName');
};

organizationInvitationSchema.statics.bulkCreate = async function(invitations, senderId) {
  const bulkId = new mongoose.Types.ObjectId();
  const results = {
    successful: [],
    failed: []
  };

  for (let i = 0; i < invitations.length; i++) {
    try {
      const invitationData = {
        ...invitations[i],
        sender: {
          userId: senderId,
          ...invitations[i].sender
        },
        bulk: {
          isBulkInvitation: true,
          bulkId,
          batchNumber: 1,
          totalInBatch: invitations.length,
          positionInBatch: i + 1
        }
      };

      const invitation = new this(invitationData);
      await invitation.save();

      results.successful.push({
        email: invitation.recipient.email,
        invitationId: invitation._id,
        shortCode: invitation.invitation.shortCode,
        token: invitation._plainToken // From pre-save hook
      });
    } catch (error) {
      results.failed.push({
        email: invitations[i].recipient.email,
        error: error.message
      });
    }
  }

  logger.info('Bulk invitations created', {
    bulkId,
    total: invitations.length,
    successful: results.successful.length,
    failed: results.failed.length
  });

  return results;
};

organizationInvitationSchema.statics.getExpiringInvitations = async function(daysAhead = 2) {
  const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  return await this.find({
    'status.state': { $in: ['sent', 'viewed'] },
    'invitation.expiresAt': {
      $gte: new Date(),
      $lte: targetDate
    },
    'communication.remindersSent': { $lt: 3 } // Max 3 reminders
  }).populate('organizationId', 'name')
    .populate('sender.userId', 'email');
};

organizationInvitationSchema.statics.getInvitationStatistics = async function(organizationId, dateRange) {
  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (dateRange) {
    match.createdAt = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              pending: {
                $sum: { $cond: [{ $eq: ['$status.state', 'pending'] }, 1, 0] }
              },
              sent: {
                $sum: { $cond: [{ $eq: ['$status.state', 'sent'] }, 1, 0] }
              },
              viewed: {
                $sum: { $cond: [{ $eq: ['$status.state', 'viewed'] }, 1, 0] }
              },
              accepted: {
                $sum: { $cond: [{ $eq: ['$status.state', 'accepted'] }, 1, 0] }
              },
              declined: {
                $sum: { $cond: [{ $eq: ['$status.state', 'declined'] }, 1, 0] }
              },
              expired: {
                $sum: { $cond: [{ $eq: ['$status.state', 'expired'] }, 1, 0] }
              },
              revoked: {
                $sum: { $cond: [{ $eq: ['$status.state', 'revoked'] }, 1, 0] }
              }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$invitationType',
              count: { $sum: 1 },
              accepted: {
                $sum: { $cond: [{ $eq: ['$status.state', 'accepted'] }, 1, 0] }
              }
            }
          }
        ],
        byRole: [
          { $unwind: '$access.roles' },
          {
            $group: {
              _id: '$access.roles.roleName',
              count: { $sum: 1 },
              accepted: {
                $sum: { $cond: [{ $eq: ['$status.state', 'accepted'] }, 1, 0] }
              }
            }
          }
        ],
        conversionMetrics: [
          {
            $match: { 'status.state': 'accepted' }
          },
          {
            $group: {
              _id: null,
              avgConversionTime: { $avg: '$analytics.conversionTime' },
              avgRemindersBeforeAcceptance: { $avg: '$communication.remindersSent' },
              acceptanceRate: {
                $avg: {
                  $cond: [
                    { $eq: ['$status.state', 'accepted'] },
                    100,
                    0
                  ]
                }
              }
            }
          }
        ],
        timeline: [
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              sent: { $sum: 1 },
              accepted: {
                $sum: { $cond: [{ $eq: ['$status.state', 'accepted'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: 30 }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    overview: result.overview[0] || {
      total: 0,
      pending: 0,
      sent: 0,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      revoked: 0
    },
    distribution: {
      byType: result.byType,
      byRole: result.byRole
    },
    metrics: result.conversionMetrics[0] || {
      avgConversionTime: 0,
      avgRemindersBeforeAcceptance: 0,
      acceptanceRate: 0
    },
    timeline: result.timeline
  };
};

organizationInvitationSchema.statics.cleanupExpiredInvitations = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await this.updateMany(
    {
      'invitation.expiresAt': { $lt: new Date() },
      'status.state': { $in: ['pending', 'sent', 'viewed'] }
    },
    {
      $set: { 'status.state': 'expired' }
    }
  );

  // Delete very old invitations
  const deletionResult = await this.deleteMany({
    'status.state': { $in: ['expired', 'declined', 'revoked'] },
    updatedAt: { $lt: thirtyDaysAgo }
  });

  logger.info('Expired invitations cleanup', {
    expired: result.modifiedCount,
    deleted: deletionResult.deletedCount
  });

  return {
    expired: result.modifiedCount,
    deleted: deletionResult.deletedCount
  };
};

// Create and export model
const OrganizationInvitationModel = BaseModel.createModel('OrganizationInvitation', organizationInvitationSchema);

module.exports = {
  schema: organizationInvitationSchema,
  model: OrganizationInvitationModel
};