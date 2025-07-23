'use strict';

/**
 * @fileoverview Notification model for multi-channel notification management
 * @module shared/lib/database/models/notification-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const stringHelper = require('../../utils/helpers/string-helper');

/**
 * Notification schema definition
 */
const notificationSchemaDefinition = {
  // Notification Identification
  notificationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Type and Category
  type: {
    type: String,
    required: true,
    enum: [
      'alert', 'info', 'warning', 'error', 'success',
      'reminder', 'announcement', 'message', 'update',
      'invitation', 'request', 'approval', 'system'
    ],
    index: true
  },

  category: {
    type: String,
    required: true,
    enum: [
      'account', 'security', 'billing', 'system', 'user',
      'organization', 'project', 'task', 'message', 'integration',
      'compliance', 'report', 'maintenance', 'marketing'
    ],
    index: true
  },

  subcategory: String,

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent', 'critical'],
    default: 'normal',
    index: true
  },

  // Content
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

  excerpt: {
    type: String,
    maxlength: 160
  },

  // Rich content
  content: {
    html: String,
    markdown: String,
    template: String,
    variables: mongoose.Schema.Types.Mixed
  },

  // Recipients
  recipient: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    email: String,
    name: String,
    preferences: {
      email: Boolean,
      sms: Boolean,
      push: Boolean,
      inApp: Boolean
    }
  },

  // Sender
  sender: {
    type: {
      type: String,
      enum: ['system', 'user', 'organization', 'service'],
      default: 'system'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    avatar: String
  },

  // Organization & Context
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  tenantId: {
    type: String,
    index: true
  },

  // Channels
  channels: {
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      opened: Boolean,
      openedAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      bounced: Boolean,
      bouncedAt: Date,
      error: String,
      messageId: String
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      error: String,
      messageId: String,
      phoneNumber: String
    },
    push: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      error: String,
      tokens: [String]
    },
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      seen: {
        type: Boolean,
        default: false
      },
      seenAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      dismissed: Boolean,
      dismissedAt: Date
    },
    webhook: {
      enabled: {
        type: Boolean,
        default: false
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      url: String,
      response: {
        status: Number,
        body: String
      },
      error: String
    }
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },

  // Delivery
  delivery: {
    scheduled: Boolean,
    scheduledFor: Date,
    sendAfter: Date,
    sendBefore: Date,
    timezone: String,
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    lastAttemptAt: Date,
    nextRetryAt: Date,
    retryCount: {
      type: Number,
      default: 0
    }
  },

  // Actions
  actions: [{
    label: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['link', 'button', 'api', 'dismiss'],
      default: 'link'
    },
    url: String,
    method: String,
    payload: mongoose.Schema.Types.Mixed,
    style: {
      type: String,
      enum: ['primary', 'secondary', 'danger', 'success', 'info'],
      default: 'primary'
    },
    clicked: Boolean,
    clickedAt: Date
  }],

  // Metadata
  metadata: {
    source: String,
    campaign: String,
    reference: String,
    tags: [String],
    custom: mongoose.Schema.Types.Mixed
  },

  // Related Entities
  relatedTo: {
    type: {
      type: String,
      enum: ['user', 'organization', 'project', 'task', 'document', 'invoice', 'other']
    },
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    url: String
  },

  // Grouping
  groupId: {
    type: String,
    index: true
  },

  thread: {
    id: String,
    position: Number,
    total: Number
  },

  // Expiration
  expiresAt: {
    type: Date,
    index: true
  },

  expired: {
    type: Boolean,
    default: false
  },

  // Tracking
  events: [{
    type: {
      type: String,
      enum: ['created', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced']
    },
    timestamp: Date,
    channel: String,
    details: mongoose.Schema.Types.Mixed
  }],

  // Statistics
  stats: {
    sendAttempts: {
      type: Number,
      default: 0
    },
    successfulChannels: {
      type: Number,
      default: 0
    },
    failedChannels: {
      type: Number,
      default: 0
    },
    interactions: {
      type: Number,
      default: 0
    },
    firstInteractionAt: Date,
    lastInteractionAt: Date
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  // Archival
  archived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: Date
};

// Create schema
const notificationSchema = BaseModel.createSchema(notificationSchemaDefinition, {
  collection: 'notifications',
  timestamps: false // We manage timestamps manually
});

// Indexes
notificationSchema.index({ 'recipient.userId': 1, status: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, category: 1, status: 1 });
notificationSchema.index({ 'channels.inApp.seen': 1, 'recipient.userId': 1 });
notificationSchema.index({ 'delivery.scheduledFor': 1, status: 1 });
notificationSchema.index({ groupId: 1, createdAt: -1 });

// Virtual fields
notificationSchema.virtual('isRead').get(function() {
  return this.channels.inApp.seen || false;
});

notificationSchema.virtual('isSent').get(function() {
  return ['sent', 'delivered'].includes(this.status);
});

notificationSchema.virtual('isDelivered').get(function() {
  return this.status === 'delivered';
});

notificationSchema.virtual('isPending').get(function() {
  return this.status === 'pending' || this.status === 'processing';
});

notificationSchema.virtual('channelsSent').get(function() {
  const channels = [];
  if (this.channels.email.sent) channels.push('email');
  if (this.channels.sms.sent) channels.push('sms');
  if (this.channels.push.sent) channels.push('push');
  if (this.channels.webhook.sent) channels.push('webhook');
  return channels;
});

notificationSchema.virtual('successRate').get(function() {
  const total = this.stats.sendAttempts || 0;
  const successful = this.stats.successfulChannels || 0;
  return total > 0 ? (successful / total) * 100 : 0;
});

// Pre-save middleware
notificationSchema.pre('save', async function(next) {
  try {
    // Generate notification ID if not provided
    if (!this.notificationId && this.isNew) {
      this.notificationId = await this.constructor.generateNotificationId();
    }

    // Generate excerpt if not provided
    if (!this.excerpt && this.message) {
      this.excerpt = stringHelper.truncate(this.message, 160);
    }

    // Update timestamps
    this.updatedAt = new Date();

    // Set expiration if not set
    if (!this.expiresAt && this.isNew) {
      const expirationDays = this.type === 'system' ? 7 : 30;
      this.expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
    }

    // Track event
    if (this.isNew) {
      this.events.push({
        type: 'created',
        timestamp: new Date()
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
notificationSchema.methods.send = async function(options = {}) {
  if (this.status !== 'pending') {
    throw new AppError('Notification already processed', 400, 'INVALID_STATUS');
  }

  this.status = 'processing';
  this.delivery.attempts++;
  this.delivery.lastAttemptAt = new Date();

  try {
    const results = await this.#sendToChannels(options);
    
    // Update status based on results
    const hasSuccess = Object.values(results).some(r => r.success);
    const allFailed = Object.values(results).every(r => !r.success);

    if (allFailed) {
      this.status = 'failed';
      
      // Schedule retry if attempts remain
      if (this.delivery.attempts < this.delivery.maxAttempts) {
        const retryDelay = Math.pow(2, this.delivery.attempts) * 60000; // Exponential backoff
        this.delivery.nextRetryAt = new Date(Date.now() + retryDelay);
        this.status = 'pending';
      }
    } else {
      this.status = hasSuccess ? 'sent' : 'failed';
    }

    // Update stats
    for (const [channel, result] of Object.entries(results)) {
      if (result.success) {
        this.stats.successfulChannels++;
      } else {
        this.stats.failedChannels++;
      }
    }

    await this.save();
    return results;

  } catch (error) {
    this.status = 'failed';
    await this.save();
    throw error;
  }
};

notificationSchema.methods.markAsRead = async function() {
  if (!this.channels.inApp.seen) {
    this.channels.inApp.seen = true;
    this.channels.inApp.seenAt = new Date();
    
    this.events.push({
      type: 'opened',
      timestamp: new Date(),
      channel: 'inApp'
    });

    this.stats.interactions++;
    if (!this.stats.firstInteractionAt) {
      this.stats.firstInteractionAt = new Date();
    }
    this.stats.lastInteractionAt = new Date();

    await this.save();
  }
  
  return this;
};

notificationSchema.methods.markAsClicked = async function(actionIndex) {
  this.channels.inApp.clicked = true;
  this.channels.inApp.clickedAt = new Date();

  if (actionIndex !== undefined && this.actions[actionIndex]) {
    this.actions[actionIndex].clicked = true;
    this.actions[actionIndex].clickedAt = new Date();
  }

  this.events.push({
    type: 'clicked',
    timestamp: new Date(),
    channel: 'inApp',
    details: { actionIndex }
  });

  this.stats.interactions++;
  this.stats.lastInteractionAt = new Date();

  await this.save();
  return this;
};

notificationSchema.methods.dismiss = async function() {
  this.channels.inApp.dismissed = true;
  this.channels.inApp.dismissedAt = new Date();
  
  await this.save();
  return this;
};

notificationSchema.methods.cancel = async function() {
  if (!['pending', 'processing'].includes(this.status)) {
    throw new AppError('Cannot cancel sent notification', 400, 'INVALID_STATUS');
  }

  this.status = 'cancelled';
  await this.save();
  
  return this;
};

notificationSchema.methods.archive = async function() {
  this.archived = true;
  this.archivedAt = new Date();
  await this.save();
  return this;
};

notificationSchema.methods.updateDeliveryStatus = async function(channel, status, details = {}) {
  const channelConfig = this.channels[channel];
  
  if (!channelConfig) {
    throw new AppError(`Invalid channel: ${channel}`, 400, 'INVALID_CHANNEL');
  }

  if (status === 'delivered') {
    channelConfig.delivered = true;
    channelConfig.deliveredAt = new Date();
    
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
  } else if (status === 'bounced') {
    channelConfig.bounced = true;
    channelConfig.bouncedAt = new Date();
    channelConfig.error = details.error;
  } else if (status === 'opened' && channel === 'email') {
    channelConfig.opened = true;
    channelConfig.openedAt = new Date();
  } else if (status === 'clicked' && channel === 'email') {
    channelConfig.clicked = true;
    channelConfig.clickedAt = new Date();
  }

  this.events.push({
    type: status,
    timestamp: new Date(),
    channel,
    details
  });

  await this.save();
  return this;
};

// Private instance methods
notificationSchema.methods.#sendToChannels = async function(options) {
  const results = {};

  // Send to enabled channels
  if (this.channels.email.enabled && this.recipient.preferences?.email !== false) {
    results.email = await this.#sendEmail();
  }

  if (this.channels.sms.enabled && this.recipient.preferences?.sms !== false) {
    results.sms = await this.#sendSMS();
  }

  if (this.channels.push.enabled && this.recipient.preferences?.push !== false) {
    results.push = await this.#sendPush();
  }

  if (this.channels.webhook.enabled) {
    results.webhook = await this.#sendWebhook();
  }

  // InApp is always created
  this.channels.inApp.enabled = true;

  return results;
};

notificationSchema.methods.#sendEmail = async function() {
  try {
    // In production, integrate with email service
    logger.info('Sending email notification', {
      notificationId: this.notificationId,
      to: this.recipient.email
    });

    this.channels.email.sent = true;
    this.channels.email.sentAt = new Date();
    this.channels.email.messageId = `msg_${Date.now()}`;

    this.events.push({
      type: 'sent',
      timestamp: new Date(),
      channel: 'email'
    });

    return { success: true };
  } catch (error) {
    this.channels.email.error = error.message;
    return { success: false, error: error.message };
  }
};

notificationSchema.methods.#sendSMS = async function() {
  try {
    // In production, integrate with SMS service
    logger.info('Sending SMS notification', {
      notificationId: this.notificationId,
      to: this.channels.sms.phoneNumber
    });

    this.channels.sms.sent = true;
    this.channels.sms.sentAt = new Date();
    this.channels.sms.messageId = `sms_${Date.now()}`;

    this.events.push({
      type: 'sent',
      timestamp: new Date(),
      channel: 'sms'
    });

    return { success: true };
  } catch (error) {
    this.channels.sms.error = error.message;
    return { success: false, error: error.message };
  }
};

notificationSchema.methods.#sendPush = async function() {
  try {
    // In production, integrate with push notification service
    logger.info('Sending push notification', {
      notificationId: this.notificationId,
      tokens: this.channels.push.tokens?.length
    });

    this.channels.push.sent = true;
    this.channels.push.sentAt = new Date();

    this.events.push({
      type: 'sent',
      timestamp: new Date(),
      channel: 'push'
    });

    return { success: true };
  } catch (error) {
    this.channels.push.error = error.message;
    return { success: false, error: error.message };
  }
};

notificationSchema.methods.#sendWebhook = async function() {
  try {
    // In production, make actual HTTP request
    logger.info('Sending webhook notification', {
      notificationId: this.notificationId,
      url: this.channels.webhook.url
    });

    this.channels.webhook.sent = true;
    this.channels.webhook.sentAt = new Date();
    this.channels.webhook.response = {
      status: 200,
      body: 'OK'
    };

    this.events.push({
      type: 'sent',
      timestamp: new Date(),
      channel: 'webhook'
    });

    return { success: true };
  } catch (error) {
    this.channels.webhook.error = error.message;
    return { success: false, error: error.message };
  }
};

// Static methods
notificationSchema.statics.generateNotificationId = function() {
  return `notif_${Date.now()}_${stringHelper.generateRandomString(8)}`;
};

notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  
  // Auto-enable channels based on type and priority
  if (data.priority === 'critical' || data.priority === 'urgent') {
    notification.channels.email.enabled = true;
    notification.channels.push.enabled = true;
  }

  await notification.save();
  
  // Send immediately if not scheduled
  if (!notification.delivery.scheduled) {
    await notification.send();
  }

  return notification;
};

notificationSchema.statics.sendBulk = async function(recipients, notificationData) {
  const notifications = [];
  const errors = [];

  for (const recipient of recipients) {
    try {
      const notification = await this.createNotification({
        ...notificationData,
        recipient: {
          userId: recipient.userId || recipient._id,
          email: recipient.email,
          name: recipient.name || `${recipient.profile?.firstName} ${recipient.profile?.lastName}`,
          preferences: recipient.preferences?.notifications
        }
      });

      notifications.push(notification);
    } catch (error) {
      errors.push({
        recipient: recipient._id || recipient.userId,
        error: error.message
      });
    }
  }

  logger.info('Bulk notifications created', {
    total: recipients.length,
    successful: notifications.length,
    failed: errors.length
  });

  return { notifications, errors };
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    'recipient.userId': userId,
    'channels.inApp.seen': false,
    status: { $in: ['sent', 'delivered'] },
    archived: false,
    expiresAt: { $gt: new Date() }
  });
};

