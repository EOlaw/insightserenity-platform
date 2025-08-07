'use strict';

/**
 * @fileoverview Mailgun email integration service
 * @module shared/lib/integrations/email/mailgun-service
 * @requires module:mailgun.js
 * @requires module:form-data
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/helpers/email-helper
 * @requires module:shared/lib/services/external-api-service
 */

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const emailHelper = require('../../utils/helpers/email-helper');
const ExternalApiService = require('../../services/external-api-service');

/**
 * @class MailgunService
 * @description Handles email operations through Mailgun API v3
 * Implements robust email delivery with advanced features and error handling
 */
class MailgunService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for domain and suppression caching
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   * @description Mailgun client instance
   */
  #mailgunClient;

  /**
   * @private
   * @type {ExternalApiService}
   * @description External API service for webhook handling
   */
  #apiService;

  /**
   * @private
   * @type {Map}
   * @description Queue for retry management
   */
  #retryQueue;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: 'v3',
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 30000,
    batchSize: 1000,
    testMode: false,
    trackingEnabled: true,
    clickTracking: true,
    openTracking: true,
    unsubscribeTracking: true,
    deliveryTimeOptimizePeriod: null,
    domainCacheTTL: 3600,
    suppressionCacheTTL: 300,
    queueTimeout: 72, // hours
    tagLimit: 3
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Email priority mappings
   */
  static #PRIORITY_HEADERS = {
    HIGH: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'high'
    },
    NORMAL: {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'normal'
    },
    LOW: {
      'X-Priority': '5',
      'X-MSMail-Priority': 'Low',
      'Importance': 'low'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Mailgun specific variables
   */
  static #MAILGUN_VARIABLES = {
    RECIPIENT_VARS: 'recipient-variables',
    DELIVERY_TIME: 'deliverytime',
    DKIM: 'o:dkim',
    TEST_MODE: 'o:testmode',
    TRACKING: 'o:tracking',
    TRACKING_CLICKS: 'o:tracking-clicks',
    TRACKING_OPENS: 'o:tracking-opens',
    REQUIRE_TLS: 'o:require-tls',
    SKIP_VERIFICATION: 'o:skip-verification'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Mailgun error codes
   */
  static #MAILGUN_ERRORS = {
    400: 'Bad Request - Invalid parameters',
    401: 'Unauthorized - Invalid API key',
    402: 'Request Failed - Parameters valid but request failed',
    404: 'Not Found - Domain or resource not found',
    413: 'Request Entity Too Large',
    429: 'Too Many Requests - Rate limit exceeded',
    500: 'Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };

  /**
   * Creates a new MailgunService instance
   * @param {Object} config - Service configuration
   * @param {string} config.apiKey - Mailgun API key
   * @param {string} config.domain - Mailgun domain
   * @param {string} [config.fromEmail] - Default sender email
   * @param {string} [config.fromName] - Default sender name
   * @param {string} [config.region='US'] - API region (US or EU)
   * @param {boolean} [config.testMode=false] - Enable test mode
   * @param {Object} [config.tracking] - Tracking settings
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {number} [config.timeout=30000] - Request timeout
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {ExternalApiService} [apiService] - External API service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, apiService) {
    try {
      if (!config?.apiKey) {
        throw new AppError(
          'Mailgun API key is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'MailgunService' }
        );
      }

      if (!config.domain) {
        throw new AppError(
          'Mailgun domain is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'domain' }
        );
      }

      this.#config = {
        ...MailgunService.#DEFAULT_CONFIG,
        ...config,
        url: config.region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
      };

      this.#cacheService = cacheService || new CacheService();
      this.#apiService = apiService || new ExternalApiService();
      this.#retryQueue = new Map();

      // Initialize Mailgun client
      const mailgun = new Mailgun(formData);
      this.#mailgunClient = mailgun.client({
        username: 'api',
        key: this.#config.apiKey,
        url: this.#config.url,
        timeout: this.#config.timeout
      });

      logger.info('MailgunService initialized', {
        domain: this.#config.domain,
        region: this.#config.region || 'US',
        testMode: this.#config.testMode
      });
    } catch (error) {
      logger.error('MailgunService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize Mailgun service',
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
   * @param {string} [emailData.template] - Mailgun template name
   * @param {Object} [emailData.templateVars] - Template variables
   * @param {Array<Object>} emailData.attachments - File attachments
   * @param {Array<string>} [emailData.tags] - Email tags (max 3)
   * @param {Object} [emailData.customVars] - Custom variables
   * @param {Object} [emailData.headers] - Custom headers
   * @param {Array<string>} [emailData.cc] - CC recipients
   * @param {Array<string>} [emailData.bcc] - BCC recipients
   * @param {string} [emailData.replyTo] - Reply-to email
   * @param {Date} [emailData.deliveryTime] - Scheduled delivery time
   * @param {Object} [options] - Send options
   * @param {string} [options.priority='NORMAL'] - Email priority
   * @param {boolean} [options.requireTls=true] - Require TLS
   * @param {boolean} [options.skipVerification=false] - Skip DNS verification
   * @param {string} [options.correlationId] - Tracking correlation ID
   * @returns {Promise<Object>} Send result
   * @throws {AppError} If send fails
   */
  async sendEmail(emailData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Sending email via Mailgun', {
        correlationId,
        to: Array.isArray(emailData.to) ? emailData.to.length + ' recipients' : emailData.to,
        subject: emailData.subject,
        template: emailData.template,
        tags: emailData.tags,
        scheduled: !!emailData.deliveryTime
      });

      // Validate email data
      this.#validateEmailData(emailData);

      // Check suppression list
      await this.#checkSuppressionList(emailData.to);

      // Build Mailgun message
      const messageData = await this.#buildMessageData(emailData, options, correlationId);

      // Send email with retry logic
      const result = await this.#sendWithRetry(messageData, options);

      const duration = Date.now() - startTime;
      logger.info('Email sent successfully', {
        correlationId,
        messageId: result.id,
        duration
      });

      return {
        success: true,
        messageId: result.id,
        correlationId,
        timestamp: new Date().toISOString(),
        duration,
        provider: 'mailgun',
        message: result.message
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Email send failed', {
        correlationId,
        duration,
        error: error.message,
        statusCode: error.status
      });

      throw this.#handleMailgunError(error, correlationId);
    }
  }

  /**
   * Sends batch emails using Mailgun's batch API
   * @param {Array<Object>} emailBatch - Array of email data
   * @param {Object} [options] - Batch options
   * @param {boolean} [options.recipientVariables=true] - Use recipient variables
   * @returns {Promise<Object>} Batch send results
   * @throws {AppError} If batch send fails
   */
  async sendBatch(emailBatch, options = {}) {
    const batchId = this.#generateBatchId();

    try {
      logger.info('Starting batch email send', {
        batchId,
        totalEmails: emailBatch.length
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

      // Group emails by template/content
      const groups = this.#groupBatchEmails(emailBatch);
      const results = {
        batchId,
        total: emailBatch.length,
        sent: 0,
        failed: 0,
        groups: []
      };

      // Send each group
      for (const group of groups) {
        try {
          const groupResult = await this.#sendBatchGroup(group, options);
          results.sent += groupResult.sent;
          results.groups.push(groupResult);
        } catch (error) {
          results.failed += group.emails.length;
          results.groups.push({
            error: error.message,
            emails: group.emails.length
          });
        }
      }

      logger.info('Batch email send completed', {
        batchId,
        sent: results.sent,
        failed: results.failed,
        groups: results.groups.length
      });

      return results;

    } catch (error) {
      logger.error('Batch email send failed', {
        batchId,
        error: error.message
      });

      throw this.#handleMailgunError(error, batchId);
    }
  }

  /**
   * Validates a single email address
   * @param {string} email - Email address to validate
   * @param {Object} [options] - Validation options
   * @returns {Promise<Object>} Validation result
   * @throws {AppError} If validation fails
   */
  async validateEmail(email, options = {}) {
    try {
      logger.info('Validating email address', { email });

      const response = await this.#mailgunClient.validate.get(email);

      return {
        valid: response.is_valid,
        email: response.address,
        didYouMean: response.did_you_mean,
        isDisposable: response.is_disposable_address,
        isRoleAddress: response.is_role_address,
        reason: response.reason,
        risk: response.risk
      };

    } catch (error) {
      logger.error('Email validation failed', {
        email,
        error: error.message
      });

      throw this.#handleMailgunError(error);
    }
  }

  /**
   * Retrieves email events/logs
   * @param {Object} [filters] - Filter options
   * @param {Date} [filters.begin] - Start date
   * @param {Date} [filters.end] - End date
   * @param {string} [filters.event] - Event type
   * @param {number} [filters.limit=100] - Result limit
   * @returns {Promise<Array>} Email events
   * @throws {AppError} If retrieval fails
   */
  async getEvents(filters = {}) {
    try {
      logger.info('Retrieving email events', filters);

      const queryParams = {
        begin: filters.begin?.toISOString() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: filters.end?.toISOString(),
        event: filters.event,
        limit: filters.limit || 100
      };

      const response = await this.#mailgunClient.events.get(this.#config.domain, queryParams);

      return response.items.map(event => ({
        id: event.id,
        timestamp: event.timestamp,
        event: event.event,
        recipient: event.recipient,
        tags: event.tags,
        deliveryStatus: event['delivery-status'],
        severity: event.severity,
        reason: event.reason,
        userVariables: event['user-variables'],
        messageHeaders: event['message-headers']
      }));

    } catch (error) {
      logger.error('Event retrieval failed', error);
      throw this.#handleMailgunError(error);
    }
  }

  /**
   * Manages suppressions (bounces, unsubscribes, complaints)
   * @param {string} type - Suppression type
   * @param {string} action - Action (list, get, create, delete)
   * @param {Object} [data] - Action data
   * @returns {Promise<Object>} Suppression result
   * @throws {AppError} If operation fails
   */
  async manageSuppressions(type, action, data = {}) {
    try {
      logger.info('Managing suppressions', {
        type,
        action,
        email: data.email
      });

      const validTypes = ['bounces', 'unsubscribes', 'complaints'];
      if (!validTypes.includes(type)) {
        throw new AppError(
          'Invalid suppression type',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { validTypes, provided: type }
        );
      }

      const suppressionClient = this.#mailgunClient.suppressions;
      let result;

      switch (action) {
        case 'list':
          result = await suppressionClient.list(this.#config.domain, type, {
            limit: data.limit || 100
          });
          break;

        case 'get':
          if (!data.email) {
            throw new AppError(
              'Email required for get action',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          result = await suppressionClient.get(this.#config.domain, type, data.email);
          break;

        case 'create':
          if (!data.email) {
            throw new AppError(
              'Email required for create action',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          result = await suppressionClient.create(this.#config.domain, type, {
            address: data.email,
            tag: data.tag || '*',
            error: data.error,
            code: data.code
          });
          break;

        case 'delete':
          if (!data.email) {
            throw new AppError(
              'Email required for delete action',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          result = await suppressionClient.destroy(this.#config.domain, type, data.email);
          break;

        default:
          throw new AppError(
            'Invalid action',
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { validActions: ['list', 'get', 'create', 'delete'], provided: action }
          );
      }

      // Clear suppression cache
      if (action === 'create' || action === 'delete') {
        await this.#clearSuppressionCache(type, data.email);
      }

      return result;

    } catch (error) {
      logger.error('Suppression management failed', error);
      throw this.#handleMailgunError(error);
    }
  }

  /**
   * Gets domain information and settings
   * @returns {Promise<Object>} Domain information
   * @throws {AppError} If retrieval fails
   */
  async getDomainInfo() {
    try {
      const cacheKey = `mailgun:domain:${this.#config.domain}`;
      const cached = await this.#cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Domain info retrieved from cache');
        return cached;
      }

      logger.info('Retrieving domain information', {
        domain: this.#config.domain
      });

      const domain = await this.#mailgunClient.domains.get(this.#config.domain);

      const domainInfo = {
        name: domain.name,
        state: domain.state,
        type: domain.type,
        spamAction: domain.spam_action,
        wildcard: domain.wildcard,
        createdAt: domain.created_at,
        smtpLogin: domain.smtp_login,
        smtpPassword: domain.smtp_password ? '[REDACTED]' : null,
        skipVerification: domain.skip_verification,
        requireTls: domain.require_tls
      };

      await this.#cacheService.set(cacheKey, domainInfo, this.#config.domainCacheTTL);

      return domainInfo;

    } catch (error) {
      logger.error('Domain info retrieval failed', error);
      throw this.#handleMailgunError(error);
    }
  }

  /**
   * Verifies webhook signature
   * @param {Object} signature - Webhook signature data
   * @param {string} signature.timestamp - Timestamp
   * @param {string} signature.token - Token
   * @param {string} signature.signature - Signature
   * @returns {boolean} Verification result
   */
  verifyWebhookSignature(signature) {
    try {
      return this.#mailgunClient.webhooks.verify(
        this.#config.apiKey,
        signature.timestamp,
        signature.token,
        signature.signature
      );
    } catch (error) {
      logger.error('Webhook verification failed', error);
      return false;
    }
  }

  /**
   * @private
   * Builds message data for Mailgun
   */
  async #buildMessageData(emailData, options, correlationId) {
    const messageData = {
      from: this.#formatSender(emailData),
      to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
      subject: emailData.subject
    };

    // Add content
    if (emailData.template) {
      messageData.template = emailData.template;
      if (emailData.templateVars) {
        messageData['h:X-Mailgun-Variables'] = JSON.stringify(emailData.templateVars);
      }
    } else {
      if (emailData.text) messageData.text = emailData.text;
      if (emailData.html) messageData.html = emailData.html;
    }

    // Optional recipients
    if (emailData.cc) {
      messageData.cc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc;
    }
    if (emailData.bcc) {
      messageData.bcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc;
    }

    // Reply-to
    if (emailData.replyTo) {
      messageData['h:Reply-To'] = emailData.replyTo;
    }

    // Tags (max 3)
    if (emailData.tags && emailData.tags.length > 0) {
      messageData['o:tag'] = emailData.tags.slice(0, this.#config.tagLimit);
    }

    // Custom variables
    if (emailData.customVars) {
      Object.entries(emailData.customVars).forEach(([key, value]) => {
        messageData[`v:${key}`] = value;
      });
    }
    messageData['v:correlationId'] = correlationId;

    // Headers
    if (emailData.headers) {
      Object.entries(emailData.headers).forEach(([key, value]) => {
        messageData[`h:${key}`] = value;
      });
    }

    // Priority headers
    if (options.priority && MailgunService.#PRIORITY_HEADERS[options.priority]) {
      Object.entries(MailgunService.#PRIORITY_HEADERS[options.priority]).forEach(([key, value]) => {
        messageData[`h:${key}`] = value;
      });
    }

    // Tracking settings
    messageData[MailgunService.#MAILGUN_VARIABLES.TRACKING] = this.#config.trackingEnabled;
    messageData[MailgunService.#MAILGUN_VARIABLES.TRACKING_CLICKS] = this.#config.clickTracking;
    messageData[MailgunService.#MAILGUN_VARIABLES.TRACKING_OPENS] = this.#config.openTracking;

    // Delivery options
    if (emailData.deliveryTime) {
      messageData[MailgunService.#MAILGUN_VARIABLES.DELIVERY_TIME] = emailData.deliveryTime.toUTCString();
    }

    // Security options
    messageData[MailgunService.#MAILGUN_VARIABLES.REQUIRE_TLS] = options.requireTls !== false;
    messageData[MailgunService.#MAILGUN_VARIABLES.SKIP_VERIFICATION] = options.skipVerification === true;

    // Test mode
    if (this.#config.testMode) {
      messageData[MailgunService.#MAILGUN_VARIABLES.TEST_MODE] = 'yes';
    }

    // Attachments
    if (emailData.attachments && emailData.attachments.length > 0) {
      messageData.attachment = emailData.attachments.map(att => ({
        data: att.content,
        filename: att.filename
      }));
    }

    return messageData;
  }

  /**
   * @private
   * Sends email with retry logic
   */
  async #sendWithRetry(messageData, options, attempt = 1) {
    try {
      const response = await this.#mailgunClient.messages.create(
        this.#config.domain,
        messageData
      );

      return response;

    } catch (error) {
      if (attempt < this.#config.maxRetries && this.#isRetryableError(error)) {
        const delay = this.#config.retryDelay * Math.pow(2, attempt - 1);
        
        logger.warn(`Retrying email send (attempt ${attempt + 1}/${this.#config.maxRetries})`, {
          error: error.message,
          delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.#sendWithRetry(messageData, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * @private
   * Sends a batch group
   */
  async #sendBatchGroup(group, options) {
    const recipientVariables = {};
    const recipients = [];

    group.emails.forEach(email => {
      const recipient = typeof email.to === 'string' ? email.to : email.to[0];
      recipients.push(recipient);
      recipientVariables[recipient] = email.dynamicData || {};
    });

    const messageData = {
      from: this.#formatSender(group.emails[0]),
      to: recipients.join(', '),
      subject: group.subject,
      [MailgunService.#MAILGUN_VARIABLES.RECIPIENT_VARS]: JSON.stringify(recipientVariables)
    };

    if (group.template) {
      messageData.template = group.template;
    } else {
      if (group.text) messageData.text = group.text;
      if (group.html) messageData.html = group.html;
    }

    const response = await this.#mailgunClient.messages.create(this.#config.domain, messageData);

    return {
      messageId: response.id,
      sent: recipients.length,
      recipients
    };
  }

  /**
   * @private
   * Groups batch emails by template/content
   */
  #groupBatchEmails(emailBatch) {
    const groups = new Map();

    emailBatch.forEach(email => {
      const key = `${email.template || 'content'}_${email.subject}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          template: email.template,
          subject: email.subject,
          text: email.text,
          html: email.html,
          emails: []
        });
      }

      groups.get(key).emails.push(email);
    });

    return Array.from(groups.values());
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
    if (!emailData.template && !emailData.text && !emailData.html) {
      errors.push('Email must have either template, text, or html content');
    }

    // Validate subject for non-template emails
    if (!emailData.template && !emailData.subject) {
      errors.push('Subject is required for non-template emails');
    }

    // Validate tags
    if (emailData.tags && emailData.tags.length > this.#config.tagLimit) {
      errors.push(`Maximum ${this.#config.tagLimit} tags allowed`);
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
   * Checks suppression list
   */
  async #checkSuppressionList(emails) {
    const emailArray = Array.isArray(emails) ? emails : [emails];
    const suppressed = [];

    for (const email of emailArray) {
      const cacheKey = `mailgun:suppression:${email}`;
      const isSuppressed = await this.#cacheService.get(cacheKey);

      if (isSuppressed) {
        suppressed.push(email);
      }
    }

    if (suppressed.length > 0) {
      logger.warn('Recipients found in suppression list', {
        suppressed
      });
    }
  }

  /**
   * @private
   * Clears suppression cache
   */
  async #clearSuppressionCache(type, email) {
    if (email) {
      await this.#cacheService.delete(`mailgun:suppression:${email}`);
    }
    logger.debug('Suppression cache cleared', { type, email });
  }

  /**
   * @private
   * Formats sender address
   */
  #formatSender(emailData) {
    const fromEmail = emailData.fromEmail || this.#config.fromEmail;
    const fromName = emailData.fromName || this.#config.fromName;

    if (!fromEmail) {
      throw new AppError(
        'Sender email is required',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { field: 'fromEmail' }
      );
    }

    return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  }

  /**
   * @private
   * Checks if error is retryable
   */
  #isRetryableError(error) {
    const retryableStatuses = [429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }

  /**
   * @private
   * Handles Mailgun errors
   */
  #handleMailgunError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const status = error.status || error.statusCode;
    const errorMessage = MailgunService.#MAILGUN_ERRORS[status] || 'Mailgun error';

    return new AppError(
      errorMessage,
      status || 500,
      ERROR_CODES.EMAIL_SEND_ERROR,
      {
        correlationId,
        mailgunError: error.message,
        details: error.details
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `mg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      await this.getDomainInfo();
      
      return {
        healthy: true,
        service: 'MailgunService',
        domain: this.#config.domain,
        apiKeyValid: true
      };
    } catch (error) {
      logger.error('Mailgun health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'MailgunService',
        domain: this.#config.domain,
        error: error.message
      };
    }
  }
}

module.exports = MailgunService;