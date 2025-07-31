'use strict';

/**
 * @fileoverview Enterprise-grade email service with multiple provider support, templating, and queuing
 * @module shared/lib/services/email-service
 * @requires module:shared/lib/integrations/email/sendgrid-service
 * @requires module:shared/lib/integrations/email/mailgun-service
 * @requires module:shared/lib/integrations/email/ses-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/notification-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/config
 */

const SendGridService = require('../integrations/email/sendgrid-service');
const MailgunService = require('../integrations/email/mailgun-service');
const SESService = require('../integrations/email/ses-service');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const NotificationModel = require('../database/models/platform/notification-model');
const AuditLogModel = require('../database/models/security/audit-log-model').model;
const CacheService = require('./cache-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const { validateEmail } = require('../utils/validators/common-validators');
const crypto = require('crypto');

/**
 * @class EmailService
 * @description Comprehensive email service with failover, templating, and tracking capabilities
 */
class EmailService {
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
  static #processingQueue = new Set();

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
  static #retryDelay = 1000;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Initialize email service with configured providers
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.#initialized) {
      return;
    }

    try {
      this.#cacheService = new CacheService();
      
      // Initialize providers based on configuration
      const emailConfig = config.email || {};
      
      if (emailConfig.sendgrid?.enabled) {
        this.#providers.set('sendgrid', new SendGridService(emailConfig.sendgrid));
      }
      
      if (emailConfig.mailgun?.enabled) {
        this.#providers.set('mailgun', new MailgunService(emailConfig.mailgun));
      }
      
      if (emailConfig.ses?.enabled) {
        this.#providers.set('ses', new SESService(emailConfig.ses));
      }

      // Set primary provider
      this.#primaryProvider = emailConfig.primaryProvider || Array.from(this.#providers.keys())[0];
      
      if (!this.#primaryProvider) {
        throw new Error('No email providers configured');
      }

      // Load email templates
      await this.#loadTemplates();

      this.#initialized = true;
      logger.info('EmailService initialized', {
        providers: Array.from(this.#providers.keys()),
        primaryProvider: this.#primaryProvider
      });
    } catch (error) {
      logger.error('Failed to initialize EmailService', { error: error.message });
      throw new AppError(
        'Email service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Send email with automatic retry and failover
   * @static
   * @param {Object} options - Email options
   * @param {string|Array<string>} options.to - Recipient email(s)
   * @param {string} [options.from] - Sender email
   * @param {string} options.subject - Email subject
   * @param {string} [options.html] - HTML content
   * @param {string} [options.text] - Plain text content
   * @param {string} [options.template] - Template name
   * @param {Object} [options.templateData] - Template variables
   * @param {Array<Object>} [options.attachments] - Email attachments
   * @param {Object} [options.headers] - Custom headers
   * @param {string} [options.replyTo] - Reply-to address
   * @param {Array<string>} [options.cc] - CC recipients
   * @param {Array<string>} [options.bcc] - BCC recipients
   * @param {Object} [options.metadata] - Additional metadata for tracking
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID for audit
   * @param {number} [options.priority] - Email priority (1-5)
   * @returns {Promise<Object>} Send result
   */
  static async sendEmail(options) {
    await this.initialize();

    const emailId = this.#generateEmailId();
    const startTime = Date.now();

    try {
      // Validate inputs
      const validatedOptions = await this.#validateEmailOptions(options);
      
      // Check if email is being processed (deduplication)
      const processingKey = this.#getProcessingKey(validatedOptions);
      if (this.#processingQueue.has(processingKey)) {
        logger.warn('Duplicate email send request detected', { processingKey });
        return { success: true, duplicate: true, emailId };
      }

      this.#processingQueue.add(processingKey);

      // Apply template if specified
      if (validatedOptions.template) {
        const templatedOptions = await this.#applyTemplate(validatedOptions);
        Object.assign(validatedOptions, templatedOptions);
      }

      // Rate limiting check
      await this.#checkRateLimit(validatedOptions.to);

      // Attempt to send with retries and failover
      const result = await this.#sendWithRetryAndFailover(validatedOptions, emailId);

      // Record notification
      await this.#recordNotification({
        ...validatedOptions,
        emailId,
        result,
        duration: Date.now() - startTime
      });

      // Audit log
      await this.#auditLog({
        action: 'email.sent',
        emailId,
        userId: validatedOptions.userId,
        organizationId: validatedOptions.organizationId,
        metadata: {
          to: validatedOptions.to,
          subject: validatedOptions.subject,
          provider: result.provider,
          duration: Date.now() - startTime
        }
      });

      return {
        success: true,
        emailId,
        messageId: result.messageId,
        provider: result.provider,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Email send failed', {
        emailId,
        error: error.message,
        options: this.#sanitizeOptions(options)
      });

      // Record failed notification
      await this.#recordNotification({
        ...options,
        emailId,
        error: error.message,
        duration: Date.now() - startTime,
        status: 'failed'
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to send email',
        500,
        ERROR_CODES.EMAIL_SEND_FAILED,
        { emailId, originalError: error.message }
      );

    } finally {
      this.#processingQueue.delete(processingKey);
    }
  }

  /**
   * Send bulk emails efficiently
   * @static
   * @param {Array<Object>} emails - Array of email options
   * @param {Object} [options] - Bulk send options
   * @param {number} [options.batchSize=100] - Batch size
   * @param {number} [options.delayBetweenBatches=1000] - Delay in ms
   * @returns {Promise<Object>} Bulk send results
   */
  static async sendBulkEmails(emails, options = {}) {
    await this.initialize();

    const {
      batchSize = 100,
      delayBetweenBatches = 1000
    } = options;

    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    // Process in batches
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(email => this.sendEmail(email))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            index: i + index,
            email: batch[index].to,
            error: result.reason.message
          });
        }
      });

      // Delay between batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    logger.info('Bulk email send completed', results);
    return results;
  }

  /**
   * Get email status by ID
   * @static
   * @param {string} emailId - Email ID
   * @returns {Promise<Object>} Email status
   */
  static async getEmailStatus(emailId) {
    const notification = await NotificationModel.findOne({
      'metadata.emailId': emailId,
      type: 'email'
    });

    if (!notification) {
      throw new AppError(
        'Email not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    return {
      emailId,
      status: notification.status,
      sentAt: notification.sentAt,
      provider: notification.metadata.provider,
      error: notification.error,
      attempts: notification.attempts
    };
  }

  /**
   * Register custom email template
   * @static
   * @param {string} name - Template name
   * @param {Object} template - Template configuration
   * @param {string} template.subject - Subject template
   * @param {string} template.html - HTML template
   * @param {string} [template.text] - Plain text template
   */
  static registerTemplate(name, template) {
    if (!name || !template.subject || !template.html) {
      throw new AppError(
        'Invalid template configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#templates.set(name, {
      ...template,
      compiled: {
        subject: this.#compileTemplate(template.subject),
        html: this.#compileTemplate(template.html),
        text: template.text ? this.#compileTemplate(template.text) : null
      }
    });

    logger.info('Email template registered', { name });
  }

  /**
   * @private
   * Load predefined templates
   */
  static async #loadTemplates() {
    // Load default templates
    const defaultTemplates = {
      'welcome': {
        subject: 'Welcome to {{organizationName}}!',
        html: '<h1>Welcome {{userName}}!</h1><p>Thank you for joining {{organizationName}}.</p>',
        text: 'Welcome {{userName}}! Thank you for joining {{organizationName}}.'
      },
      'password-reset': {
        subject: 'Password Reset Request',
        html: '<h1>Password Reset</h1><p>Click <a href="{{resetLink}}">here</a> to reset your password.</p>',
        text: 'Password Reset. Visit this link to reset your password: {{resetLink}}'
      },
      'verification': {
        subject: 'Verify your email address',
        html: '<h1>Email Verification</h1><p>Your verification code is: <strong>{{code}}</strong></p>',
        text: 'Email Verification. Your verification code is: {{code}}'
      }
    };

    Object.entries(defaultTemplates).forEach(([name, template]) => {
      this.registerTemplate(name, template);
    });
  }

  /**
   * @private
   * Validate email options
   */
  static async #validateEmailOptions(options) {
    const validated = { ...options };

    // Validate recipients
    const recipients = Array.isArray(validated.to) ? validated.to : [validated.to];
    const validRecipients = recipients.filter(email => validateEmail(email));
    
    if (validRecipients.length === 0) {
      throw new AppError(
        'No valid recipients provided',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    validated.to = validRecipients;

    // Validate other email fields
    if (validated.cc) {
      validated.cc = Array.isArray(validated.cc) ? validated.cc : [validated.cc];
      validated.cc = validated.cc.filter(email => validateEmail(email));
    }

    if (validated.bcc) {
      validated.bcc = Array.isArray(validated.bcc) ? validated.bcc : [validated.bcc];
      validated.bcc = validated.bcc.filter(email => validateEmail(email));
    }

    // Set defaults
    validated.from = validated.from || config.email?.defaultFrom || 'noreply@insightserenity.com';
    validated.priority = validated.priority || 3;

    // Validate content
    if (!validated.template && !validated.html && !validated.text) {
      throw new AppError(
        'Email must have content (template, html, or text)',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return validated;
  }

  /**
   * @private
   * Apply template to email options
   */
  static async #applyTemplate(options) {
    const template = this.#templates.get(options.template);
    
    if (!template) {
      throw new AppError(
        `Template '${options.template}' not found`,
        400,
        ERROR_CODES.TEMPLATE_NOT_FOUND
      );
    }

    const data = options.templateData || {};
    
    return {
      subject: this.#renderTemplate(template.compiled.subject, data),
      html: this.#renderTemplate(template.compiled.html, data),
      text: template.compiled.text ? this.#renderTemplate(template.compiled.text, data) : undefined
    };
  }

  /**
   * @private
   * Send email with retry and failover
   */
  static async #sendWithRetryAndFailover(options, emailId) {
    const providers = [this.#primaryProvider, ...Array.from(this.#providers.keys()).filter(p => p !== this.#primaryProvider)];
    let lastError;

    for (const providerName of providers) {
      const provider = this.#providers.get(providerName);
      
      for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
        try {
          logger.debug(`Attempting to send email via ${providerName}`, { emailId, attempt });
          
          const result = await provider.send({
            ...options,
            metadata: {
              ...options.metadata,
              emailId,
              attempt,
              provider: providerName
            }
          });

          return {
            ...result,
            provider: providerName,
            attempts: attempt
          };

        } catch (error) {
          lastError = error;
          logger.warn(`Email send attempt failed`, {
            emailId,
            provider: providerName,
            attempt,
            error: error.message
          });

          if (attempt < this.#maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.#retryDelay * attempt));
          }
        }
      }
    }

    throw new AppError(
      'All email providers failed',
      500,
      ERROR_CODES.EMAIL_PROVIDERS_EXHAUSTED,
      { emailId, lastError: lastError?.message }
    );
  }

  /**
   * @private
   * Check rate limits
   */
  static async #checkRateLimit(recipients) {
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];
    
    for (const recipient of recipientList) {
      const key = `email_rate:${recipient}`;
      const count = await this.#cacheService.get(key) || 0;
      
      const limit = config.email?.rateLimit?.perRecipient || 10;
      const window = config.email?.rateLimit?.windowMinutes || 60;
      
      if (count >= limit) {
        throw new AppError(
          'Email rate limit exceeded',
          429,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          { recipient, limit, window }
        );
      }

      await this.#cacheService.increment(key, 1, window * 60);
    }
  }

  /**
   * @private
   * Record notification in database
   */
  static async #recordNotification(data) {
    try {
      await NotificationModel.create({
        type: 'email',
        recipient: Array.isArray(data.to) ? data.to[0] : data.to,
        subject: data.subject,
        content: data.html || data.text,
        status: data.error ? 'failed' : 'sent',
        sentAt: data.error ? null : new Date(),
        error: data.error,
        attempts: data.result?.attempts || 1,
        metadata: {
          emailId: data.emailId,
          provider: data.result?.provider,
          messageId: data.result?.messageId,
          duration: data.duration,
          cc: data.cc,
          bcc: data.bcc,
          attachments: data.attachments?.length || 0
        },
        userId: data.userId,
        organizationId: data.organizationId
      });
    } catch (error) {
      logger.error('Failed to record notification', { error: error.message });
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
        resource: 'email',
        resourceId: data.emailId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error: error.message });
    }
  }

  /**
   * @private
   * Generate unique email ID
   */
  static #generateEmailId() {
    return `email_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Get processing key for deduplication
   */
  static #getProcessingKey(options) {
    const to = Array.isArray(options.to) ? options.to.sort().join(',') : options.to;
    const hash = crypto.createHash('sha256')
      .update(`${to}:${options.subject}:${options.html || options.text || ''}`)
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * @private
   * Compile template for faster rendering
   */
  static #compileTemplate(template) {
    // Simple template compilation (could be replaced with handlebars, etc.)
    return (data) => {
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    };
  }

  /**
   * @private
   * Render compiled template
   */
  static #renderTemplate(compiledTemplate, data) {
    return typeof compiledTemplate === 'function' ? compiledTemplate(data) : compiledTemplate;
  }

  /**
   * @private
   * Sanitize options for logging
   */
  static #sanitizeOptions(options) {
    const sanitized = { ...options };
    delete sanitized.html;
    delete sanitized.text;
    delete sanitized.attachments;
    delete sanitized.templateData;
    return sanitized;
  }
}

module.exports = EmailService;