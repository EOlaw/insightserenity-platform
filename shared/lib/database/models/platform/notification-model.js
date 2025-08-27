'use strict';

/**
 * @fileoverview Notification model for system and user-level alerts, reminders, and messages
 * @module shared/lib/database/models/platform/notification-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/formatters/text-formatter
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
// Avoid notificationService and emailService circular dependencies by importing them later
// This allows us to use them in methods without causing circular import issues
const notificationService = require('../../../services/notification-service'); // Circular dependency avoided
const emailService = require('../../../services/email-service'); // Circular dependency avoided

const stringHelper = require('../../../utils/helpers/string-helper');
const textFormatter = require('../../../utils/formatters/text-formatter');
const encryptionService = require('../../../security/encryption/encryption-service');

/**
 * Notification schema definition for managing platform notifications
 */
const notificationSchemaDefinition = {
  // ==================== Multi-tenancy ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // ==================== Recipient Information ====================
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  recipientType: {
    type: String,
    enum: ['user', 'organization', 'team', 'role', 'broadcast'],
    default: 'user'
  },

  recipientEmail: {
    type: String,
    lowercase: true,
    trim: true
  },

  recipientName: String,

  // ==================== Notification Content ====================
  type: {
    type: String,
    required: true,
    enum: [
      'info', 'success', 'warning', 'error', 'critical',
      'system', 'security', 'billing', 'usage', 'compliance',
      'announcement', 'reminder', 'task', 'approval', 'mention',
      'subscription', 'feature', 'maintenance', 'integration'
    ],
    index: true
  },

  category: {
    type: String,
    enum: [
      'general', 'account', 'billing', 'security', 'system',
      'collaboration', 'workflow', 'analytics', 'compliance'
    ],
    default: 'general'
  },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent', 'critical'],
    default: 'normal',
    index: true
  },

  title: {
    type: String,
    required: true,
    maxlength: 200
  },

  message: {
    type: String,
    required: true,
    maxlength: 2000
  },

  shortMessage: {
    type: String,
    maxlength: 160
  },

  // ==================== Rich Content ====================
  content: {
    html: String,
    markdown: String,
    plainText: String,
    template: String,
    templateData: mongoose.Schema.Types.Mixed,
    attachments: [{
      fileName: String,
      fileType: String,
      fileSize: Number,
      url: String,
      secureUrl: String
    }]
  },

  // ==================== Actions & Links ====================
  actions: [{
    actionId: {
      type: String,
      default: () => stringHelper.generateRandomString(16)
    },
    label: {
      type: String,
      required: true
    },
    url: String,
    type: {
      type: String,
      enum: ['link', 'button', 'api', 'dismiss'],
      default: 'link'
    },
    style: {
      type: String,
      enum: ['primary', 'secondary', 'success', 'danger', 'warning'],
      default: 'primary'
    },
    requiresAuth: {
      type: Boolean,
      default: true
    },
    metadata: mongoose.Schema.Types.Mixed
  }],

  link: {
    url: String,
    label: String,
    external: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Delivery Configuration ====================
  delivery: {
    methods: [{
      type: String,
      enum: ['in-app', 'email', 'sms', 'push', 'slack', 'webhook'],
      required: true
    }],
    
    email: {
      to: [String],
      cc: [String],
      bcc: [String],
      replyTo: String,
      subject: String,
      templateId: String
    },

    sms: {
      phoneNumber: String,
      provider: String
    },

    push: {
      deviceTokens: [String],
      sound: String,
      badge: Number,
      data: mongoose.Schema.Types.Mixed
    },

    slack: {
      channelId: String,
      webhookUrl: String,
      mentionUsers: [String]
    },

    webhook: {
      url: String,
      headers: mongoose.Schema.Types.Mixed,
      authToken: String
    },

    scheduling: {
      scheduledFor: Date,
      timezone: String,
      recurring: {
        enabled: { type: Boolean, default: false },
        frequency: {
          type: String,
          enum: ['daily', 'weekly', 'monthly', 'custom']
        },
        interval: Number,
        endDate: Date
      }
    }
  },

  // ==================== Status Tracking ====================
  status: {
    state: {
      type: String,
      enum: ['pending', 'scheduled', 'sending', 'sent', 'delivered', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true
    },

    readAt: Date,
    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    sentAt: Date,
    deliveredAt: Date,
    failedAt: Date,

    deliveryStatus: {
      type: Map,
      of: {
        status: String,
        sentAt: Date,
        deliveredAt: Date,
        failedAt: Date,
        error: String,
        attempts: Number
      }
    },

    retries: {
      count: {
        type: Number,
        default: 0
      },
      maxRetries: {
        type: Number,
        default: 3
      },
      lastAttempt: Date,
      nextRetry: Date
    }
  },

  // ==================== User Interaction ====================
  interaction: {
    clicked: {
      type: Boolean,
      default: false
    },
    clickedAt: Date,
    clickedAction: String,
    
    dismissed: {
      type: Boolean,
      default: false
    },
    dismissedAt: Date,
    dismissedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    snoozed: {
      type: Boolean,
      default: false
    },
    snoozedUntil: Date,
    snoozedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    archived: {
      type: Boolean,
      default: false,
      index: true
    },
    archivedAt: Date,

    starred: {
      type: Boolean,
      default: false
    },
    starredAt: Date
  },

  // ==================== Grouping & Threading ====================
  grouping: {
    groupId: {
      type: String,
      index: true
    },
    threadId: {
      type: String,
      index: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification'
    },
    isGrouped: {
      type: Boolean,
      default: false
    },
    groupCount: {
      type: Number,
      default: 1
    }
  },

  // ==================== Source & Context ====================
  source: {
    service: {
      type: String,
      required: true
    },
    entityType: String,
    entityId: String,
    eventType: String,
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    automatedTrigger: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Security & Privacy ====================
  security: {
    encrypted: {
      type: Boolean,
      default: false
    },
    encryptedFields: [String],
    sensitiveData: {
      type: Boolean,
      default: false
    },
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    },
    retentionPolicy: {
      deleteAfterRead: Boolean,
      retentionDays: {
        type: Number,
        default: 90
      },
      deleteAt: Date
    }
  },

  // ==================== Preferences & Rules ====================
  preferences: {
    allowDismiss: {
      type: Boolean,
      default: true
    },
    requiresAcknowledgment: {
      type: Boolean,
      default: false
    },
    persistUntilRead: {
      type: Boolean,
      default: false
    },
    showInApp: {
      type: Boolean,
      default: true
    },
    sound: {
      enabled: Boolean,
      soundFile: String
    },
    vibration: Boolean
  },

  // ==================== Metadata & Analytics ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    locale: {
      type: String,
      default: 'en'
    },
    translations: {
      type: Map,
      of: {
        title: String,
        message: String,
        shortMessage: String
      }
    },
    campaign: {
      campaignId: String,
      campaignName: String,
      segment: String
    },
    tracking: {
      utmSource: String,
      utmMedium: String,
      utmCampaign: String,
      correlationId: String
    }
  },

  // ==================== Expiration ====================
  expiration: {
    expiresAt: {
      type: Date,
      index: true
    },
    expired: {
      type: Boolean,
      default: false
    },
    autoDelete: {
      type: Boolean,
      default: true
    }
  },

  // ==================== Audit Trail ====================
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

