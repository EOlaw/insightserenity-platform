'use strict';

/**
 * @fileoverview Notification Model - Universal activity tracking and notification system
 * @module shared/lib/database/models/customer-services/core-business/notification-management/notification-model
 * @description Multi-tenant notification model supporting all entity types with multi-channel delivery
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const stringHelper = require('../../../../../utils/helpers/string-helper');

/**
 * Notification Schema Definition
 * Supports comprehensive notification and activity tracking for all entities
 */
const notificationSchemaDefinition = {
  // ==================== Core Identity ====================
  notificationId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^NOTIF-[A-Z0-9]{10,}$/,
    index: true,
    immutable: true
  },

  // ==================== Multi-Tenancy & Organization ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // ==================== Recipient Information ====================
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  recipientModel: {
    type: String,
    required: true,
    enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner'],
    index: true
  },

  recipientInfo: {
    name: String,
    email: String,
    phone: String,
    preferredChannel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app', 'all']
    }
  },

  // ==================== Notification Type & Category ====================
  notificationType: {
    type: String,
    enum: [
      // System notifications
      'system', 'security', 'account',
      
      // Activity notifications
      'message', 'mention', 'comment', 'reaction',
      
      // Business notifications
      'project_update', 'task_assigned', 'deadline_reminder',
      'document_shared', 'document_updated',
      
      // Meeting & Calendar
      'event_invitation', 'event_reminder', 'event_cancelled', 'event_updated',
      
      // Financial
      'invoice_sent', 'payment_received', 'payment_due', 'subscription_update',
      
      // Recruitment
      'application_received', 'interview_scheduled', 'candidate_update',
      
      // Client Management
      'client_update', 'engagement_update', 'contract_expiring',
      
      // General
      'alert', 'info', 'success', 'warning', 'error'
    ],
    required: true,
    index: true
  },

  category: {
    type: String,
    enum: [
      'security', 'updates', 'marketing', 'social', 'billing',
      'projects', 'messages', 'calendar', 'documents', 'system', 'other'
    ],
    required: true,
    index: true
  },

  // ==================== Content ====================
  content: {
    title: {
      type: String,
      required: true,
      maxlength: 200
    },
    body: {
      type: String,
      required: true,
      maxlength: 2000
    },
    summary: {
      type: String,
      maxlength: 500
    },
    icon: String,
    iconColor: String,
    actionText: String,
    actionUrl: String
  },

  // ==================== Priority & Importance ====================
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent', 'critical'],
    default: 'medium',
    index: true
  },

  importance: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },

  // ==================== Source & Trigger ====================
  source: {
    // What triggered this notification
    triggerId: {
      type: mongoose.Schema.Types.ObjectId
    },
    triggerModel: {
      type: String,
      enum: [
        'Message', 'Comment', 'CalendarEvent', 'Document', 'Project',
        'Task', 'Invoice', 'Application', 'Engagement', 'Contract', 'System'
      ]
    },
    triggerAction: {
      type: String,
      enum: [
        'created', 'updated', 'deleted', 'shared', 'mentioned',
        'assigned', 'completed', 'cancelled', 'approved', 'rejected',
        'expired', 'reminder', 'status_changed'
      ]
    },
    triggeredBy: {
      actorId: {
        type: mongoose.Schema.Types.ObjectId
      },
      actorModel: {
        type: String,
        enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner', 'System']
      },
      actorInfo: {
        name: String,
        email: String,
        avatar: String
      }
    },
    triggeredAt: {
      type: Date,
      default: Date.now
    }
  },

  // ==================== Related Entities ====================
  relatedEntities: [{
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    entityModel: {
      type: String,
      required: true,
      enum: [
        'User', 'Client', 'Consultant', 'Candidate', 'Partner',
        'Project', 'Engagement', 'Job', 'Application', 'Document',
        'CalendarEvent', 'Task', 'Invoice', 'Contract'
      ]
    },
    role: {
      type: String,
      enum: ['primary', 'secondary', 'mentioned', 'related']
    }
  }],

  // ==================== Delivery Channels ====================
  channels: {
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      delivered: Boolean,
      deliveredAt: Date,
      read: Boolean,
      readAt: Date
    },
    
    email: {
      enabled: Boolean,
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      opened: Boolean,
      openedAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      bounced: Boolean,
      bouncedAt: Date,
      messageId: String,
      error: String
    },
    
    sms: {
      enabled: Boolean,
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      messageId: String,
      error: String
    },
    
    push: {
      enabled: Boolean,
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      deviceTokens: [String],
      error: String
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    current: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: Date,
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    archivedAt: Date,
    expiresAt: Date
  },

  // ==================== User Actions ====================
  actions: [{
    actionType: {
      type: String,
      enum: ['clicked', 'dismissed', 'snoozed', 'archived', 'flagged', 'forwarded']
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }],

  // ==================== Grouping & Threading ====================
  grouping: {
    groupId: String, // For grouping similar notifications
    threadId: String, // For threading related notifications
    isGrouped: Boolean,
    groupCount: Number,
    latestInGroup: Boolean
  },

  // ==================== Scheduling ====================
  scheduling: {
    scheduledFor: Date,
    timezone: String,
    recurring: {
      enabled: Boolean,
      pattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly']
      },
      interval: Number,
      endDate: Date
    }
  },

  // ==================== Preferences & Rules ====================
  preferences: {
    canDismiss: {
      type: Boolean,
      default: true
    },
    canSnooze: {
      type: Boolean,
      default: true
    },
    requiresAction: {
      type: Boolean,
      default: false
    },
    persistUntilRead: {
      type: Boolean,
      default: false
    },
    playSound: {
      type: Boolean,
      default: false
    },
    showBadge: {
      type: Boolean,
      default: true
    }
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    deliveryAttempts: {
      type: Number,
      default: 0
    },
    lastDeliveryAttempt: Date,
    deliveryDuration: Number, // milliseconds
    engagementScore: Number,
    clickThroughRate: Number
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['system', 'manual', 'automation', 'workflow', 'integration'],
      default: 'system'
    },
    campaignId: String,
    batchId: String,
    templateId: String,
    tags: [String],
    customData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    flags: {
      isImportant: {
        type: Boolean,
        default: false
      },
      requiresAcknowledgment: {
        type: Boolean,
        default: false
      },
      isSilent: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Soft Delete ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date
};

