'use strict';

/**
 * @fileoverview SendGrid email integration service
 * @module shared/lib/integrations/email/sendgrid-service
 * @requires module:@sendgrid/mail
 * @requires module:@sendgrid/client
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/helpers/email-helper
 */

const sgMail = require('@sendgrid/mail');
const sgClient = require('@sendgrid/client');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const emailHelper = require('../../utils/helpers/email-helper');

/**
 * @class SendGridService
 * @description Handles email operations through SendGrid API v3
 * Implements transactional and marketing email capabilities with template support
 */
class SendGridService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for template and bounce list caching
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   * @description SendGrid mail client instance
   */
  #mailClient;

  /**
   * @private
   * @type {Object}
   * @description SendGrid API client instance
   */
  #apiClient;

  /**
   * @private
   * @type {Map}
   * @description Rate limit tracking
   */
  #rateLimitTracker;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    batchSize: 1000,
    sandboxMode: false,
    ipPoolName: null,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
      subscriptionTracking: { enable: true }
    },
    templateCacheTTL: 3600,
    bounceCacheTTL: 300,
    rateLimitPerSecond: 100
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Email categories
   */
  static #EMAIL_CATEGORIES = {
    TRANSACTIONAL: 'transactional',
    MARKETING: 'marketing',
    NOTIFICATION: 'notification',
    SYSTEM: 'system',
    ALERT: 'alert'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Email priority levels
   */
  static #PRIORITY_LEVELS = {
    HIGH: 1,
    NORMAL: 5,
    LOW: 10
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description SendGrid specific error codes
   */
  static #SENDGRID_ERRORS = {
    400: 'Bad Request - Invalid parameters',
    401: 'Authentication failed - Invalid API key',
    403: 'Forbidden - Insufficient permissions',
    413: 'Payload too large',
    429: 'Rate limit exceeded',
    500: 'SendGrid server error',
    503: 'Service temporarily unavailable'
  };

  /**
   * Creates a new SendGridService instance
   * @param {Object} config - Service configuration
   * @param {string} config.apiKey - SendGrid API key
   * @param {string} config.fromEmail - Default sender email
   * @param {string} [config.fromName] - Default sender name
   * @param {boolean} [config.sandboxMode=false] - Enable sandbox mode
   * @param {string} [config.ipPoolName] - IP pool for sending
   * @param {Object} [config.trackingSettings] - Email tracking configuration
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {number} [config.retryDelay=1000] - Delay between retries in ms
   * @param {number} [config.rateLimitPerSecond=100] - Rate limit per second
   * @param {CacheService} [cacheService] - Cache service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService) {
    try {
      if (!config?.apiKey) {
        throw new AppError(
          'SendGrid API key is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'SendGridService' }
        );
      }

      if (!config.fromEmail || !emailHelper.isValidEmail(config.fromEmail)) {
        throw new AppError(
          'Valid sender email is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'fromEmail' }
        );
      }

      this.#config = {
        ...SendGridService.#DEFAULT_CONFIG,
        ...config,
        trackingSettings: {
          ...SendGridService.#DEFAULT_CONFIG.trackingSettings,
          ...config.trackingSettings
        }
      };

      this.#cacheService = cacheService || new CacheService();
      this.#rateLimitTracker = new Map();

      // Initialize SendGrid clients
      this.#mailClient = sgMail;
      this.#mailClient.setApiKey(this.#config.apiKey);

      this.#apiClient = sgClient;
      this.#apiClient.setApiKey(this.#config.apiKey);

      // Set default timeout
      this.#mailClient.setTimeout(this.#config.timeout);

      logger.info('SendGridService initialized', {
        fromEmail: this.#config.fromEmail,
        sandboxMode: this.#config.sandboxMode,
        ipPoolName: this.#config.ipPoolName
      });
    } catch (error) {
      logger.error('SendGridService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize SendGrid service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Sends a single email
   * @param {Object} emailData - Email information
   * @param {string|Array<string>} emailData.to - Recipient email(s)
   * @param {string} emailData.subject - Email subject
   * @param {string} [emailData.text] - Plain text content
   * @param {string} [emailData.html] - HTML content
   * @param {string} [emailData.templateId] - SendGrid template ID
   * @param {Object} [emailData.dynamicData] - Template substitution data
   * @param {Array<Object>} [emailData.attachments] - File attachments
   * @param {string} [emailData.category] - Email category
   * @param {Object} [emailData.customArgs] - Custom arguments for webhooks
   * @param {Object} [emailData.headers] - Custom email headers
   * @param {Array<string>} [emailData.cc] - CC recipients
   * @param {Array<string>} [emailData.bcc] - BCC recipients
   * @param {string} [emailData.replyTo] - Reply-to email
   * @param {Object} [options] - Send options
   * @param {number} [options.priority] - Email priority
   * @param {boolean} [options.testMode=false] - Test mode (no actual send)
   * @param {string} [options.correlationId] - Tracking correlation ID
   * @returns {Promise<Object>} Send result
   * @throws {AppError} If send fails
   */
  async sendEmail(emailData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Sending email via SendGrid', {
        correlationId,
        to: Array.isArray(emailData.to) ? emailData.to.length + ' recipients' : emailData.to,
        subject: emailData.subject,
        templateId: emailData.templateId,
        category: emailData.category,
        testMode: options.testMode
      });

      // Rate limiting check
      await this.#checkRateLimit();

      // Validate email data
      this.#validateEmailData(emailData);

      // Check bounce list
      await this.#checkBounceList(emailData.to);

      // Build SendGrid message
      const message = await this.#buildMessage(emailData, correlationId);

      // Send email with retry logic
      const result = await this.#sendWithRetry(message, options);

      const duration = Date.now() - startTime;
      logger.info('Email sent successfully', {
        correlationId,
        messageId: result.messageId,
        duration,
        statusCode: result.statusCode
      });

      return {
        success: true,
        messageId: result.messageId,
        correlationId,
        timestamp: new Date().toISOString(),
        duration,
        provider: 'sendgrid',
        statusCode: result.statusCode
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Email send failed', {
        correlationId,
        duration,
        error: error.message,
        statusCode: error.code
      });

      throw this.#handleSendGridError(error, correlationId);
    }
  }

  /**
   * Sends batch emails
   * @param {Array<Object>} emailBatch - Array of email data objects
   * @param {Object} [options] - Batch send options
   * @param {boolean} [options.continueOnError=true] - Continue sending on individual failures
   * @param {number} [options.concurrency=10] - Concurrent send limit
   * @returns {Promise<Object>} Batch send results
   * @throws {AppError} If batch send fails
   */
  async sendBatch(emailBatch, options = {}) {
    const batchId = this.#generateBatchId();
    const { continueOnError = true, concurrency = 10 } = options;

    try {
      logger.info('Starting batch email send', {
        batchId,
        totalEmails: emailBatch.length,
        concurrency
      });

      // Validate batch size
      if (emailBatch.length > this.#config.batchSize) {
        throw new AppError(
          `Batch size exceeds limit of ${this.#config.batchSize}`,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { batchSize: emailBatch.length }
        );
      }

      // Process emails in chunks
      const results = {
        batchId,
        total: emailBatch.length,
        sent: 0,
        failed: 0,
        results: []
      };

      // Create chunks for concurrent processing
      const chunks = this.#createChunks(emailBatch, concurrency);

      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
          chunk.map(emailData => this.sendEmail(emailData, { ...options, batchId }))
        );

        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.sent++;
            results.results.push(result.value);
          } else {
            results.failed++;
            results.results.push({
              success: false,
              error: result.reason.message,
              emailData: chunk[index]
            });

            if (!continueOnError) {
              throw result.reason;
            }
          }
        });
      }

      logger.info('Batch email send completed', {
        batchId,
        sent: results.sent,
        failed: results.failed
      });

      return results;

    } catch (error) {
      logger.error('Batch email send failed', {
        batchId,
        error: error.message
      });

      throw this.#handleSendGridError(error, batchId);
    }
  }

  /**
   * Sends email using a template
   * @param {Object} templateData - Template email data
   * @param {string} templateData.templateId - SendGrid template ID
   * @param {string|Array<string>} templateData.to - Recipients
   * @param {Object} templateData.dynamicData - Template variables
   * @param {Object} [options] - Send options
   * @returns {Promise<Object>} Send result
   * @throws {AppError} If template send fails
   */
  async sendTemplate(templateData, options = {}) {
    try {
      // Validate template exists
      await this.#validateTemplate(templateData.templateId);

      // Merge with email data format
      const emailData = {
        to: templateData.to,
        templateId: templateData.templateId,
        dynamicData: templateData.dynamicData,
        category: templateData.category || SendGridService.#EMAIL_CATEGORIES.TRANSACTIONAL
      };

      return await this.sendEmail(emailData, options);

    } catch (error) {
      logger.error('Template email send failed', {
        templateId: templateData.templateId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Retrieves email templates
   * @param {Object} [filters] - Filter options
   * @param {number} [filters.page=1] - Page number
   * @param {number} [filters.pageSize=20] - Results per page
   * @returns {Promise<Array>} List of templates
   * @throws {AppError} If retrieval fails
   */
  async getTemplates(filters = {}) {
    try {
      const cacheKey = `sendgrid:templates:${JSON.stringify(filters)}`;
      const cached = await this.#cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Templates retrieved from cache');
        return cached;
      }

      logger.info('Retrieving SendGrid templates', filters);

      const request = {
        method: 'GET',
        url: '/v3/templates',
        qs: {
          page_size: filters.pageSize || 20,
          page: filters.page || 1
        }
      };

      const [response] = await this.#apiClient.request(request);
      const templates = response.body.templates || [];

      // Cache templates
      await this.#cacheService.set(cacheKey, templates, this.#config.templateCacheTTL);

      return templates;

    } catch (error) {
      logger.error('Template retrieval failed', error);
      throw this.#handleSendGridError(error);
    }
  }

  /**
   * Validates email addresses
   * @param {string|Array<string>} emails - Email addresses to validate
   * @returns {Promise<Object>} Validation results
   * @throws {AppError} If validation fails
   */
  async validateEmails(emails) {
    try {
      const emailArray = Array.isArray(emails) ? emails : [emails];
      
      logger.info('Validating email addresses', {
        count: emailArray.length
      });

      const results = {
        valid: [],
        invalid: [],
        bounced: []
      };

      for (const email of emailArray) {
        if (emailHelper.isValidEmail(email)) {
          const isBounced = await this.#checkBounceList(email, false);
          if (isBounced) {
            results.bounced.push(email);
          } else {
            results.valid.push(email);
          }
        } else {
          results.invalid.push(email);
        }
      }

      return results;

    } catch (error) {
      logger.error('Email validation failed', error);
      throw this.#handleSendGridError(error);
    }
  }

  /**
   * Retrieves email statistics
   * @param {Object} [options] - Statistics options
   * @param {Date} [options.startDate] - Start date
   * @param {Date} [options.endDate] - End date
   * @param {string} [options.aggregatedBy='day'] - Aggregation period
   * @returns {Promise<Object>} Email statistics
   * @throws {AppError} If retrieval fails
   */
  async getStatistics(options = {}) {
    try {
      const startDate = options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = options.endDate || new Date();

      logger.info('Retrieving email statistics', {
        startDate,
        endDate,
        aggregatedBy: options.aggregatedBy
      });

      const request = {
        method: 'GET',
        url: '/v3/stats',
        qs: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          aggregated_by: options.aggregatedBy || 'day'
        }
      };

      const [response] = await this.#apiClient.request(request);

      return this.#formatStatistics(response.body);

    } catch (error) {
      logger.error('Statistics retrieval failed', error);
      throw this.#handleSendGridError(error);
    }
  }

  /**
   * Manages suppression lists (bounces, blocks, etc.)
   * @param {string} type - Suppression type (bounces, blocks, invalid_emails, spam_reports)
   * @param {string} action - Action to perform (get, add, delete)
   * @param {Object} [data] - Action data
   * @returns {Promise<Object>} Suppression list result
   * @throws {AppError} If operation fails
   */
  async manageSuppressions(type, action, data = {}) {
    try {
      logger.info('Managing suppressions', {
        type,
        action,
        dataCount: data.emails?.length
      });

      const validTypes = ['bounces', 'blocks', 'invalid_emails', 'spam_reports'];
      if (!validTypes.includes(type)) {
        throw new AppError(
          'Invalid suppression type',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { validTypes, provided: type }
        );
      }

      let request;

      switch (action) {
        case 'get':
          request = {
            method: 'GET',
            url: `/v3/suppression/${type}`,
            qs: data
          };
          break;

        case 'add':
          if (!data.emails || !Array.isArray(data.emails)) {
            throw new AppError(
              'Emails array is required for add action',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          request = {
            method: 'POST',
            url: `/v3/suppression/${type}`,
            body: data.emails.map(email => ({ email }))
          };
          break;

        case 'delete':
          if (!data.email) {
            throw new AppError(
              'Email is required for delete action',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          request = {
            method: 'DELETE',
            url: `/v3/suppression/${type}/${data.email}`
          };
          break;

        default:
          throw new AppError(
            'Invalid action',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { validActions: ['get', 'add', 'delete'], provided: action }
          );
      }

      const [response] = await this.#apiClient.request(request);

      // Clear bounce cache if modifying bounce list
      if (type === 'bounces' && action !== 'get') {
        await this.#clearBounceCache();
      }

      return response.body;

    } catch (error) {
      logger.error('Suppression management failed', error);
      throw this.#handleSendGridError(error);
    }
  }

  /**
   * @private
   * Builds SendGrid message object
   */
  async #buildMessage(emailData, correlationId) {
    const message = {
      from: {
        email: emailData.fromEmail || this.#config.fromEmail,
        name: emailData.fromName || this.#config.fromName
      },
      subject: emailData.subject,
      personalizations: [{
        to: this.#formatRecipients(emailData.to)
      }],
      trackingSettings: this.#config.trackingSettings,
      mailSettings: {
        sandboxMode: {
          enable: this.#config.sandboxMode
        }
      }
    };

    // Add content
    if (emailData.templateId) {
      message.templateId = emailData.templateId;
      if (emailData.dynamicData) {
        message.personalizations[0].dynamicTemplateData = emailData.dynamicData;
      }
    } else {
      if (emailData.text) {
        message.content = message.content || [];
        message.content.push({
          type: 'text/plain',
          value: emailData.text
        });
      }
      if (emailData.html) {
        message.content = message.content || [];
        message.content.push({
          type: 'text/html',
          value: emailData.html
        });
      }
    }

    // Add optional fields
    if (emailData.cc) {
      message.personalizations[0].cc = this.#formatRecipients(emailData.cc);
    }

    if (emailData.bcc) {
      message.personalizations[0].bcc = this.#formatRecipients(emailData.bcc);
    }

    if (emailData.replyTo) {
      message.replyTo = {
        email: emailData.replyTo
      };
    }

    if (emailData.category) {
      message.categories = [emailData.category];
    }

    if (emailData.customArgs) {
      message.customArgs = {
        ...emailData.customArgs,
        correlationId
      };
    }

    if (emailData.headers) {
      message.headers = emailData.headers;
    }

    if (emailData.attachments) {
      message.attachments = await this.#formatAttachments(emailData.attachments);
    }

    if (this.#config.ipPoolName) {
      message.ipPoolName = this.#config.ipPoolName;
    }

    return message;
  }

  /**
   * @private
   * Sends email with retry logic
   */
  async #sendWithRetry(message, options, attempt = 1) {
    try {
      if (options.testMode) {
        logger.info('Test mode - email not sent', {
          to: message.personalizations[0].to,
          subject: message.subject
        });
        return {
          messageId: `test_${Date.now()}`,
          statusCode: 200
        };
      }

      const response = await this.#mailClient.send(message);
      
      return {
        messageId: response[0].headers['x-message-id'],
        statusCode: response[0].statusCode
      };

    } catch (error) {
      if (attempt < this.#config.maxRetries && this.#isRetryableError(error)) {
        const delay = this.#config.retryDelay * Math.pow(2, attempt - 1);
        
        logger.warn(`Retrying email send (attempt ${attempt + 1}/${this.#config.maxRetries})`, {
          error: error.message,
          delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.#sendWithRetry(message, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * @private
   * Validates email data
   */
  #validateEmailData(emailData) {
    const errors = [];

    // Validate recipients
    if (!emailData.to) {
      errors.push('Recipient email is required');
    } else {
      const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      const invalidEmails = recipients.filter(email => !emailHelper.isValidEmail(email));
      if (invalidEmails.length > 0) {
        errors.push(`Invalid recipient emails: ${invalidEmails.join(', ')}`);
      }
    }

    // Validate content
    if (!emailData.templateId && !emailData.text && !emailData.html) {
      errors.push('Email must have either templateId, text, or html content');
    }

    // Validate subject for non-template emails
    if (!emailData.templateId && !emailData.subject) {
      errors.push('Subject is required for non-template emails');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid email data',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Validates template exists
   */
  async #validateTemplate(templateId) {
    try {
      const cacheKey = `sendgrid:template:${templateId}`;
      const cached = await this.#cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      const request = {
        method: 'GET',
        url: `/v3/templates/${templateId}`
      };

      const [response] = await this.#apiClient.request(request);
      const template = response.body;

      await this.#cacheService.set(cacheKey, template, this.#config.templateCacheTTL);

      return template;

    } catch (error) {
      if (error.code === 404) {
        throw new AppError(
          'Template not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { templateId }
        );
      }
      throw error;
    }
  }

  /**
   * @private
   * Checks bounce list
   */
  async #checkBounceList(emails, throwOnBounce = true) {
    const emailArray = Array.isArray(emails) ? emails : [emails];
    const bounced = [];

    for (const email of emailArray) {
      const cacheKey = `sendgrid:bounce:${email}`;
      const isBounced = await this.#cacheService.get(cacheKey);

      if (isBounced) {
        bounced.push(email);
      }
    }

    if (bounced.length > 0 && throwOnBounce) {
      throw new AppError(
        'Recipients are in bounce list',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { bouncedEmails: bounced }
      );
    }

    return bounced.length > 0;
  }

  /**
   * @private
   * Clears bounce cache
   */
  async #clearBounceCache() {
    // Implementation depends on cache service capabilities
    logger.info('Clearing bounce cache');
  }

  /**
   * @private
   * Checks rate limit
   */
  async #checkRateLimit() {
    const now = Date.now();
    const windowStart = Math.floor(now / 1000) * 1000;

    let count = this.#rateLimitTracker.get(windowStart) || 0;
    
    if (count >= this.#config.rateLimitPerSecond) {
      throw new AppError(
        'Rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR,
        { limit: this.#config.rateLimitPerSecond }
      );
    }

    this.#rateLimitTracker.set(windowStart, count + 1);

    // Clean old entries
    for (const [timestamp] of this.#rateLimitTracker) {
      if (timestamp < windowStart - 5000) {
        this.#rateLimitTracker.delete(timestamp);
      }
    }
  }

  /**
   * @private
   * Formats recipients
   */
  #formatRecipients(recipients) {
    const recipientArray = Array.isArray(recipients) ? recipients : [recipients];
    
    return recipientArray.map(recipient => {
      if (typeof recipient === 'string') {
        return { email: recipient };
      }
      return recipient;
    });
  }

  /**
   * @private
   * Formats attachments
   */
  async #formatAttachments(attachments) {
    return attachments.map(attachment => ({
      content: attachment.content,
      filename: attachment.filename,
      type: attachment.type || 'application/octet-stream',
      disposition: attachment.disposition || 'attachment',
      contentId: attachment.contentId
    }));
  }

  /**
   * @private
   * Formats statistics response
   */
  #formatStatistics(stats) {
    return stats.map(stat => ({
      date: stat.date,
      metrics: {
        requests: stat.stats[0]?.metrics?.requests || 0,
        delivered: stat.stats[0]?.metrics?.delivered || 0,
        opens: stat.stats[0]?.metrics?.opens || 0,
        uniqueOpens: stat.stats[0]?.metrics?.unique_opens || 0,
        clicks: stat.stats[0]?.metrics?.clicks || 0,
        uniqueClicks: stat.stats[0]?.metrics?.unique_clicks || 0,
        bounces: stat.stats[0]?.metrics?.bounces || 0,
        spamReports: stat.stats[0]?.metrics?.spam_reports || 0,
        unsubscribes: stat.stats[0]?.metrics?.unsubscribes || 0
      }
    }));
  }

  /**
   * @private
   * Creates chunks for batch processing
   */
  #createChunks(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * @private
   * Checks if error is retryable
   */
  #isRetryableError(error) {
    const retryableCodes = [429, 500, 502, 503, 504];
    return retryableCodes.includes(error.code);
  }

  /**
   * @private
   * Handles SendGrid errors
   */
  #handleSendGridError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const statusCode = error.code || error.statusCode;
    const errorMessage = SendGridService.#SENDGRID_ERRORS[statusCode] || 'SendGrid error';

    return new AppError(
      errorMessage,
      statusCode || 500,
      ERROR_CODES.EMAIL_SEND_ERROR,
      {
        correlationId,
        sendgridError: error.message,
        response: error.response?.body
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `sg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates batch ID
   */
  #generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const request = {
        method: 'GET',
        url: '/v3/scopes'
      };

      await this.#apiClient.request(request);

      return {
        healthy: true,
        service: 'SendGridService',
        apiKeyValid: true
      };
    } catch (error) {
      logger.error('SendGrid health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'SendGridService',
        error: error.message
      };
    }
  }
}

module.exports = SendGridService;