// Create schema
const notificationSchema = BaseModel.createSchema(notificationSchemaDefinition, {
  collection: 'notifications',
  timestamps: true,
  versionKey: false
});

// ==================== Indexes ====================
notificationSchema.index({ recipientId: 1, 'status.isRead': 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, category: 1, priority: 1 });
notificationSchema.index({ 'status.state': 1, 'delivery.scheduling.scheduledFor': 1 });
notificationSchema.index({ 'grouping.groupId': 1, createdAt: -1 });
notificationSchema.index({ 'interaction.archived': 1, recipientId: 1 });
notificationSchema.index({ 'expiration.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Text search index
notificationSchema.index({
  title: 'text',
  message: 'text',
  shortMessage: 'text'
});

// ==================== Virtual Fields ====================
notificationSchema.virtual('isExpired').get(function() {
  return this.expiration.expiresAt && this.expiration.expiresAt < new Date();
});

notificationSchema.virtual('isPending').get(function() {
  return this.status.state === 'pending' || this.status.state === 'scheduled';
});

notificationSchema.virtual('isDelivered').get(function() {
  return this.status.state === 'delivered' || this.status.state === 'sent';
});

notificationSchema.virtual('requiresRetry').get(function() {
  return this.status.state === 'failed' && 
         this.status.retries.count < this.status.retries.maxRetries;
});

notificationSchema.virtual('formattedMessage').get(function() {
  if (this.content.html) return this.content.html;
  if (this.content.markdown) return textFormatter.markdownToHtml(this.content.markdown);
  return textFormatter.plainToHtml(this.message);
});

// ==================== Pre-save Middleware ====================
notificationSchema.pre('save', async function(next) {
  try {
    // Generate short message if not provided
    if (!this.shortMessage && this.message) {
      this.shortMessage = textFormatter.truncate(this.message, 160);
    }

    // Set expiration date based on retention policy
    if (!this.expiration.expiresAt && this.security.retentionPolicy.retentionDays) {
      this.expiration.expiresAt = new Date(
        Date.now() + this.security.retentionPolicy.retentionDays * 24 * 60 * 60 * 1000
      );
    }

    // Encrypt sensitive fields if required
    if (this.security.sensitiveData && !this.security.encrypted) {
      await this.encryptSensitiveData();
    }

    // Validate delivery methods
    if (this.delivery.methods.length === 0) {
      this.delivery.methods = ['in-app'];
    }

    // Set scheduling
    if (this.delivery.scheduling.scheduledFor && this.delivery.scheduling.scheduledFor > new Date()) {
      this.status.state = 'scheduled';
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
notificationSchema.post('save', async function(doc) {
  try {
    // Process immediate notifications
    if (doc.status.state === 'pending' && !doc.delivery.scheduling.scheduledFor) {
      await notificationService.processNotification(doc);
    }
  } catch (error) {
    logger.error('Error processing notification', {
      error: error.message,
      notificationId: doc._id
    });
  }
});

// ==================== Instance Methods ====================
notificationSchema.methods.encryptSensitiveData = async function() {
  const fieldsToEncrypt = ['message', 'content.html', 'content.plainText'];
  
  for (const field of fieldsToEncrypt) {
    const value = this.get(field);
    if (value) {
      const encrypted = await encryptionService.encrypt(value);
      this.set(field, encrypted);
    }
  }
  
  this.security.encrypted = true;
  this.security.encryptedFields = fieldsToEncrypt;
  
  return this;
};

notificationSchema.methods.decryptSensitiveData = async function() {
  if (!this.security.encrypted) return this;
  
  for (const field of this.security.encryptedFields) {
    const encryptedValue = this.get(field);
    if (encryptedValue) {
      const decrypted = await encryptionService.decrypt(encryptedValue);
      this.set(field, decrypted);
    }
  }
  
  return this;
};

notificationSchema.methods.markAsRead = async function(userId) {
  this.status.isRead = true;
  this.status.readAt = new Date();
  this.status.readBy = userId || this.recipientId;
  
  await this.save();
  
  logger.info('Notification marked as read', {
    notificationId: this._id,
    userId
  });
  
  return this;
};

notificationSchema.methods.markAsDelivered = async function(method, deliveredAt = new Date()) {
  this.status.state = 'delivered';
  this.status.deliveredAt = deliveredAt;
  
  if (!this.status.deliveryStatus) {
    this.status.deliveryStatus = new Map();
  }
  
  this.status.deliveryStatus.set(method, {
    status: 'delivered',
    deliveredAt,
    attempts: (this.status.deliveryStatus.get(method)?.attempts || 0) + 1
  });
  
  await this.save();
  
  return this;
};

notificationSchema.methods.markAsFailed = async function(method, error) {
  const currentMethodStatus = this.status.deliveryStatus?.get(method) || {};
  const attempts = (currentMethodStatus.attempts || 0) + 1;
  
  if (!this.status.deliveryStatus) {
    this.status.deliveryStatus = new Map();
  }
  
  this.status.deliveryStatus.set(method, {
    status: 'failed',
    failedAt: new Date(),
    error: error.message || error,
    attempts
  });
  
  this.status.retries.count = attempts;
  this.status.retries.lastAttempt = new Date();
  
  // Check if all methods have failed
  const allFailed = this.delivery.methods.every(m => 
    this.status.deliveryStatus.get(m)?.status === 'failed'
  );
  
  if (allFailed) {
    this.status.state = 'failed';
    this.status.failedAt = new Date();
  }
  
  // Schedule retry if applicable
  if (this.requiresRetry) {
    const retryDelay = Math.pow(2, this.status.retries.count) * 60 * 1000; // Exponential backoff
    this.status.retries.nextRetry = new Date(Date.now() + retryDelay);
  }
  
  await this.save();
  
  logger.error('Notification delivery failed', {
    notificationId: this._id,
    method,
    error: error.message,
    attempts
  });
  
  return this;
};

notificationSchema.methods.dismiss = async function(userId) {
  this.interaction.dismissed = true;
  this.interaction.dismissedAt = new Date();
  this.interaction.dismissedBy = userId;
  
  await this.save();
  
  return this;
};

notificationSchema.methods.snooze = async function(until, userId) {
  this.interaction.snoozed = true;
  this.interaction.snoozedUntil = until;
  this.interaction.snoozedBy = userId;
  
  await this.save();
  
  return this;
};

notificationSchema.methods.archive = async function() {
  this.interaction.archived = true;
  this.interaction.archivedAt = new Date();
  
  await this.save();
  
  return this;
};

notificationSchema.methods.trackAction = async function(actionId) {
  this.interaction.clicked = true;
  this.interaction.clickedAt = new Date();
  this.interaction.clickedAction = actionId;
  
  await this.save();
  
  // Track analytics
  logger.info('Notification action tracked', {
    notificationId: this._id,
    actionId
  });
  
  return this;
};

notificationSchema.methods.sendViaEmail = async function() {
  if (!this.delivery.methods.includes('email')) {
    throw new AppError('Email delivery not configured', 400, 'EMAIL_NOT_CONFIGURED');
  }
  
  const emailData = {
    to: this.delivery.email.to || [this.recipientEmail],
    subject: this.delivery.email.subject || this.title,
    html: this.formattedMessage,
    text: this.message,
    templateId: this.delivery.email.templateId,
    templateData: this.content.templateData
  };
  
  try {
    await emailService.sendEmail(emailData);
    await this.markAsDelivered('email');
  } catch (error) {
    await this.markAsFailed('email', error);
    throw error;
  }
};

// ==================== Static Methods ====================
notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  await notification.save();
  
  logger.info('Notification created', {
    notificationId: notification._id,
    type: notification.type,
    recipientId: notification.recipientId
  });
  
  return notification;
};

notificationSchema.statics.createBulkNotifications = async function(recipients, notificationData) {
  const notifications = recipients.map(recipient => ({
    ...notificationData,
    recipientId: recipient._id || recipient,
    recipientEmail: recipient.email,
    recipientName: recipient.name
  }));
  
  const created = await this.insertMany(notifications);
  
  logger.info('Bulk notifications created', {
    count: created.length,
    type: notificationData.type
  });
  
  return created;
};

notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    unreadOnly = false,
    types = [],
    categories = [],
    limit = 50,
    skip = 0,
    includeArchived = false,
    includeSnoozed = false
  } = options;
  
  const query = {
    recipientId: userId,
    'status.state': { $in: ['sent', 'delivered'] }
  };
  
  if (unreadOnly) {
    query['status.isRead'] = false;
  }
  
  if (types.length > 0) {
    query.type = { $in: types };
  }
  
  if (categories.length > 0) {
    query.category = { $in: categories };
  }
  
  if (!includeArchived) {
    query['interaction.archived'] = false;
  }
  
  if (!includeSnoozed) {
    query.$or = [
      { 'interaction.snoozed': false },
      { 'interaction.snoozedUntil': { $lte: new Date() } }
    ];
  }
  
  const notifications = await this.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('source.triggeredBy', 'name email');
  
  const unreadCount = await this.countDocuments({
    recipientId: userId,
    'status.isRead': false,
    'interaction.archived': false
  });
  
  return {
    notifications,
    unreadCount,
    hasMore: notifications.length === limit
  };
};

notificationSchema.statics.markAllAsRead = async function(userId, filters = {}) {
  const query = {
    recipientId: userId,
    'status.isRead': false
  };
  
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  
  const result = await this.updateMany(query, {
    $set: {
      'status.isRead': true,
      'status.readAt': new Date()
    }
  });
  
  logger.info('Notifications marked as read', {
    userId,
    count: result.modifiedCount
  });
  
  return result.modifiedCount;
};

notificationSchema.statics.getGroupedNotifications = async function(groupId) {
  return await this.find({
    'grouping.groupId': groupId
  }).sort({ createdAt: -1 });
};

notificationSchema.statics.getPendingScheduledNotifications = async function() {
  const now = new Date();
  
  return await this.find({
    'status.state': 'scheduled',
    'delivery.scheduling.scheduledFor': { $lte: now }
  });
};

notificationSchema.statics.getRetryableNotifications = async function() {
  return await this.find({
    'status.state': 'failed',
    'status.retries.count': { $lt: 3 },
    $or: [
      { 'status.retries.nextRetry': { $lte: new Date() } },
      { 'status.retries.nextRetry': { $exists: false } }
    ]
  });
};

notificationSchema.statics.getNotificationStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.tenantId) match.tenantId = filters.tenantId;
  if (filters.organizationId) match.organizationId = filters.organizationId;
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = filters.startDate;
    if (filters.endDate) match.createdAt.$lte = filters.endDate;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        byType: [
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ],
        byStatus: [
          { $group: { _id: '$status.state', count: { $sum: 1 } } }
        ],
        byPriority: [
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ],
        deliveryMethods: [
          { $unwind: '$delivery.methods' },
          { $group: { _id: '$delivery.methods', count: { $sum: 1 } } }
        ],
        engagement: [
          {
            $group: {
              _id: null,
              totalSent: { $sum: 1 },
              totalRead: { $sum: { $cond: ['$status.isRead', 1, 0] } },
              totalClicked: { $sum: { $cond: ['$interaction.clicked', 1, 0] } },
              totalDismissed: { $sum: { $cond: ['$interaction.dismissed', 1, 0] } }
            }
          }
        ]
      }
    }
  ]);
  
  const result = stats[0];
  const engagement = result.engagement[0] || {};
  
  return {
    distribution: {
      byType: result.byType,
      byStatus: result.byStatus,
      byPriority: result.byPriority,
      byDeliveryMethod: result.deliveryMethods
    },
    engagement: {
      ...engagement,
      readRate: engagement.totalSent ? (engagement.totalRead / engagement.totalSent) : 0,
      clickRate: engagement.totalSent ? (engagement.totalClicked / engagement.totalSent) : 0
    }
  };
};

notificationSchema.statics.cleanupExpiredNotifications = async function() {
  const result = await this.deleteMany({
    'expiration.expired': true,
    'expiration.autoDelete': true,
    'expiration.expiresAt': { $lte: new Date() }
  });
  
  logger.info('Expired notifications cleaned up', {
    deletedCount: result.deletedCount
  });
  
  return result.deletedCount;
};

// Create and export model
const NotificationModel = BaseModel.createModel('Notification', notificationSchema);

module.exports = NotificationModel;