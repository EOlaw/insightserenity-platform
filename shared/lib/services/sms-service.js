'use strict';

/**
 * @fileoverview Enterprise-grade SMS service with multiple provider support and delivery tracking
 * @module shared/lib/services/sms-service
 * @requires module:twilio
 * @requires module:aws-sdk
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/notification-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/config
 */

const twilio = require('twilio');
const AWS = require('aws-sdk');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const NotificationModel = require('../database/models/notification-model');
const AuditLogModel = require('../database/models/audit-log-model');
const CacheService = require('./cache-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const { validatePhoneNumber } = require('../utils/validators/common-validators');
const crypto = require('crypto');

/**
 * @class SMSService
 * @description Comprehensive SMS service with multiple providers, templates, and delivery tracking
 */
class SMSService {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #providers = new Map();

  /**
   * @private
   * @static
   * @type {string}
   */
  static #primaryProvider;

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #templates = new Map();

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #blacklistedNumbers = new Set();

  /**
   * @private
   * @static
   * @type {number}
   */
  static #maxRetries = 3;

  /**
   * @private
   * @static
   * @type {number}
   */
  static #messageCharLimit = 160;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Initialize SMS service with configured providers
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.#initialized) {
      return;
    }

    try {
      this.#cacheService = new CacheService();
      
      const smsConfig = config.sms || {};
      
      // Initialize Twilio
      if (smsConfig.twilio?.enabled) {
        const twilioClient = twilio(
          smsConfig.twilio.accountSid,
          smsConfig.twilio.authToken
        );
        this.#providers.set('twilio', {
          client: twilioClient,
          config: smsConfig.twilio,
          send: this.#sendViaTwilio.bind(this)
        });
      }
      
      // Initialize AWS SNS
      if (smsConfig.sns?.enabled) {
        const snsClient = new AWS.SNS({
          region: smsConfig.sns.region,
          accessKeyId: smsConfig.sns.accessKeyId,
          secretAccessKey: smsConfig.sns.secretAccessKey
        });
        this.#providers.set('sns', {
          client: snsClient,
          config: smsConfig.sns,
          send: this.#sendViaSNS.bind(this)
        });
      }

      // Set primary provider
      this.#primaryProvider = smsConfig.primaryProvider || Array.from(this.#providers.keys())[0];
      
      if (!this.#primaryProvider) {
        throw new Error('No SMS providers configured');
      }

      // Load templates and blacklist
      await this.#loadTemplates();
      await this.#loadBlacklist();

      this.#initialized = true;
      logger.info('SMSService initialized', {
        providers: Array.from(this.#providers.keys()),
        primaryProvider: this.#primaryProvider
      });
    } catch (error) {
      logger.error('Failed to initialize SMSService', { error: error.message });
      throw new AppError(
        'SMS service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Send SMS with automatic retry and failover
   * @static
   * @param {Object} options - SMS options
   * @param {string} options.to - Recipient phone number
   * @param {string} [options.from] - Sender phone number or ID
   * @param {string} [options.message] - Message content
   * @param {string} [options.template] - Template name
   * @param {Object} [options.templateData] - Template variables
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID for audit
   * @param {Object} [options.metadata] - Additional metadata
   * @param {boolean} [options.unicode=false] - Allow unicode characters
   * @param {string} [options.statusCallback] - Webhook URL for delivery status
   * @returns {Promise<Object>} Send result
   */
  static async sendSMS(options) {
    await this.initialize();

    const smsId = this.#generateSMSId();
    const startTime = Date.now();

    try {
      // Validate and normalize options
      const validatedOptions = await this.#validateSMSOptions(options);
      
      // Check blacklist
      if (this.#blacklistedNumbers.has(validatedOptions.to)) {
        throw new AppError(
          'Number is blacklisted',
          400,
          ERROR_CODES.SMS_NUMBER_BLACKLISTED
        );
      }

      // Apply template if specified
      if (validatedOptions.template) {
        validatedOptions.message = await this.#applyTemplate(
          validatedOptions.template,
          validatedOptions.templateData
        );
      }

      // Validate message length
      this.#validateMessageLength(validatedOptions.message, validatedOptions.unicode);

      // Check rate limits
      await this.#checkRateLimit(validatedOptions.to);

      // Check opt-out status
      await this.#checkOptOutStatus(validatedOptions.to);

      // Send with retry and failover
      const result = await this.#sendWithRetryAndFailover(validatedOptions, smsId);

      // Record notification
      await this.#recordNotification({
        ...validatedOptions,
        smsId,
        result,
        duration: Date.now() - startTime
      });

      // Audit log
      await this.#auditLog({
        action: 'sms.sent',
        smsId,
        userId: validatedOptions.userId,
        organizationId: validatedOptions.organizationId,
        metadata: {
          to: this.#maskPhoneNumber(validatedOptions.to),
          provider: result.provider,
          messageLength: validatedOptions.message.length,
          segments: result.segments || 1,
          duration: Date.now() - startTime
        }
      });

      return {
        success: true,
        smsId,
        messageId: result.messageId,
        provider: result.provider,
        segments: result.segments || 1,
        cost: result.cost,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('SMS send failed', {
        smsId,
        error: error.message,
        to: this.#maskPhoneNumber(options.to)
      });

      // Record failed notification
      await this.#recordNotification({
        ...options,
        smsId,
        error: error.message,
        duration: Date.now() - startTime,
        status: 'failed'
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to send SMS',
        500,
        ERROR_CODES.SMS_SEND_FAILED,
        { smsId, originalError: error.message }
      );
    }
  }

  /**
   * Send bulk SMS messages
   * @static
   * @param {Array<Object>} messages - Array of SMS options
   * @param {Object} [options] - Bulk send options
   * @param {number} [options.batchSize=100] - Batch size
   * @param {number} [options.delayBetweenBatches=1000] - Delay in ms
   * @param {boolean} [options.stopOnError=false] - Stop on first error
   * @returns {Promise<Object>} Bulk send results
   */
  static async sendBulkSMS(messages, options = {}) {
    await this.initialize();

    const {
      batchSize = 100,
      delayBetweenBatches = 1000,
      stopOnError = false
    } = options;

    const results = {
      total: messages.length,
      sent: 0,
      failed: 0,
      errors: [],
      cost: 0
    };

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      try {
        const batchResults = await Promise.allSettled(
          batch.map(message => this.sendSMS(message))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.sent++;
            results.cost += result.value.cost || 0;
          } else {
            results.failed++;
            results.errors.push({
              index: i + index,
              to: batch[index].to,
              error: result.reason.message
            });

            if (stopOnError) {
              throw new AppError(
                'Bulk SMS stopped due to error',
                500,
                ERROR_CODES.SMS_BULK_STOPPED,
                { results }
              );
            }
          }
        });

        // Delay between batches
        if (i + batchSize < messages.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

      } catch (error) {
        if (stopOnError) {
          throw error;
        }
        logger.error('Bulk SMS batch error', { batch: i / batchSize, error: error.message });
      }
    }

    logger.info('Bulk SMS send completed', results);
    return results;
  }

  /**
   * Handle SMS opt-out
   * @static
   * @param {string} phoneNumber - Phone number to opt out
   * @param {string} [reason] - Opt-out reason
   * @returns {Promise<void>}
   */
  static async optOut(phoneNumber, reason = 'User request') {
    const normalized = this.#normalizePhoneNumber(phoneNumber);
    
    await NotificationModel.create({
      type: 'sms_opt_out',
      recipient: normalized,
      status: 'opted_out',
      metadata: {
        reason,
        timestamp: new Date()
      }
    });

    // Add to cache for quick lookup
    await this.#cacheService.set(`sms_opt_out:${normalized}`, true, 0); // No expiry

    logger.info('SMS opt-out recorded', { phoneNumber: this.#maskPhoneNumber(normalized), reason });
  }

  /**
   * Handle SMS opt-in
   * @static
   * @param {string} phoneNumber - Phone number to opt in
   * @returns {Promise<void>}
   */
  static async optIn(phoneNumber) {
    const normalized = this.#normalizePhoneNumber(phoneNumber);
    
    await NotificationModel.updateOne(
      { type: 'sms_opt_out', recipient: normalized },
      { $set: { status: 'opted_in', updatedAt: new Date() } }
    );

    // Remove from cache
    await this.#cacheService.delete(`sms_opt_out:${normalized}`);

    logger.info('SMS opt-in recorded', { phoneNumber: this.#maskPhoneNumber(normalized) });
  }

  /**
   * Get SMS delivery status
   * @static
   * @param {string} smsId - SMS ID
   * @returns {Promise<Object>} SMS status
   */
  static async getSMSStatus(smsId) {
    const notification = await NotificationModel.findOne({
      'metadata.smsId': smsId,
      type: 'sms'
    });

    if (!notification) {
      throw new AppError(
        'SMS not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    return {
      smsId,
      status: notification.status,
      sentAt: notification.sentAt,
      deliveredAt: notification.metadata.deliveredAt,
      provider: notification.metadata.provider,
      error: notification.error,
      attempts: notification.attempts
    };
  }

  /**
   * Register SMS template
   * @static
   * @param {string} name - Template name
   * @param {string} template - Template content
   * @param {Object} [metadata] - Template metadata
   */
  static registerTemplate(name, template, metadata = {}) {
    if (!name || !template) {
      throw new AppError(
        'Invalid template configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#templates.set(name, {
      content: template,
      metadata,
      compiled: this.#compileTemplate(template)
    });

    logger.info('SMS template registered', { name });
  }

  /**
   * @private
   * Send via Twilio
   */
  static async #sendViaTwilio(provider, options, smsId) {
    const { client, config } = provider;
    
    const messageOptions = {
      body: options.message,
      to: options.to,
      from: options.from || config.defaultFrom,
      statusCallback: options.statusCallback || config.statusCallback
    };

    if (options.mediaUrl) {
      messageOptions.mediaUrl = options.mediaUrl;
    }

    const result = await client.messages.create(messageOptions);

    return {
      messageId: result.sid,
      status: result.status,
      segments: result.numSegments,
      cost: parseFloat(result.price || 0)
    };
  }

  /**
   * @private
   * Send via AWS SNS
   */
  static async #sendViaSNS(provider, options, smsId) {
    const { client, config } = provider;
    
    const params = {
      Message: options.message,
      PhoneNumber: options.to,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: options.from || config.senderId || 'INFO'
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: config.smsType || 'Transactional'
        }
      }
    };

    const result = await client.publish(params).promise();

    return {
      messageId: result.MessageId,
      status: 'sent',
      segments: Math.ceil(options.message.length / this.#messageCharLimit),
      cost: 0 // SNS doesn't return cost in response
    };
  }

  /**
   * @private
   * Send with retry and failover
   */
  static async #sendWithRetryAndFailover(options, smsId) {
    const providers = [
      this.#primaryProvider,
      ...Array.from(this.#providers.keys()).filter(p => p !== this.#primaryProvider)
    ];
    
    let lastError;

    for (const providerName of providers) {
      const provider = this.#providers.get(providerName);
      
      for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
        try {
          logger.debug(`Attempting to send SMS via ${providerName}`, { smsId, attempt });
          
          const result = await provider.send(provider, options, smsId);
          
          return {
            ...result,
            provider: providerName,
            attempts: attempt
          };

        } catch (error) {
          lastError = error;
          logger.warn(`SMS send attempt failed`, {
            smsId,
            provider: providerName,
            attempt,
            error: error.message
          });

          if (attempt < this.#maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    }

    throw new AppError(
      'All SMS providers failed',
      500,
      ERROR_CODES.SMS_PROVIDERS_EXHAUSTED,
      { smsId, lastError: lastError?.message }
    );
  }

  /**
   * @private
   * Load predefined templates
   */
  static async #loadTemplates() {
    const defaultTemplates = {
      'verification': 'Your verification code is: {{code}}',
      'welcome': 'Welcome to {{organizationName}}! Reply STOP to opt out.',
      'reminder': 'Reminder: {{message}}. Reply STOP to opt out.',
      'alert': 'Alert: {{message}}'
    };

    Object.entries(defaultTemplates).forEach(([name, template]) => {
      this.registerTemplate(name, template);
    });
  }

  /**
   * @private
   * Load blacklisted numbers
   */
  static async #loadBlacklist() {
    // Load from config or database
    const blacklist = config.sms?.blacklist || [];
    blacklist.forEach(number => {
      this.#blacklistedNumbers.add(this.#normalizePhoneNumber(number));
    });
  }

  /**
   * @private
   * Validate SMS options
   */
  static async #validateSMSOptions(options) {
    const validated = { ...options };

    // Validate phone number
    if (!validatePhoneNumber(validated.to)) {
      throw new AppError(
        'Invalid phone number',
        400,
        ERROR_CODES.INVALID_PHONE_NUMBER
      );
    }

    // Normalize phone number
    validated.to = this.#normalizePhoneNumber(validated.to);

    // Validate message or template
    if (!validated.message && !validated.template) {
      throw new AppError(
        'SMS must have message or template',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return validated;
  }

  /**
   * @private
   * Validate message length
   */
  static #validateMessageLength(message, unicode = false) {
    const limit = unicode ? 70 : this.#messageCharLimit;
    const segments = Math.ceil(message.length / limit);
    
    const maxSegments = config.sms?.maxSegments || 5;
    if (segments > maxSegments) {
      throw new AppError(
        `Message too long (${segments} segments, max: ${maxSegments})`,
        400,
        ERROR_CODES.SMS_MESSAGE_TOO_LONG
      );
    }
  }

  /**
   * @private
   * Apply template
   */
  static async #applyTemplate(templateName, data = {}) {
    const template = this.#templates.get(templateName);
    
    if (!template) {
      throw new AppError(
        `Template '${templateName}' not found`,
        400,
        ERROR_CODES.TEMPLATE_NOT_FOUND
      );
    }

    return template.compiled(data);
  }

  /**
   * @private
   * Check rate limits
   */
  static async #checkRateLimit(phoneNumber) {
    const key = `sms_rate:${phoneNumber}`;
    const count = await this.#cacheService.get(key) || 0;
    
    const limit = config.sms?.rateLimit?.perNumber || 5;
    const window = config.sms?.rateLimit?.windowMinutes || 60;
    
    if (count >= limit) {
      throw new AppError(
        'SMS rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        { phoneNumber: this.#maskPhoneNumber(phoneNumber), limit, window }
      );
    }

    await this.#cacheService.increment(key, 1, window * 60);
  }

  /**
   * @private
   * Check opt-out status
   */
  static async #checkOptOutStatus(phoneNumber) {
    const optedOut = await this.#cacheService.get(`sms_opt_out:${phoneNumber}`);
    
    if (optedOut) {
      throw new AppError(
        'Recipient has opted out',
        400,
        ERROR_CODES.SMS_OPTED_OUT
      );
    }

    // Check database if not in cache
    const optOutRecord = await NotificationModel.findOne({
      type: 'sms_opt_out',
      recipient: phoneNumber,
      status: 'opted_out'
    });

    if (optOutRecord) {
      // Add to cache
      await this.#cacheService.set(`sms_opt_out:${phoneNumber}`, true, 0);
      throw new AppError(
        'Recipient has opted out',
        400,
        ERROR_CODES.SMS_OPTED_OUT
      );
    }
  }

  /**
   * @private
   * Record notification
   */
  static async #recordNotification(data) {
    try {
      await NotificationModel.create({
        type: 'sms',
        recipient: data.to,
        content: data.message,
        status: data.error ? 'failed' : 'sent',
        sentAt: data.error ? null : new Date(),
        error: data.error,
        attempts: data.result?.attempts || 1,
        metadata: {
          smsId: data.smsId,
          provider: data.result?.provider,
          messageId: data.result?.messageId,
          segments: data.result?.segments,
          cost: data.result?.cost,
          duration: data.duration
        },
        userId: data.userId,
        organizationId: data.organizationId
      });
    } catch (error) {
      logger.error('Failed to record SMS notification', { error: error.message });
    }
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'sms',
        resourceId: data.smsId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create SMS audit log', { error: error.message });
    }
  }

  /**
   * @private
   * Generate unique SMS ID
   */
  static #generateSMSId() {
    return `sms_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Normalize phone number
   */
  static #normalizePhoneNumber(phoneNumber) {
    // Remove all non-numeric characters
    let normalized = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing (assuming US)
    if (normalized.length === 10) {
      normalized = '1' + normalized;
    }
    
    return '+' + normalized;
  }

  /**
   * @private
   * Mask phone number for logging
   */
  static #maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return 'unknown';
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 4) return '*'.repeat(digits.length);
    return digits.substring(0, 3) + '*'.repeat(digits.length - 6) + digits.substring(digits.length - 3);
  }

  /**
   * @private
   * Compile template
   */
  static #compileTemplate(template) {
    return (data) => {
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    };
  }
}

module.exports = SMSService;