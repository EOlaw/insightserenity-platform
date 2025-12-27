/**
 * @fileoverview Notification Model for Customer Services - Universal Multi-Role Notification System
 * @module shared/lib/database/models/customer-services/core-business/notification-management/notification-model.js
 * @description Universal notification model supporting all user roles with entity relationships
 * @requires mongoose
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Notification Schema Definition
 * Universal notification system that works across all user roles (client, consultant, admin, partner, etc.)
 */
const notificationSchemaDefinition = {
  // ==================== Core Fields ====================

  /**
   * User who receives this notification
   * Can be any user regardless of role
   */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  /**
   * Role of the user receiving the notification
   * Used to contextualize notification content
   */
  userRole: {
    type: String,
    enum: ['client', 'consultant', 'admin', 'manager', 'partner', 'candidate', 'guest', 'super_admin'],
    required: true,
    index: true
  },

  /**
   * Tenant ID for multi-tenant isolation
   */
  tenantId: {
    type: String,
    required: true,
    index: true,
    default: 'default'
  },

  // ==================== Notification Content ====================

  /**
   * Notification title - short summary
   */
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  /**
   * Notification message - detailed content
   */
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },

  /**
   * Notification type/category
   */
  type: {
    type: String,
    enum: [
      // System notifications
      'system',
      'security',
      'update',

      // Authentication & Account
      'account_created',
      'email_verified',
      'password_changed',
      'login_alert',

      // Consultation-related
      'consultation_booked',
      'consultation_confirmed',
      'consultation_cancelled',
      'consultation_rescheduled',
      'consultation_reminder',
      'consultation_completed',

      // Payment & Billing
      'payment_received',
      'payment_failed',
      'refund_processed',
      'invoice_generated',
      'subscription_renewed',
      'subscription_cancelled',

      // Messaging & Communication
      'message_received',
      'mention',
      'comment',
      'reply',

      // Project & Task
      'task_assigned',
      'task_completed',
      'project_update',
      'deadline_approaching',

      // Client-specific
      'consultant_assigned',
      'document_shared',
      'report_available',

      // Consultant-specific
      'client_request',
      'review_received',
      'earnings_updated',
      'availability_request',

      // General
      'info',
      'warning',
      'error',
      'success',
      'announcement'
    ],
    required: true,
    index: true
  },

  /**
   * Priority level
   */
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true
  },

  // ==================== Status & Read Tracking ====================

  /**
   * Whether the notification has been read
   */
  read: {
    type: Boolean,
    default: false,
    index: true
  },

  /**
   * Timestamp when notification was read
   */
  readAt: {
    type: Date,
    default: null
  },

  /**
   * Notification status
   */
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },

  // ==================== Action & Navigation ====================

  /**
   * Action to take when notification is clicked
   */
  action: {
    // Type of action (navigate, external, modal, etc.)
    type: {
      type: String,
      enum: ['navigate', 'external_link', 'modal', 'download', 'none'],
      default: 'none'
    },

    // URL or path to navigate to
    url: {
      type: String,
      trim: true
    },

    // Additional action data
    data: {
      type: Schema.Types.Mixed
    }
  },

  // ==================== Entity Relationships ====================

  /**
   * Related entity references
   * Allows linking notifications to specific resources
   */
  relatedEntity: {
    // Type of entity (consultation, payment, user, etc.)
    entityType: {
      type: String,
      enum: [
        'user',
        'client',
        'consultant',
        'consultation',
        'payment',
        'invoice',
        'project',
        'task',
        'message',
        'document',
        'review',
        'application',
        'job',
        'candidate'
      ]
    },

    // ID of the related entity
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    },

    // Additional entity metadata
    metadata: {
      type: Schema.Types.Mixed
    }
  },

  // ==================== Sender Information ====================

  /**
   * User or system that triggered the notification
   */
  sender: {
    // Sender user ID (null for system notifications)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Sender name (for display)
    name: {
      type: String,
      trim: true
    },

    // Sender type
    type: {
      type: String,
      enum: ['user', 'system', 'automated'],
      default: 'system'
    }
  },

  // ==================== Delivery Channels ====================

  /**
   * Channels through which notification should be delivered
   */
  channels: {
    // In-app notification (always true)
    inApp: {
      type: Boolean,
      default: true
    },

    // Email notification
    email: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    },

    // SMS notification
    sms: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    },

    // Push notification
    push: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    }
  },

  // ==================== Scheduling ====================

  /**
   * Scheduled delivery time (null for immediate)
   */
  scheduledFor: {
    type: Date,
    default: null
  },

  /**
   * Expiration time (after which notification should be removed)
   */
  expiresAt: {
    type: Date,
    default: null
  },

  // ==================== Metadata ====================

  /**
   * Additional metadata
   */
  metadata: {
    // Source of notification
    source: String,

    // Campaign or batch ID
    campaignId: String,

    // Tags for categorization
    tags: [String],

    // Custom data
    custom: Schema.Types.Mixed
  }
};