const notificationSchema = new Schema(notificationSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== Indexes ====================
notificationSchema.index({ tenantId: 1, notificationId: 1 }, { unique: true });
notificationSchema.index({ tenantId: 1, recipientId: 1, 'status.isRead': 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, recipientId: 1, notificationType: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, recipientId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, 'status.current': 1, 'scheduling.scheduledFor': 1 });
notificationSchema.index({ tenantId: 1, 'grouping.groupId': 1 });
notificationSchema.index({ tenantId: 1, 'source.triggerId': 1 });
notificationSchema.index({ 'status.expiresAt': 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ searchTokens: 1 });

// Text search index
notificationSchema.index({
  'content.title': 'text',
  'content.body': 'text'
});

// ==================== Virtual Fields ====================
notificationSchema.virtual('isUnread').get(function() {
  return !this.status.isRead;
});

notificationSchema.virtual('isExpired').get(function() {
  return this.status.expiresAt && this.status.expiresAt < new Date();
});

notificationSchema.virtual('isDelivered').get(function() {
  return this.channels.inApp.delivered || 
         this.channels.email.delivered || 
         this.channels.sms.delivered || 
         this.channels.push.delivered;
});

notificationSchema.virtual('primaryChannel').get(function() {
  if (this.channels.inApp.enabled) return 'in_app';
  if (this.channels.email.enabled) return 'email';
  if (this.channels.push.enabled) return 'push';
  if (this.channels.sms.enabled) return 'sms';
  return 'in_app';
});

// ==================== Pre-save Middleware ====================
notificationSchema.pre('save', async function(next) {
  try {
    if (!this.notificationId && this.isNew) {
      this.notificationId = await this.constructor.generateNotificationId(this.tenantId);
    }

    // Auto-expire old notifications if not persistent
    if (!this.status.expiresAt && !this.preferences.persistUntilRead) {
      const expiryDays = 30;
      this.status.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    this.updateSearchTokens();
    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
notificationSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  if (this.content.title) {
    this.content.title.toLowerCase().split(/\s+/).forEach(token => {
      if (token.length > 2) tokens.add(token);
    });
  }
  
  if (this.content.body) {
    this.content.body.toLowerCase().split(/\s+/).forEach(token => {
      if (token.length > 2) tokens.add(token);
    });
  }
  
  if (this.notificationId) {
    tokens.add(this.notificationId.toLowerCase());
  }
  
  this.searchTokens = Array.from(tokens);
};

notificationSchema.methods.markAsRead = async function() {
  this.status.isRead = true;
  this.status.readAt = new Date();
  this.channels.inApp.read = true;
  this.channels.inApp.readAt = new Date();
  
  await this.save();
  
  logger.debug('Notification marked as read', {
    notificationId: this.notificationId,
    recipientId: this.recipientId
  });
  
  return true;
};

notificationSchema.methods.markAsUnread = async function() {
  this.status.isRead = false;
  this.status.readAt = null;
  this.channels.inApp.read = false;
  this.channels.inApp.readAt = null;
  
  await this.save();
  return true;
};

notificationSchema.methods.archive = async function() {
  this.status.isArchived = true;
  this.status.archivedAt = new Date();
  
  await this.save();
  return true;
};

notificationSchema.methods.dismiss = async function() {
  if (!this.preferences.canDismiss) {
    throw new AppError('Notification cannot be dismissed', 400, 'CANNOT_DISMISS');
  }
  
  this.actions.push({
    actionType: 'dismissed',
    performedAt: new Date()
  });
  
  this.status.isRead = true;
  this.status.readAt = new Date();
  
  await this.save();
  return true;
};

notificationSchema.methods.snooze = async function(snoozeUntil) {
  if (!this.preferences.canSnooze) {
    throw new AppError('Notification cannot be snoozed', 400, 'CANNOT_SNOOZE');
  }
  
  this.actions.push({
    actionType: 'snoozed',
    performedAt: new Date(),
    metadata: { snoozeUntil }
  });
  
  this.scheduling.scheduledFor = snoozeUntil;
  
  await this.save();
  return true;
};

notificationSchema.methods.recordClick = async function() {
  this.actions.push({
    actionType: 'clicked',
    performedAt: new Date()
  });
  
  if (this.channels.inApp.enabled) {
    this.channels.inApp.read = true;
    this.channels.inApp.readAt = new Date();
  }
  
  this.status.isRead = true;
  this.status.readAt = new Date();
  
  await this.save();
  return true;
};

notificationSchema.methods.updateDeliveryStatus = async function(channel, status, metadata = {}) {
  const channelData = this.channels[channel];
  
  if (!channelData) {
    throw new AppError('Invalid channel', 400, 'INVALID_CHANNEL');
  }
  
  switch (status) {
    case 'sent':
      channelData.sent = true;
      channelData.sentAt = new Date();
      if (metadata.messageId) channelData.messageId = metadata.messageId;
      break;
      
    case 'delivered':
      channelData.delivered = true;
      channelData.deliveredAt = new Date();
      this.status.current = 'delivered';
      break;
      
    case 'opened':
      if (channel === 'email') {
        channelData.opened = true;
        channelData.openedAt = new Date();
      }
      break;
      
    case 'clicked':
      if (channel === 'email' || channel === 'push') {
        channelData.clicked = true;
        channelData.clickedAt = new Date();
      }
      break;
      
    case 'failed':
      channelData.error = metadata.error;
      this.status.current = 'failed';
      break;
  }
  
  this.analytics.deliveryAttempts += 1;
  this.analytics.lastDeliveryAttempt = new Date();
  
  await this.save();
  return true;
};

// ==================== Static Methods ====================
notificationSchema.statics.generateNotificationId = async function(tenantId) {
  const prefix = 'NOTIF';
  const randomPart = stringHelper.generateRandomString(10, 'ALPHANUMERIC').toUpperCase();
  return `${prefix}-${randomPart}`;
};

notificationSchema.statics.findByRecipient = async function(tenantId, recipientId, options = {}) {
  const {
    unreadOnly = false,
    category,
    type,
    includeArchived = false,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = {
    tenantId,
    recipientId,
    isDeleted: false
  };
  
  if (unreadOnly) {
    query['status.isRead'] = false;
  }
  
  if (!includeArchived) {
    query['status.isArchived'] = false;
  }
  
  if (category) {
    query.category = category;
  }
  
  if (type) {
    query.notificationType = type;
  }
  
  const [notifications, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(query)
  ]);
  
  return {
    notifications,
    total,
    hasMore: total > skip + notifications.length
  };
};

notificationSchema.statics.getUnreadCount = async function(tenantId, recipientId, options = {}) {
  const { category } = options;
  
  const query = {
    tenantId,
    recipientId,
    'status.isRead': false,
    'status.isArchived': false,
    isDeleted: false
  };
  
  if (category) {
    query.category = category;
  }
  
  return await this.countDocuments(query);
};

notificationSchema.statics.markAllAsRead = async function(tenantId, recipientId, options = {}) {
  const { category, type } = options;
  
  const query = {
    tenantId,
    recipientId,
    'status.isRead': false,
    isDeleted: false
  };
  
  if (category) {
    query.category = category;
  }
  
  if (type) {
    query.notificationType = type;
  }
  
  const result = await this.updateMany(query, {
    $set: {
      'status.isRead': true,
      'status.readAt': new Date(),
      'channels.inApp.read': true,
      'channels.inApp.readAt': new Date()
    }
  });
  
  return result.modifiedCount;
};

notificationSchema.statics.getPendingScheduled = async function() {
  const now = new Date();
  
  const notifications = await this.find({
    'status.current': 'pending',
    'scheduling.scheduledFor': { $lte: now },
    isDeleted: false
  })
  .sort({ 'scheduling.scheduledFor': 1 })
  .limit(100);
  
  return notifications;
};

notificationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    'status.expiresAt': { $lt: new Date() },
    'status.isRead': true
  });
  
  logger.info('Cleaned up expired notifications', {
    deletedCount: result.deletedCount
  });
  
  return result.deletedCount;
};

notificationSchema.statics.getNotificationStats = async function(tenantId, recipientId) {
  const stats = await this.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        recipientId: new mongoose.Types.ObjectId(recipientId),
        isDeleted: false
      }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ['$status.isRead', false] }, 1, 0] }
              },
              archived: {
                $sum: { $cond: ['$status.isArchived', 1, 0] }
              }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ['$status.isRead', false] }, 1, 0] }
              }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$notificationType',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);
  
  const result = stats[0];
  
  return {
    overview: result.overview[0] || { total: 0, unread: 0, archived: 0 },
    byCategory: result.byCategory,
    byType: result.byType
  };
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: notificationSchema,
  modelName: 'Notification',
  
  createModel: function(connection) {
    if (connection) {
      return connection.model('Notification', notificationSchema);
    } else {
      return mongoose.model('Notification', notificationSchema);
    }
  }
};

module.exports.Notification = mongoose.model('Notification', notificationSchema);
module.exports.notificationSchema = notificationSchema;