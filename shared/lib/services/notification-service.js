'use strict';

/**
 * @fileoverview Unified notification service for multi-channel delivery
 * @module shared/lib/services/notification-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/sms-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/notification-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/config
 */

const EmailService = require('./email-service');
const SMSService = require('./sms-service');
const CacheService = require('./cache-service');
const WebSocketService = require('./websocket-service');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const NotificationModel = require('../database/models/notification-model');
const UserModel = require('../database/models/user-model');
const OrganizationModel = require('../database/models/organization-model');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class NotificationService
 * @description Comprehensive notification service supporting multiple channels and delivery strategies
 */
class NotificationService {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #channels = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #templates = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #preferences = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #processingQueue = new Set();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #notificationStats = new Map();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #CHANNEL_TYPES = {
    EMAIL: 'email',
    SMS: 'sms',
    PUSH: 'push',
    IN_APP: 'in_app',
    WEBHOOK: 'webhook'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #PRIORITY_LEVELS = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4,
    CRITICAL: 5
  };

  /**
   * Initialize notification service
   * @static
   * @param {Object} [options] - Configuration options
   * @returns {Promise<void>}
   */
  static async initialize(options = {}) {
    if (this.#initialized) {
      return;
    }

    try {
      this.#config = {
        channels: {
          email: { enabled: true, ...config.notifications?.channels?.email },
          sms: { enabled: true, ...config.notifications?.channels?.sms },
          push: { enabled: true, ...config.notifications?.channels?.push },
          inApp: { enabled: true, ...config.notifications?.channels?.inApp },
          webhook: { enabled: true, ...config.notifications?.channels?.webhook }
        },
        defaultChannel: config.notifications?.defaultChannel || 'email',
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelay: 1000,
          ...config.notifications?.retryPolicy
        },
        batching: {
          enabled: true,
          maxBatchSize: 100,
          batchInterval: 5000, // 5 seconds
          ...config.notifications?.batching
        },
        scheduling: {
          enabled: true,
          timezone: 'UTC',
          ...config.notifications?.scheduling
        },
        preferences: {
          respectDoNotDisturb: true,
          defaultDoNotDisturbStart: '22:00',
          defaultDoNotDisturbEnd: '08:00',
          ...config.notifications?.preferences
        },
        ...options
      };

      // Initialize services
      this.#cacheService = new CacheService({ namespace: 'notifications' });
      
      // Initialize channels
      await this.#initializeChannels();
      
      // Load notification templates
      await this.#loadTemplates();

      // Start batch processor
      if (this.#config.batching.enabled) {
        this.#startBatchProcessor();
      }

      this.#initialized = true;
      logger.info('NotificationService initialized', {
        channels: Array.from(this.#channels.keys()),
        templatesLoaded: this.#templates.size
      });

    } catch (error) {
      logger.error('Failed to initialize NotificationService', { error: error.message });
      throw new AppError(
        'Notification service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Send notification
   * @static
   * @param {Object} options - Notification options
   * @param {string|Array<string>} options.recipients - Recipient(s)
   * @param {string} options.type - Notification type/template
   * @param {Object} [options.data] - Template data
   * @param {Array<string>} [options.channels] - Delivery channels
   * @param {number} [options.priority] - Priority level
   * @param {Date} [options.scheduledFor] - Schedule delivery time
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @param {Object} [options.metadata] - Additional metadata
   * @param {Object} [options.channelOptions] - Channel-specific options
   * @returns {Promise<Object>} Notification result
   */
  static async send(options) {
    await this.initialize();

    const notificationId = this.#generateNotificationId();
    const startTime = Date.now();

    try {
      // Validate and enrich options
      const validated = await this.#validateNotificationOptions(options);
      
      // Check if notification is duplicate
      const isDuplicate = await this.#checkDuplicate(validated);
      if (isDuplicate) {
        logger.warn('Duplicate notification detected', { notificationId });
        return { 
          notificationId, 
          status: 'duplicate', 
          message: 'Notification already sent recently' 
        };
      }

      // Check if should batch
      if (this.#shouldBatch(validated)) {
        return await this.#addToBatch(validated, notificationId);
      }

      // Check if should schedule
      if (validated.scheduledFor && validated.scheduledFor > new Date()) {
        return await this.#scheduleNotification(validated, notificationId);
      }

      // Process notification immediately
      const result = await this.#processNotification(validated, notificationId);

      // Record notification
      await this.#recordNotification({
        notificationId,
        ...validated,
        result,
        duration: Date.now() - startTime
      });

      logger.info('Notification sent', {
        notificationId,
        type: validated.type,
        channels: result.channels,
        duration: Date.now() - startTime
      });

      return {
        notificationId,
        status: 'sent',
        channels: result.channels,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Notification send failed', {
        notificationId,
        error: error.message,
        type: options.type
      });

      // Record failed notification
      await this.#recordNotification({
        notificationId,
        ...options,
        error: error.message,
        status: 'failed',
        duration: Date.now() - startTime
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to send notification',
        500,
        ERROR_CODES.NOTIFICATION_SEND_FAILED,
        { notificationId, originalError: error.message }
      );
    }
  }

  /**
   * Send bulk notifications
   * @static
   * @param {Array<Object>} notifications - Array of notification options
   * @param {Object} [options] - Bulk send options
   * @returns {Promise<Object>} Bulk send results
   */
  static async sendBulk(notifications, options = {}) {
    await this.initialize();

    const bulkId = this.#generateBulkId();
    const results = {
      bulkId,
      total: notifications.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    try {
      // Process in batches
      const batchSize = options.batchSize || 100;
      
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(notification => this.send({
            ...notification,
            metadata: {
              ...notification.metadata,
              bulkId
            }
          }))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push({
              index: i + index,
              error: result.reason.message
            });
          }
        });

        // Delay between batches
        if (i + batchSize < notifications.length && options.delayBetweenBatches) {
          await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatches));
        }
      }

      logger.info('Bulk notifications completed', results);
      return results;

    } catch (error) {
      logger.error('Bulk notification failed', { bulkId, error: error.message });
      throw new AppError(
        'Bulk notification failed',
        500,
        ERROR_CODES.BULK_NOTIFICATION_FAILED,
        { bulkId, results }
      );
    }
  }

  /**
   * Get user notification preferences
   * @static
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User preferences
   */
  static async getUserPreferences(userId) {
    await this.initialize();

    // Check cache
    const cached = await this.#cacheService.get(`preferences:${userId}`);
    if (cached) {
      return cached;
    }

    // Get from database
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(
        'User not found',
        404,
        ERROR_CODES.USER_NOT_FOUND
      );
    }

    const preferences = user.notificationPreferences || this.#getDefaultPreferences();
    
    // Cache preferences
    await this.#cacheService.set(`preferences:${userId}`, preferences, 3600);
    
    return preferences;
  }

  /**
   * Update user notification preferences
   * @static
   * @param {string} userId - User ID
   * @param {Object} preferences - New preferences
   * @returns {Promise<Object>} Updated preferences
   */
  static async updateUserPreferences(userId, preferences) {
    await this.initialize();

    try {
      // Update in database
      const user = await UserModel.findByIdAndUpdate(
        userId,
        { 
          notificationPreferences: {
            ...this.#getDefaultPreferences(),
            ...preferences,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!user) {
        throw new AppError(
          'User not found',
          404,
          ERROR_CODES.USER_NOT_FOUND
        );
      }

      // Update cache
      await this.#cacheService.set(
        `preferences:${userId}`, 
        user.notificationPreferences, 
        3600
      );

      logger.info('User preferences updated', { userId });
      return user.notificationPreferences;

    } catch (error) {
      logger.error('Failed to update preferences', { userId, error: error.message });
      throw error instanceof AppError ? error : new AppError(
        'Failed to update preferences',
        500,
        ERROR_CODES.PREFERENCE_UPDATE_FAILED
      );
    }
  }

  /**
   * Get notification history
   * @static
   * @param {Object} options - Query options
   * @param {string} [options.userId] - Filter by user
   * @param {string} [options.organizationId] - Filter by organization
   * @param {string} [options.type] - Filter by type
   * @param {string} [options.channel] - Filter by channel
   * @param {Date} [options.startDate] - Start date
   * @param {Date} [options.endDate] - End date
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.pageSize=20] - Page size
   * @returns {Promise<Object>} Notification history
   */
  static async getHistory(options = {}) {
    await this.initialize();

    const {
      userId,
      organizationId,
      type,
      channel,
      startDate,
      endDate,
      page = 1,
      pageSize = 20
    } = options;

    try {
      const query = {};
      
      if (userId) query.userId = userId;
      if (organizationId) query.organizationId = organizationId;
      if (type) query.type = type;
      if (channel) query['channels.channel'] = channel;
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      const totalCount = await NotificationModel.countDocuments(query);
      
      const notifications = await NotificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

      return {
        notifications,
        pagination: {
          total: totalCount,
          page,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize)
        }
      };

    } catch (error) {
      logger.error('Failed to get notification history', { error: error.message });
      throw new AppError(
        'Failed to get notification history',
        500,
        ERROR_CODES.HISTORY_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Mark notification as read
   * @static
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  static async markAsRead(notificationId, userId) {
    await this.initialize();

    try {
      const notification = await NotificationModel.findOneAndUpdate(
        { 
          _id: notificationId,
          userId,
          'channels.channel': 'in_app'
        },
        {
          $set: {
            'channels.$.readAt': new Date(),
            'channels.$.status': 'read'
          }
        },
        { new: true }
      );

      if (!notification) {
        throw new AppError(
          'Notification not found',
          404,
          ERROR_CODES.NOTIFICATION_NOT_FOUND
        );
      }

      // Update cache
      await this.#cacheService.delete(`unread:${userId}`);

      // Send real-time update
      if (this.#channels.has('in_app')) {
        const inAppChannel = this.#channels.get('in_app');
        await inAppChannel.updateStatus(userId, notificationId, 'read');
      }

      return true;

    } catch (error) {
      logger.error('Failed to mark notification as read', { 
        notificationId, 
        error: error.message 
      });
      throw error instanceof AppError ? error : new AppError(
        'Failed to mark notification as read',
        500,
        ERROR_CODES.NOTIFICATION_UPDATE_FAILED
      );
    }
  }

  /**
   * Get unread notification count
   * @static
   * @param {string} userId - User ID
   * @returns {Promise<number>} Unread count
   */
  static async getUnreadCount(userId) {
    await this.initialize();

    // Check cache
    const cached = await this.#cacheService.get(`unread:${userId}`);
    if (cached !== null) {
      return cached;
    }

    try {
      const count = await NotificationModel.countDocuments({
        userId,
        'channels': {
          $elemMatch: {
            channel: 'in_app',
            status: { $ne: 'read' }
          }
        }
      });

      // Cache for 5 minutes
      await this.#cacheService.set(`unread:${userId}`, count, 300);

      return count;

    } catch (error) {
      logger.error('Failed to get unread count', { userId, error: error.message });
      return 0;
    }
  }

  /**
   * Register notification template
   * @static
   * @param {string} name - Template name
   * @param {Object} template - Template configuration
   */
  static registerTemplate(name, template) {
    if (!name || !template) {
      throw new AppError(
        'Invalid template configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#templates.set(name, {
      ...template,
      channels: template.channels || [this.#config.defaultChannel],
      priority: template.priority || this.#PRIORITY_LEVELS.NORMAL
    });

    logger.info('Notification template registered', { name });
  }

  /**
   * Get notification statistics
   * @static
   * @returns {Object} Notification statistics
   */
  static getStats() {
    const stats = {
      channels: {},
      totalSent: 0,
      totalFailed: 0,
      avgDeliveryTime: 0,
      byType: {}
    };

    let totalDeliveryTime = 0;
    let deliveryCount = 0;

    this.#notificationStats.forEach((channelStats, channel) => {
      stats.channels[channel] = {
        sent: channelStats.sent,
        failed: channelStats.failed,
        successRate: channelStats.sent > 0 
          ? ((channelStats.sent - channelStats.failed) / channelStats.sent) * 100 
          : 0,
        avgDeliveryTime: channelStats.totalDeliveryTime / channelStats.sent || 0
      };

      stats.totalSent += channelStats.sent;
      stats.totalFailed += channelStats.failed;
      totalDeliveryTime += channelStats.totalDeliveryTime;
      deliveryCount += channelStats.sent;

      // Aggregate by type
      channelStats.byType?.forEach((count, type) => {
        stats.byType[type] = (stats.byType[type] || 0) + count;
      });
    });

    stats.avgDeliveryTime = deliveryCount > 0 ? totalDeliveryTime / deliveryCount : 0;

    return stats;
  }

  /**
   * @private
   * Initialize notification channels
   */
  static async #initializeChannels() {
    // Email channel
    if (this.#config.channels.email.enabled) {
      await EmailService.initialize();
      this.#channels.set('email', {
        send: async (recipient, notification) => {
          return await EmailService.sendEmail({
            to: recipient.email || recipient,
            subject: notification.subject,
            template: notification.template,
            templateData: notification.data,
            userId: notification.userId,
            organizationId: notification.organizationId
          });
        }
      });
    }

    // SMS channel
    if (this.#config.channels.sms.enabled) {
      await SMSService.initialize();
      this.#channels.set('sms', {
        send: async (recipient, notification) => {
          return await SMSService.sendSMS({
            to: recipient.phone || recipient,
            template: notification.template,
            templateData: notification.data,
            userId: notification.userId,
            organizationId: notification.organizationId
          });
        }
      });
    }

    // Push notification channel
    if (this.#config.channels.push.enabled) {
      this.#channels.set('push', {
        send: async (recipient, notification) => {
          // Implement push notification logic
          logger.debug('Push notification sent (placeholder)', { recipient });
          return { success: true, messageId: 'push_' + Date.now() };
        }
      });
    }

    // In-app notification channel
    if (this.#config.channels.inApp.enabled) {
      this.#channels.set('in_app', {
        send: async (recipient, notification) => {
          // Store in database
          const inAppNotification = await NotificationModel.create({
            userId: recipient.id || recipient,
            type: notification.type,
            title: notification.title,
            content: notification.content,
            data: notification.data,
            status: 'unread',
            channels: [{
              channel: 'in_app',
              status: 'delivered',
              deliveredAt: new Date()
            }]
          });

          // Send real-time update if WebSocket available
          if (WebSocketService && WebSocketService.isConnected(recipient.id || recipient)) {
            await WebSocketService.emit(recipient.id || recipient, 'notification', {
              id: inAppNotification._id,
              type: notification.type,
              title: notification.title,
              content: notification.content,
              timestamp: new Date()
            });
          }

          // Clear unread cache
          await this.#cacheService.delete(`unread:${recipient.id || recipient}`);

          return { 
            success: true, 
            notificationId: inAppNotification._id 
          };
        },
        updateStatus: async (userId, notificationId, status) => {
          if (WebSocketService && WebSocketService.isConnected(userId)) {
            await WebSocketService.emit(userId, 'notification:update', {
              id: notificationId,
              status
            });
          }
        }
      });
    }

    // Webhook channel
    if (this.#config.channels.webhook.enabled) {
      this.#channels.set('webhook', {
        send: async (recipient, notification) => {
          const WebhookService = require('./webhook-service');
          return await WebhookService.send({
            url: recipient.webhookUrl || recipient,
            data: {
              type: notification.type,
              title: notification.title,
              content: notification.content,
              data: notification.data,
              timestamp: new Date()
            }
          });
        }
      });
    }
  }

  /**
   * @private
   * Load notification templates
   */
  static async #loadTemplates() {
    const defaultTemplates = {
      'welcome': {
        channels: ['email', 'in_app'],
        priority: this.#PRIORITY_LEVELS.NORMAL,
        email: {
          subject: 'Welcome to {{organizationName}}!',
          template: 'welcome'
        },
        inApp: {
          title: 'Welcome!',
          content: 'Welcome to {{organizationName}}. Get started by exploring our features.'
        }
      },
      'password_reset': {
        channels: ['email'],
        priority: this.#PRIORITY_LEVELS.HIGH,
        email: {
          subject: 'Password Reset Request',
          template: 'password-reset'
        }
      },
      'account_verification': {
        channels: ['email', 'sms'],
        priority: this.#PRIORITY_LEVELS.HIGH,
        email: {
          subject: 'Verify your account',
          template: 'verification'
        },
        sms: {
          template: 'verification'
        }
      },
      'payment_received': {
        channels: ['email', 'in_app', 'push'],
        priority: this.#PRIORITY_LEVELS.NORMAL,
        email: {
          subject: 'Payment received - ${{amount}}',
          template: 'payment-received'
        },
        inApp: {
          title: 'Payment Received',
          content: 'We\'ve received your payment of ${{amount}}'
        },
        push: {
          title: 'Payment Received',
          body: 'Your payment of ${{amount}} has been processed'
        }
      },
      'task_reminder': {
        channels: ['email', 'push', 'in_app'],
        priority: this.#PRIORITY_LEVELS.NORMAL,
        scheduling: {
          allowScheduling: true,
          defaultOffset: -3600000 // 1 hour before
        }
      },
      'system_alert': {
        channels: ['email', 'sms', 'webhook'],
        priority: this.#PRIORITY_LEVELS.CRITICAL,
        batching: {
          enabled: false // Don't batch critical alerts
        }
      }
    };

    Object.entries(defaultTemplates).forEach(([name, template]) => {
      this.registerTemplate(name, template);
    });
  }

  /**
   * @private
   * Validate notification options
   */
  static async #validateNotificationOptions(options) {
    const validated = { ...options };

    // Validate recipients
    if (!validated.recipients) {
      throw new AppError(
        'Recipients are required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    validated.recipients = Array.isArray(validated.recipients) 
      ? validated.recipients 
      : [validated.recipients];

    // Validate type/template
    if (!validated.type) {
      throw new AppError(
        'Notification type is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Get template
    const template = this.#templates.get(validated.type);
    if (!template) {
      throw new AppError(
        `Template '${validated.type}' not found`,
        400,
        ERROR_CODES.TEMPLATE_NOT_FOUND
      );
    }

    // Set channels
    validated.channels = validated.channels || template.channels || [this.#config.defaultChannel];
    validated.priority = validated.priority || template.priority || this.#PRIORITY_LEVELS.NORMAL;

    // Enrich recipients with user data
    validated.recipients = await this.#enrichRecipients(validated.recipients);

    // Apply template data
    validated.template = template;

    return validated;
  }

  /**
   * @private
   * Enrich recipients with user data
   */
  static async #enrichRecipients(recipients) {
    const enriched = [];

    for (const recipient of recipients) {
      if (typeof recipient === 'string') {
        // Assume it's a user ID
        const user = await UserModel.findById(recipient).lean();
        if (user) {
          enriched.push({
            id: user._id,
            email: user.email,
            phone: user.phone,
            name: user.name,
            preferences: user.notificationPreferences || this.#getDefaultPreferences()
          });
        } else {
          // Might be email or phone
          enriched.push(recipient);
        }
      } else {
        enriched.push(recipient);
      }
    }

    return enriched;
  }

  /**
   * @private
   * Process notification
   */
  static async #processNotification(notification, notificationId) {
    const results = {
      channels: {},
      recipients: {}
    };

    // Process each recipient
    for (const recipient of notification.recipients) {
      const recipientResults = {};
      
      // Check preferences
      const allowedChannels = await this.#getAllowedChannels(
        recipient,
        notification.channels,
        notification.priority
      );

      // Send through each allowed channel
      for (const channel of allowedChannels) {
        try {
          const channelHandler = this.#channels.get(channel);
          if (!channelHandler) {
            logger.warn(`Channel '${channel}' not available`);
            continue;
          }

          // Prepare channel-specific notification
          const channelNotification = this.#prepareChannelNotification(
            notification,
            channel,
            recipient
          );

          // Send notification
          const result = await channelHandler.send(recipient, channelNotification);
          
          recipientResults[channel] = {
            success: true,
            messageId: result.messageId || result.notificationId,
            deliveredAt: new Date()
          };

          if (!results.channels[channel]) {
            results.channels[channel] = { sent: 0, failed: 0 };
          }
          results.channels[channel].sent++;

        } catch (error) {
          logger.error(`Failed to send via ${channel}`, {
            notificationId,
            channel,
            error: error.message
          });

          recipientResults[channel] = {
            success: false,
            error: error.message,
            failedAt: new Date()
          };

          if (!results.channels[channel]) {
            results.channels[channel] = { sent: 0, failed: 0 };
          }
          results.channels[channel].failed++;

          // Retry logic
          if (notification.priority >= this.#PRIORITY_LEVELS.HIGH) {
            await this.#scheduleRetry(notification, channel, recipient, notificationId);
          }
        }
      }

      results.recipients[recipient.id || recipient] = recipientResults;
    }

    // Update statistics
    this.#updateStats(notification, results);

    return results;
  }

  /**
   * @private
   * Get allowed channels based on preferences
   */
  static async #getAllowedChannels(recipient, requestedChannels, priority) {
    const preferences = recipient.preferences || await this.getUserPreferences(recipient.id);
    const allowed = [];

    // Check Do Not Disturb
    if (preferences.doNotDisturb?.enabled && priority < this.#PRIORITY_LEVELS.URGENT) {
      const now = new Date();
      const currentTime = `${now.getHours()}:${now.getMinutes()}`;
      const start = preferences.doNotDisturb.start || this.#config.preferences.defaultDoNotDisturbStart;
      const end = preferences.doNotDisturb.end || this.#config.preferences.defaultDoNotDisturbEnd;

      if (this.#isInDoNotDisturbPeriod(currentTime, start, end)) {
        // Only allow non-intrusive channels during DND
        return requestedChannels.filter(ch => ch === 'email' || ch === 'in_app');
      }
    }

    // Check channel preferences
    for (const channel of requestedChannels) {
      const channelPref = preferences.channels?.[channel];
      
      if (channelPref === false) {
        continue; // Channel disabled
      }

      if (channelPref?.minPriority && priority < channelPref.minPriority) {
        continue; // Priority too low
      }

      allowed.push(channel);
    }

    return allowed.length > 0 ? allowed : ['in_app']; // Fallback to in-app
  }

  /**
   * @private
   * Prepare channel-specific notification
   */
  static #prepareChannelNotification(notification, channel, recipient) {
    const template = notification.template;
    const channelConfig = template[channel] || {};
    const data = {
      ...notification.data,
      recipientName: recipient.name,
      recipientEmail: recipient.email
    };

    // Apply template interpolation
    const interpolate = (text) => {
      if (!text) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    };

    return {
      ...notification,
      ...channelConfig,
      type: notification.type,
      userId: notification.userId || recipient.id,
      organizationId: notification.organizationId,
      subject: interpolate(channelConfig.subject),
      title: interpolate(channelConfig.title),
      content: interpolate(channelConfig.content || channelConfig.body),
      template: channelConfig.template,
      data
    };
  }

  /**
   * @private
   * Check if notification is duplicate
   */
  static async #checkDuplicate(notification) {
    const hash = this.#generateNotificationHash(notification);
    const exists = await this.#cacheService.exists(`duplicate:${hash}`);
    
    if (!exists) {
      // Set with 1 hour TTL
      await this.#cacheService.set(`duplicate:${hash}`, true, 3600);
    }
    
    return exists;
  }

  /**
   * @private
   * Should batch notification
   */
  static #shouldBatch(notification) {
    if (!this.#config.batching.enabled) return false;
    if (notification.priority >= this.#PRIORITY_LEVELS.HIGH) return false;
    if (notification.template.batching?.enabled === false) return false;
    
    return true;
  }

  /**
   * @private
   * Add notification to batch
   */
  static async #addToBatch(notification, notificationId) {
    const batchKey = `batch:${notification.type}`;
    const batch = await this.#cacheService.get(batchKey) || [];
    
    batch.push({
      ...notification,
      notificationId,
      addedAt: new Date()
    });

    await this.#cacheService.set(batchKey, batch, 300); // 5 minutes

    return {
      notificationId,
      status: 'batched',
      message: 'Notification added to batch'
    };
  }

  /**
   * @private
   * Start batch processor
   */
  static #startBatchProcessor() {
    setInterval(async () => {
      try {
        const batchKeys = await this.#cacheService.keys('batch:*');
        
        for (const key of batchKeys) {
          const batch = await this.#cacheService.get(key);
          if (!batch || batch.length === 0) continue;

          if (batch.length >= this.#config.batching.maxBatchSize ||
              Date.now() - new Date(batch[0].addedAt) > this.#config.batching.batchInterval) {
            
            // Process batch
            await this.#processBatch(batch);
            
            // Clear batch
            await this.#cacheService.delete(key);
          }
        }
      } catch (error) {
        logger.error('Batch processor error', { error: error.message });
      }
    }, this.#config.batching.batchInterval);
  }

  /**
   * @private
   * Process notification batch
   */
  static async #processBatch(batch) {
    logger.info('Processing notification batch', { 
      size: batch.length, 
      type: batch[0]?.type 
    });

    // Group by recipient
    const grouped = new Map();
    
    batch.forEach(notification => {
      notification.recipients.forEach(recipient => {
        const key = recipient.id || recipient;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key).push(notification);
      });
    });

    // Send grouped notifications
    for (const [recipientKey, notifications] of grouped) {
      try {
        // Combine notifications for digest
        const digest = this.#createDigest(notifications);
        await this.#processNotification(digest, digest.notificationId);
      } catch (error) {
        logger.error('Batch notification failed', { 
          recipient: recipientKey, 
          error: error.message 
        });
      }
    }
  }

  /**
   * @private
   * Create digest from multiple notifications
   */
  static #createDigest(notifications) {
    return {
      notificationId: this.#generateNotificationId(),
      type: 'digest',
      recipients: [notifications[0].recipients[0]],
      channels: ['email', 'in_app'],
      priority: Math.max(...notifications.map(n => n.priority)),
      template: {
        channels: ['email', 'in_app'],
        email: {
          subject: `You have ${notifications.length} new notifications`,
          template: 'digest'
        },
        in_app: {
          title: 'New Notifications',
          content: `You have ${notifications.length} new updates`
        }
      },
      data: {
        notifications: notifications.map(n => ({
          type: n.type,
          data: n.data,
          timestamp: n.addedAt
        }))
      }
    };
  }

  /**
   * @private
   * Schedule notification
   */
  static async #scheduleNotification(notification, notificationId) {
    // Store in scheduled notifications
    await NotificationModel.create({
      _id: notificationId,
      ...notification,
      status: 'scheduled',
      scheduledFor: notification.scheduledFor
    });

    logger.info('Notification scheduled', {
      notificationId,
      scheduledFor: notification.scheduledFor
    });

    return {
      notificationId,
      status: 'scheduled',
      scheduledFor: notification.scheduledFor
    };
  }

  /**
   * @private
   * Schedule retry
   */
  static async #scheduleRetry(notification, channel, recipient, originalId) {
    const retryCount = notification.retryCount || 0;
    
    if (retryCount >= this.#config.retryPolicy.maxAttempts) {
      logger.warn('Max retries reached', { 
        notificationId: originalId, 
        channel 
      });
      return;
    }

    const delay = this.#config.retryPolicy.initialDelay * 
      Math.pow(this.#config.retryPolicy.backoffMultiplier, retryCount);

    setTimeout(async () => {
      try {
        const channelHandler = this.#channels.get(channel);
        const channelNotification = this.#prepareChannelNotification(
          notification,
          channel,
          recipient
        );
        
        await channelHandler.send(recipient, channelNotification);
        logger.info('Retry successful', { 
          notificationId: originalId, 
          channel, 
          attempt: retryCount + 1 
        });
      } catch (error) {
        logger.error('Retry failed', { 
          notificationId: originalId, 
          channel, 
          error: error.message 
        });
        
        // Schedule another retry
        await this.#scheduleRetry(
          { ...notification, retryCount: retryCount + 1 },
          channel,
          recipient,
          originalId
        );
      }
    }, delay);
  }

  /**
   * @private
   * Record notification in database
   */
  static async #recordNotification(data) {
    try {
      await NotificationModel.create({
        _id: data.notificationId,
        type: data.type,
        recipients: data.recipients?.map(r => r.id || r),
        channels: Object.entries(data.result?.channels || {}).map(([channel, result]) => ({
          channel,
          status: result.sent > result.failed ? 'delivered' : 'failed',
          deliveredAt: result.sent > 0 ? new Date() : null,
          error: result.error
        })),
        priority: data.priority,
        status: data.error ? 'failed' : 'sent',
        error: data.error,
        metadata: data.metadata,
        userId: data.userId,
        organizationId: data.organizationId,
        duration: data.duration
      });
    } catch (error) {
      logger.error('Failed to record notification', { error: error.message });
    }
  }

  /**
   * @private
   * Update notification statistics
   */
  static #updateStats(notification, results) {
    Object.entries(results.channels).forEach(([channel, stats]) => {
      if (!this.#notificationStats.has(channel)) {
        this.#notificationStats.set(channel, {
          sent: 0,
          failed: 0,
          totalDeliveryTime: 0,
          byType: new Map()
        });
      }

      const channelStats = this.#notificationStats.get(channel);
      channelStats.sent += stats.sent;
      channelStats.failed += stats.failed;
      channelStats.totalDeliveryTime += notification.duration || 0;

      // Update by type
      const currentCount = channelStats.byType.get(notification.type) || 0;
      channelStats.byType.set(notification.type, currentCount + stats.sent);
    });
  }

  /**
   * @private
   * Get default preferences
   */
  static #getDefaultPreferences() {
    return {
      channels: {
        email: true,
        sms: true,
        push: true,
        in_app: true,
        webhook: false
      },
      doNotDisturb: {
        enabled: false,
        start: this.#config.preferences.defaultDoNotDisturbStart,
        end: this.#config.preferences.defaultDoNotDisturbEnd
      },
      digest: {
        enabled: true,
        frequency: 'daily',
        time: '09:00'
      }
    };
  }

  /**
   * @private
   * Check if in Do Not Disturb period
   */
  static #isInDoNotDisturbPeriod(currentTime, startTime, endTime) {
    const current = this.#timeToMinutes(currentTime);
    const start = this.#timeToMinutes(startTime);
    const end = this.#timeToMinutes(endTime);

    if (start <= end) {
      return current >= start && current <= end;
    } else {
      // Spans midnight
      return current >= start || current <= end;
    }
  }

  /**
   * @private
   * Convert time string to minutes
   */
  static #timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * @private
   * Generate notification ID
   */
  static #generateNotificationId() {
    return `notif_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate bulk ID
   */
  static #generateBulkId() {
    return `bulk_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate notification hash for deduplication
   */
  static #generateNotificationHash(notification) {
    const key = `${notification.type}:${notification.recipients.join(',')}:${JSON.stringify(notification.data || {})}`;
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }
}

module.exports = NotificationService;