// Create schema with timestamps
const notificationSchema = new Schema(notificationSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== Indexes ====================

// Compound index for efficient user notification queries
notificationSchema.index({ userId: 1, read: 1, status: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, read: 1 });

// Tenant isolation
notificationSchema.index({ tenantId: 1, userId: 1 });

// Status and priority queries
notificationSchema.index({ status: 1, priority: -1, createdAt: -1 });

// Scheduled notifications
notificationSchema.index({ scheduledFor: 1, status: 1 });

// Expiration cleanup
notificationSchema.index({ expiresAt: 1 });

// Entity relationship queries
notificationSchema.index({ 'relatedEntity.entityType': 1, 'relatedEntity.entityId': 1 });

// ==================== Virtual Fields ====================

/**
 * Check if notification is expired
 */
notificationSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return this.expiresAt < new Date();
});

/**
 * Check if notification is scheduled for future
 */
notificationSchema.virtual('isScheduled').get(function() {
  if (!this.scheduledFor) return false;
  return this.scheduledFor > new Date();
});

/**
 * Check if notification is unread and active
 */
notificationSchema.virtual('isUnread').get(function() {
  return !this.read && this.status === 'active' && !this.isExpired;
});

// ==================== Instance Methods ====================

/**
 * Mark notification as read
 */
notificationSchema.methods.markAsRead = async function() {
  if (this.read) return this;

  this.read = true;
  this.readAt = new Date();
  await this.save();

  return this;
};

/**
 * Mark notification as unread
 */
notificationSchema.methods.markAsUnread = async function() {
  this.read = false;
  this.readAt = null;
  await this.save();

  return this;
};

/**
 * Archive notification
 */
notificationSchema.methods.archive = async function() {
  this.status = 'archived';
  await this.save();

  return this;
};

/**
 * Soft delete notification
 */
notificationSchema.methods.softDelete = async function() {
  this.status = 'deleted';
  await this.save();

  return this;
};

/**
 * Check if notification should be sent via email
 */
notificationSchema.methods.shouldSendEmail = function() {
  return !this.channels.email.sent &&
         this.priority !== 'low' &&
         !this.isExpired;
};

/**
 * Record email sent
 */
notificationSchema.methods.recordEmailSent = async function(error = null) {
  this.channels.email.sent = !error;
  this.channels.email.sentAt = new Date();
  if (error) {
    this.channels.email.error = error.message || String(error);
  }
  await this.save();

  return this;
};

// ==================== Static Methods ====================

/**
 * Get all notifications for a user
 */
notificationSchema.statics.getByUserId = async function(userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    unreadOnly = false,
    type = null,
    priority = null,
    sort = { createdAt: -1 }
  } = options;

  const query = {
    userId,
    status: 'active'
  };

  if (unreadOnly) {
    query.read = false;
  }

  if (type) {
    query.type = type;
  }

  if (priority) {
    query.priority = priority;
  }

  // Exclude expired notifications
  query.$or = [
    { expiresAt: { $exists: false } },
    { expiresAt: { $gt: new Date() } }
  ];

  const [notifications, total, unreadCount] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .populate('sender.userId', 'profile.firstName profile.lastName profile.avatar'),
    this.countDocuments(query),
    this.countDocuments({ userId, read: false, status: 'active' })
  ]);

  return {
    notifications,
    total,
    unreadCount,
    hasMore: total > skip + notifications.length
  };
};

/**
 * Get unread count for user
 */
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    userId,
    read: false,
    status: 'active',
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

/**
 * Mark all notifications as read for a user
 */
notificationSchema.statics.markAllAsRead = async function(userId) {
  const result = await this.updateMany(
    { userId, read: false, status: 'active' },
    {
      $set: {
        read: true,
        readAt: new Date()
      }
    }
  );

  return result;
};

/**
 * Create notification for user
 */
notificationSchema.statics.createForUser = async function(userId, userRole, notificationData) {
  const notification = new this({
    userId,
    userRole,
    ...notificationData,
    status: 'active'
  });

  await notification.save();

  return notification;
};

/**
 * Create bulk notifications for multiple users
 */
notificationSchema.statics.createBulk = async function(notifications) {
  const results = await this.insertMany(
    notifications.map(n => ({
      ...n,
      status: 'active',
      createdAt: new Date()
    }))
  );

  return results;
};

/**
 * Delete old archived/read notifications
 */
notificationSchema.statics.cleanupOld = async function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await this.deleteMany({
    $or: [
      { status: 'deleted' },
      { status: 'archived', updatedAt: { $lt: cutoffDate } },
      { read: true, createdAt: { $lt: cutoffDate } }
    ]
  });

  return result;
};

/**
 * Delete expired notifications
 */
notificationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $exists: true, $lt: new Date() }
  });

  return result;
};

/**
 * Get notification statistics for user
 */
notificationSchema.statics.getStats = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        status: 'active'
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
                $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
              },
              byPriority: {
                $push: {
                  priority: '$priority',
                  read: '$read'
                }
              }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  return stats[0] || { overview: [], byType: [] };
};

// ==================== Middleware ====================

/**
 * Pre-save middleware
 */
notificationSchema.pre('save', function(next) {
  // Set default expiration for certain notification types (7 days)
  if (!this.expiresAt && this.type === 'announcement') {
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  next();
});

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: notificationSchema,
  modelName: 'Notification',

  // Legacy export for backward compatibility
  createModel: function(connection) {
    if (connection) {
      return connection.model('Notification', notificationSchema);
    } else {
      // Fallback to default mongoose connection
      return mongoose.model('Notification', notificationSchema);
    }
  }
};

// For backward compatibility, also export as direct model
module.exports.Notification = mongoose.model('Notification', notificationSchema);
module.exports.notificationSchema = notificationSchema;