notificationSchema.statics.getByUser = async function(userId, options = {}) {
  const {
    unreadOnly = false,
    type,
    category,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;

  const query = {
    'recipient.userId': userId,
    archived: false,
    expiresAt: { $gt: new Date() }
  };

  if (unreadOnly) {
    query['channels.inApp.seen'] = false;
  }

  if (type) {
    query.type = type;
  }

  if (category) {
    query.category = category;
  }

  return await this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

notificationSchema.statics.markAllAsRead = async function(userId, filters = {}) {
  const query = {
    'recipient.userId': userId,
    'channels.inApp.seen': false,
    archived: false
  };

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.category) {
    query.category = filters.category;
  }

  const result = await this.updateMany(query, {
    'channels.inApp.seen': true,
    'channels.inApp.seenAt': new Date(),
    $push: {
      events: {
        type: 'opened',
        timestamp: new Date(),
        channel: 'inApp',
        details: { bulk: true }
      }
    }
  });

  return result;
};

notificationSchema.statics.processScheduled = async function() {
  const now = new Date();
  
  const scheduled = await this.find({
    status: 'pending',
    'delivery.scheduled': true,
    'delivery.scheduledFor': { $lte: now },
    'delivery.sendAfter': { $lte: now }
  }).limit(100);

  const results = {
    processed: 0,
    successful: 0,
    failed: 0
  };

  for (const notification of scheduled) {
    try {
      await notification.send();
      results.successful++;
    } catch (error) {
      results.failed++;
      logger.error('Failed to send scheduled notification', {
        notificationId: notification.notificationId,
        error: error.message
      });
    }
    results.processed++;
  }

  return results;
};

notificationSchema.statics.retryFailed = async function() {
  const failed = await this.find({
    status: 'pending',
    'delivery.nextRetryAt': { $lte: new Date() },
    'delivery.attempts': { $lt: 3 }
  }).limit(50);

  const results = {
    retried: 0,
    successful: 0,
    failed: 0
  };

  for (const notification of failed) {
    try {
      await notification.send();
      results.successful++;
    } catch (error) {
      results.failed++;
    }
    results.retried++;
  }

  return results;
};

notificationSchema.statics.cleanup = async function(options = {}) {
  const {
    archiveAfterDays = 30,
    deleteAfterDays = 90
  } = options;

  const now = new Date();
  const archiveDate = new Date(now - archiveAfterDays * 24 * 60 * 60 * 1000);
  const deleteDate = new Date(now - deleteAfterDays * 24 * 60 * 60 * 1000);

  // Archive old read notifications
  const archiveResult = await this.updateMany({
    createdAt: { $lt: archiveDate },
    'channels.inApp.seen': true,
    archived: false
  }, {
    archived: true,
    archivedAt: now
  });

  // Delete very old notifications
  const deleteResult = await this.deleteMany({
    createdAt: { $lt: deleteDate }
  });

  // Delete expired notifications
  const expiredResult = await this.deleteMany({
    expiresAt: { $lt: now }
  });

  logger.info('Notification cleanup completed', {
    archived: archiveResult.modifiedCount,
    deleted: deleteResult.deletedCount + expiredResult.deletedCount
  });

  return {
    archived: archiveResult.modifiedCount,
    deleted: deleteResult.deletedCount + expiredResult.deletedCount
  };
};

notificationSchema.statics.getStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = filters.startDate;
    if (filters.endDate) match.createdAt.$lte = filters.endDate;
  }

  if (filters.organizationId) {
    match.organizationId = filters.organizationId;
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: {
          $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
        },
        delivered: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        read: {
          $sum: { $cond: ['$channels.inApp.seen', 1, 0] }
        },
        clicked: {
          $sum: { $cond: ['$channels.inApp.clicked', 1, 0] }
        },
        avgResponseTime: {
          $avg: {
            $subtract: ['$channels.inApp.seenAt', '$createdAt']
          }
        },
        byType: { $push: '$type' },
        byCategory: { $push: '$category' },
        byChannel: {
          $push: {
            email: '$channels.email.sent',
            sms: '$channels.sms.sent',
            push: '$channels.push.sent'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        sent: 1,
        delivered: 1,
        failed: 1,
        read: 1,
        clicked: 1,
        deliveryRate: {
          $multiply: [{ $divide: ['$delivered', '$sent'] }, 100]
        },
        readRate: {
          $multiply: [{ $divide: ['$read', '$delivered'] }, 100]
        },
        clickRate: {
          $multiply: [{ $divide: ['$clicked', '$read'] }, 100]
        },
        avgResponseTime: { $divide: ['$avgResponseTime', 1000] } // Convert to seconds
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    read: 0,
    clicked: 0,
    deliveryRate: 0,
    readRate: 0,
    clickRate: 0,
    avgResponseTime: 0
  };
};

// Create and export model
const NotificationModel = BaseModel.createModel('Notification', notificationSchema);

module.exports = {
  schema: notificationSchema,
  model: NotificationModel
};