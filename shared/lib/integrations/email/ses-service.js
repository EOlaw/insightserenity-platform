'use strict';

/**
 * @fileoverview AWS SES email integration service
 * @module shared/lib/integrations/email/ses-service
 * @requires module:@aws-sdk/client-ses
 * @requires module:@aws-sdk/client-sesv2
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/helpers/email-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const { SESClient, SendEmailCommand, SendBulkEmailCommand, GetAccountSendingQuotaCommand } = require('@aws-sdk/client-ses');
const { SESv2Client, SendEmailCommand: SendEmailV2Command, PutAccountSuppressionAttributesCommand, GetSuppressionAttributesCommand } = require('@aws-sdk/client-sesv2');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const emailHelper = require('../../utils/helpers/email-helper');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class SESService
 * @description Handles email operations through AWS Simple Email Service (SES)
 * Implements high-volume transactional email delivery with AWS infrastructure
 */
class SESService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for quota and configuration set caching
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   * @description Encryption service for sensitive data
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   * @description AWS SES v1 client instance
   */
  #sesClient;

  /**
   * @private
   * @type {Object}
   * @description AWS SES v2 client instance
   */
  #sesV2Client;

  /**
   * @private
   * @type {Object}
   * @description Sending quota tracking
   */
  #quotaTracker;

  /**
   * @private
   * @type {Map}
   * @description Queue for managing send rate
   */
  #sendQueue;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: '2010-12-01',
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    region: 'us-east-1',
    configurationSet: null,
    returnPath: null,
    sourceArn: null,
    returnPathArn: null,
    useSESv2: false,
    trackingEnabled: true,
    quotaCacheTTL: 300,
    suppressionCacheTTL: 600,
    sendRateBuffer: 0.9, // Use 90% of max send rate
    queueCheckInterval: 100 // ms
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Email charset configurations
   */
  static #CHARSET = {
    UTF8: 'UTF-8',
    ISO_8859_1: 'ISO-8859-1',
    SHIFT_JIS: 'Shift_JIS'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description SES email types
   */
  static #EMAIL_TYPES = {
    TRANSACTIONAL: 'TRANSACTIONAL',
    PROMOTIONAL: 'PROMOTIONAL'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description AWS SES specific error codes
   */
  static #SES_ERRORS = {
    MessageRejected: 'Email content rejected by SES',
    MailFromDomainNotVerified: 'Sender domain not verified',
    ConfigurationSetDoesNotExist: 'Configuration set not found',
    AccountSendingPausedException: 'Account sending is paused',
    SendingQuotaExceeded: 'Daily sending quota exceeded',
    MaxSendingRateExceeded: 'Sending rate limit exceeded',
    TemplateDoesNotExist: 'Email template not found',
    InvalidParameterValue: 'Invalid parameter provided',
    Throttling: 'Request throttled by AWS'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description SES bounce types
   */
  static #BOUNCE_TYPES = {
    PERMANENT: 'Permanent',
    TRANSIENT: 'Transient',
    UNDETERMINED: 'Undetermined'
  };

  /**
   * Creates a new SESService instance
   * @param {Object} config - Service configuration
   * @param {Object} config.credentials - AWS credentials
   * @param {string} config.credentials.accessKeyId - AWS access key ID
   * @param {string} config.credentials.secretAccessKey - AWS secret access key
   * @param {string} [config.region='us-east-1'] - AWS region
   * @param {string} config.fromEmail - Verified sender email
   * @param {string} [config.fromName] - Sender name
   * @param {string} [config.configurationSet] - SES configuration set name
   * @param {string} [config.returnPath] - Return path for bounces
   * @param {boolean} [config.useSESv2=false] - Use SES v2 API
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.credentials?.accessKeyId || !config?.credentials?.secretAccessKey) {
        throw new AppError(
          'AWS credentials are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'SESService' }
        );
      }

      if (!config.fromEmail || !emailHelper.isValidEmail(config.fromEmail)) {
        throw new AppError(
          'Valid verified sender email is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'fromEmail' }
        );
      }

      this.#config = {
        ...SESService.#DEFAULT_CONFIG,
        ...config
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#quotaTracker = { quota: 0, sent: 0, rate: 0, lastReset: Date.now() };
      this.#sendQueue = new Map();

      // Initialize AWS SES clients
      const clientConfig = {
        region: this.#config.region,
        credentials: this.#config.credentials,
        maxAttempts: this.#config.maxRetries,
        requestTimeout: this.#config.timeout
      };

      this.#sesClient = new SESClient(clientConfig);
      
      if (this.#config.useSESv2) {
        this.#sesV2Client = new SESv2Client(clientConfig);
      }

      // Start queue processor
      this.#startQueueProcessor();

      logger.info('SESService initialized', {
        region: this.#config.region,
        fromEmail: this.#config.fromEmail,
        configurationSet: this.#config.configurationSet,
        useSESv2: this.#config.useSESv2
      });

      // Initialize quota tracking
      this.#updateQuota().catch(error => {
        logger.warn('Failed to initialize quota tracking', { error: error.message });
      });

    } catch (error) {
      logger.error('SESService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize SES service',
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
   * @param {string} [emailData.templateName] - SES template name
   * @param {Object} [emailData.templateData] - Template data
   * @param {Array<Object>} [emailData.attachments] - File attachments
   * @param {Object} [emailData.tags] - Email tags for tracking
   * @param {Array<string>} [emailData.cc] - CC recipients
   * @param {Array<string>} [emailData.bcc] - BCC recipients
   * @param {string} [emailData.replyTo] - Reply-to addresses
   * @param {string} [emailData.charset='UTF-8'] - Character encoding
   * @param {Object} [options] - Send options
   * @param {string} [options.emailType='TRANSACTIONAL'] - Email type
   * @param {boolean} [options.queueIfRateLimited=true] - Queue if rate limited
   * @param {string} [options.correlationId] - Tracking correlation ID
   * @returns {Promise<Object>} Send result
   * @throws {AppError} If send fails
   */
  async sendEmail(emailData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Sending email via AWS SES', {
        correlationId,
        to: Array.isArray(emailData.to) ? emailData.to.length + ' recipients' : emailData.to,
        subject: emailData.subject,
        templateName: emailData.templateName,
        region: this.#config.region
      });

      // Validate email data
      this.#validateEmailData(emailData);

      // Check sending quota
      await this.#checkQuota();

      // Check suppression list
      await this.#checkSuppressionList(emailData.to);

      // Rate limiting check
      const canSend = await this.#checkSendRate(options.queueIfRateLimited);
      if (!canSend) {
        return await this.#queueEmail(emailData, options);
      }

      // Send email based on configuration
      const result = this.#config.useSESv2
        ? await this.#sendEmailV2(emailData, options, correlationId)
        : await this.#sendEmailV1(emailData, options, correlationId);

      // Update quota tracker
      this.#quotaTracker.sent++;

      const duration = Date.now() - startTime;
      logger.info('Email sent successfully', {
        correlationId,
        messageId: result.MessageId,
        duration
      });

      return {
        success: true,
        messageId: result.MessageId,
        correlationId,
        timestamp: new Date().toISOString(),
        duration,
        provider: 'ses',
        region: this.#config.region
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Email send failed', {
        correlationId,
        duration,
        error: error.message,
        errorCode: error.Code
      });

      throw this.#handleSESError(error, correlationId);
    }
  }

  /**
   * Sends bulk emails efficiently
   * @param {Array<Object>} emailBatch - Array of email data
   * @param {Object} [options] - Bulk send options
   * @param {boolean} [options.useTemplate=false] - Use SES template
   * @param {string} [options.templateName] - Template name for all emails
   * @param {string} [options.defaultTemplateData] - Default template data
   * @returns {Promise<Object>} Bulk send results
   * @throws {AppError} If bulk send fails
   */
  async sendBulk(emailBatch, options = {}) {
    const bulkId = this.#generateBulkId();

    try {
      logger.info('Starting bulk email send', {
        bulkId,
        totalEmails: emailBatch.length,
        useTemplate: options.useTemplate
      });

      // AWS SES bulk limit is 50 destinations per call
      const maxBulkSize = 50;
      const chunks = this.#createChunks(emailBatch, maxBulkSize);

      const results = {
        bulkId,
        total: emailBatch.length,
        sent: 0,
        failed: 0,
        chunks: []
      };

      for (const [index, chunk] of chunks.entries()) {
        try {
          const chunkResult = await this.#sendBulkChunk(chunk, options, `${bulkId}_${index}`);
          results.sent += chunkResult.successful;
          results.failed += chunkResult.failed;
          results.chunks.push(chunkResult);
        } catch (error) {
          logger.error('Bulk chunk send failed', {
            bulkId,
            chunkIndex: index,
            error: error.message
          });
          
          results.failed += chunk.length;
          results.chunks.push({
            chunkId: `${bulkId}_${index}`,
            error: error.message,
            failed: chunk.length
          });
        }
      }

      logger.info('Bulk email send completed', {
        bulkId,
        sent: results.sent,
        failed: results.failed,
        chunks: results.chunks.length
      });

      return results;

    } catch (error) {
      logger.error('Bulk email send failed', {
        bulkId,
        error: error.message
      });

      throw this.#handleSESError(error, bulkId);
    }
  }

  /**
   * Gets SES account sending quota
   * @returns {Promise<Object>} Sending quota information
   * @throws {AppError} If retrieval fails
   */
  async getSendingQuota() {
    try {
      const cacheKey = 'ses:quota';
      const cached = await this.#cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Quota retrieved from cache');
        return cached;
      }

      logger.info('Retrieving SES sending quota');

      const command = new GetAccountSendingQuotaCommand({});
      const response = await this.#sesClient.send(command);

      const quota = {
        max24HourSend: response.Max24HourSend,
        maxSendRate: response.MaxSendRate,
        sentLast24Hours: response.SentLast24Hours,
        percentageUsed: (response.SentLast24Hours / response.Max24HourSend) * 100,
        remaining: response.Max24HourSend - response.SentLast24Hours
      };

      await this.#cacheService.set(cacheKey, quota, this.#config.quotaCacheTTL);

      return quota;

    } catch (error) {
      logger.error('Quota retrieval failed', error);
      throw this.#handleSESError(error);
    }
  }

  /**
   * Manages email suppressions
   * @param {Object} suppressionData - Suppression configuration
   * @param {Array<string>} [suppressionData.suppressedReasons] - Reasons to suppress
   * @param {boolean} [suppressionData.enable=true] - Enable/disable suppression
   * @returns {Promise<Object>} Suppression configuration result
   * @throws {AppError} If configuration fails
   */
  async manageSuppression(suppressionData) {
    try {
      if (!this.#sesV2Client) {
        throw new AppError(
          'SES v2 client required for suppression management',
          400,
          ERROR_CODES.CONFIGURATION_ERROR
        );
      }

      logger.info('Managing email suppression', suppressionData);

      const command = new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: suppressionData.suppressedReasons || ['COMPLAINT', 'BOUNCE']
      });

      await this.#sesV2Client.send(command);

      // Clear suppression cache
      await this.#cacheService.delete('ses:suppression:*');

      return {
        success: true,
        suppressedReasons: suppressionData.suppressedReasons
      };

    } catch (error) {
      logger.error('Suppression management failed', error);
      throw this.#handleSESError(error);
    }
  }

  /**
   * Processes bounce notification
   * @param {Object} bounceData - Bounce notification data
   * @returns {Promise<Object>} Processing result
   */
  async processBounce(bounceData) {
    try {
      logger.info('Processing SES bounce', {
        bounceType: bounceData.bounceType,
        recipients: bounceData.bouncedRecipients?.length
      });

      const result = {
        processed: 0,
        bounceType: bounceData.bounceType,
        recipients: []
      };

      if (bounceData.bounceType === SESService.#BOUNCE_TYPES.PERMANENT) {
        // Add to suppression list
        for (const recipient of bounceData.bouncedRecipients || []) {
          await this.#addToSuppressionCache(recipient.emailAddress, 'bounce');
          result.recipients.push(recipient.emailAddress);
          result.processed++;
        }
      }

      return result;

    } catch (error) {
      logger.error('Bounce processing failed', error);
      throw this.#handleSESError(error);
    }
  }

  /**
   * Processes complaint notification
   * @param {Object} complaintData - Complaint notification data
   * @returns {Promise<Object>} Processing result
   */
  async processComplaint(complaintData) {
    try {
      logger.info('Processing SES complaint', {
        complaintType: complaintData.complaintFeedbackType,
        recipients: complaintData.complainedRecipients?.length
      });

      const result = {
        processed: 0,
        complaintType: complaintData.complaintFeedbackType,
        recipients: []
      };

      // Add to suppression list
      for (const recipient of complaintData.complainedRecipients || []) {
        await this.#addToSuppressionCache(recipient.emailAddress, 'complaint');
        result.recipients.push(recipient.emailAddress);
        result.processed++;
      }

      return result;

    } catch (error) {
      logger.error('Complaint processing failed', error);
      throw this.#handleSESError(error);
    }
  }

  /**
   * Verifies email address or domain
   * @param {string} identity - Email or domain to verify
   * @param {string} [type='email'] - Identity type (email or domain)
   * @returns {Promise<Object>} Verification result
   * @throws {AppError} If verification fails
   */
  async verifyIdentity(identity, type = 'email') {
    try {
      logger.info('Verifying identity', { identity, type });

      const command = type === 'domain'
        ? new VerifyDomainIdentityCommand({ Domain: identity })
        : new VerifyEmailIdentityCommand({ EmailAddress: identity });

      const response = await this.#sesClient.send(command);

      return {
        success: true,
        identity,
        type,
        verificationToken: response.VerificationToken
      };

    } catch (error) {
      logger.error('Identity verification failed', error);
      throw this.#handleSESError(error);
    }
  }

  /**
   * @private
   * Sends email using SES v1 API
   */
  async #sendEmailV1(emailData, options, correlationId) {
    const params = {
      Source: this.#formatSender(emailData),
      Destination: {
        ToAddresses: Array.isArray(emailData.to) ? emailData.to : [emailData.to]
      },
      Message: {}
    };

    // Add subject
    params.Message.Subject = {
      Data: emailData.subject,
      Charset: emailData.charset || SESService.#CHARSET.UTF8
    };

    // Add body
    params.Message.Body = {};
    if (emailData.text) {
      params.Message.Body.Text = {
        Data: emailData.text,
        Charset: emailData.charset || SESService.#CHARSET.UTF8
      };
    }
    if (emailData.html) {
      params.Message.Body.Html = {
        Data: emailData.html,
        Charset: emailData.charset || SESService.#CHARSET.UTF8
      };
    }

    // Optional recipients
    if (emailData.cc?.length > 0) {
      params.Destination.CcAddresses = Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc];
    }
    if (emailData.bcc?.length > 0) {
      params.Destination.BccAddresses = Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc];
    }

    // Reply-to
    if (emailData.replyTo) {
      params.ReplyToAddresses = Array.isArray(emailData.replyTo) ? emailData.replyTo : [emailData.replyTo];
    }

    // Configuration set
    if (this.#config.configurationSet) {
      params.ConfigurationSetName = this.#config.configurationSet;
    }

    // Return path
    if (this.#config.returnPath) {
      params.ReturnPath = this.#config.returnPath;
    }

    // Source ARN (for cross-account sending)
    if (this.#config.sourceArn) {
      params.SourceArn = this.#config.sourceArn;
    }

    // Return path ARN
    if (this.#config.returnPathArn) {
      params.ReturnPathArn = this.#config.returnPathArn;
    }

    // Tags
    if (emailData.tags) {
      params.Tags = Object.entries(emailData.tags).map(([Name, Value]) => ({ Name, Value }));
    }

    const command = new SendEmailCommand(params);
    return await this.#sesClient.send(command);
  }

  /**
   * @private
   * Sends email using SES v2 API
   */
  async #sendEmailV2(emailData, options, correlationId) {
    const params = {
      FromEmailAddress: this.#formatSender(emailData),
      Destination: {
        ToAddresses: Array.isArray(emailData.to) ? emailData.to : [emailData.to]
      }
    };

    // Email content
    if (emailData.templateName) {
      params.Content = {
        Template: {
          TemplateName: emailData.templateName,
          TemplateData: JSON.stringify(emailData.templateData || {})
        }
      };
    } else {
      params.Content = {
        Simple: {
          Subject: {
            Data: emailData.subject,
            Charset: emailData.charset || SESService.#CHARSET.UTF8
          },
          Body: {}
        }
      };

      if (emailData.text) {
        params.Content.Simple.Body.Text = {
          Data: emailData.text,
          Charset: emailData.charset || SESService.#CHARSET.UTF8
        };
      }
      if (emailData.html) {
        params.Content.Simple.Body.Html = {
          Data: emailData.html,
          Charset: emailData.charset || SESService.#CHARSET.UTF8
        };
      }
    }

    // Optional fields
    if (emailData.cc?.length > 0) {
      params.Destination.CcAddresses = Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc];
    }
    if (emailData.bcc?.length > 0) {
      params.Destination.BccAddresses = Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc];
    }

    if (emailData.replyTo) {
      params.ReplyToAddresses = Array.isArray(emailData.replyTo) ? emailData.replyTo : [emailData.replyTo];
    }

    if (this.#config.configurationSet) {
      params.ConfigurationSetName = this.#config.configurationSet;
    }

    // Email tags
    if (emailData.tags) {
      params.EmailTags = Object.entries(emailData.tags).map(([Name, Value]) => ({ Name, Value }));
    }

    // List management
    params.ListManagementOptions = {
      ContactListName: options.contactList,
      TopicName: options.topic
    };

    const command = new SendEmailV2Command(params);
    return await this.#sesV2Client.send(command);
  }

  /**
   * @private
   * Sends a bulk chunk
   */
  async #sendBulkChunk(chunk, options, chunkId) {
    const destinations = chunk.map(email => {
      const dest = {
        Destination: {
          ToAddresses: Array.isArray(email.to) ? email.to : [email.to]
        }
      };

      if (email.cc) dest.Destination.CcAddresses = Array.isArray(email.cc) ? email.cc : [email.cc];
      if (email.bcc) dest.Destination.BccAddresses = Array.isArray(email.bcc) ? email.bcc : [email.bcc];
      if (email.templateData) dest.ReplacementTemplateData = JSON.stringify(email.templateData);
      if (email.tags) dest.ReplacementTags = Object.entries(email.tags).map(([Name, Value]) => ({ Name, Value }));

      return dest;
    });

    const params = {
      Source: this.#formatSender(chunk[0]),
      Template: options.templateName,
      DefaultTemplateData: JSON.stringify(options.defaultTemplateData || {}),
      Destinations: destinations
    };

    if (this.#config.configurationSet) {
      params.ConfigurationSetName = this.#config.configurationSet;
    }

    if (chunk[0].replyTo) {
      params.ReplyToAddresses = Array.isArray(chunk[0].replyTo) ? chunk[0].replyTo : [chunk[0].replyTo];
    }

    const command = new SendBulkEmailCommand(params);
    const response = await this.#sesClient.send(command);

    // Process response
    let successful = 0;
    let failed = 0;

    response.Status.forEach(status => {
      if (status.Status === 'Success') {
        successful++;
      } else {
        failed++;
        logger.warn('Bulk email failed', {
          messageId: status.MessageId,
          error: status.Error
        });
      }
    });

    return {
      chunkId,
      successful,
      failed,
      messageIds: response.Status.filter(s => s.Status === 'Success').map(s => s.MessageId)
    };
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
    if (!emailData.templateName && !emailData.text && !emailData.html) {
      errors.push('Email must have either templateName, text, or html content');
    }

    // Validate subject for non-template emails
    if (!emailData.templateName && !emailData.subject) {
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
   * Checks and updates sending quota
   */
  async #checkQuota() {
    const quota = await this.getSendingQuota();

    if (quota.remaining <= 0) {
      throw new AppError(
        'Daily sending quota exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR,
        { quota }
      );
    }

    this.#quotaTracker.quota = quota.max24HourSend;
    this.#quotaTracker.rate = quota.maxSendRate;
  }

  /**
   * @private
   * Updates quota information
   */
  async #updateQuota() {
    try {
      await this.getSendingQuota();
    } catch (error) {
      logger.error('Failed to update quota', error);
    }
  }

  /**
   * @private
   * Checks send rate limit
   */
  async #checkSendRate(queueIfLimited) {
    const now = Date.now();
    const elapsed = (now - this.#quotaTracker.lastReset) / 1000;

    // Reset counter every second
    if (elapsed >= 1) {
      this.#quotaTracker.sent = 0;
      this.#quotaTracker.lastReset = now;
    }

    const effectiveRate = this.#quotaTracker.rate * this.#config.sendRateBuffer;
    
    if (this.#quotaTracker.sent >= effectiveRate) {
      if (queueIfLimited) {
        return false; // Will be queued
      }
      
      throw new AppError(
        'Send rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR,
        {
          currentRate: this.#quotaTracker.sent,
          maxRate: effectiveRate
        }
      );
    }

    return true;
  }

  /**
   * @private
   * Queues email for later sending
   */
  async #queueEmail(emailData, options) {
    const queueId = this.#generateQueueId();
    
    this.#sendQueue.set(queueId, {
      emailData,
      options,
      queuedAt: Date.now(),
      attempts: 0
    });

    logger.info('Email queued due to rate limit', {
      queueId,
      queueSize: this.#sendQueue.size
    });

    return {
      success: true,
      queued: true,
      queueId,
      correlationId: options.correlationId,
      timestamp: new Date().toISOString(),
      provider: 'ses'
    };
  }

  /**
   * @private
   * Starts the queue processor
   */
  #startQueueProcessor() {
    setInterval(async () => {
      if (this.#sendQueue.size === 0) return;

      try {
        const canSend = await this.#checkSendRate(false);
        if (!canSend) return;

        // Get oldest queued email
        const [queueId, queuedEmail] = this.#sendQueue.entries().next().value;
        
        // Check if expired
        const age = Date.now() - queuedEmail.queuedAt;
        if (age > this.#config.queueTimeout * 60 * 60 * 1000) {
          this.#sendQueue.delete(queueId);
          logger.warn('Queued email expired', { queueId, age });
          return;
        }

        // Attempt to send
        try {
          await this.sendEmail(queuedEmail.emailData, {
            ...queuedEmail.options,
            queueIfRateLimited: false
          });
          
          this.#sendQueue.delete(queueId);
          logger.info('Queued email sent', { queueId });
        } catch (error) {
          queuedEmail.attempts++;
          
          if (queuedEmail.attempts >= this.#config.maxRetries) {
            this.#sendQueue.delete(queueId);
            logger.error('Queued email failed permanently', {
              queueId,
              attempts: queuedEmail.attempts,
              error: error.message
            });
          }
        }
      } catch (error) {
        logger.error('Queue processor error', error);
      }
    }, this.#config.queueCheckInterval);
  }

  /**
   * @private
   * Checks suppression list
   */
  async #checkSuppressionList(emails) {
    const emailArray = Array.isArray(emails) ? emails : [emails];
    const suppressed = [];

    for (const email of emailArray) {
      const cacheKey = `ses:suppression:${email}`;
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
   * Adds email to suppression cache
   */
  async #addToSuppressionCache(email, reason) {
    const cacheKey = `ses:suppression:${email}`;
    await this.#cacheService.set(cacheKey, {
      reason,
      timestamp: new Date().toISOString()
    }, this.#config.suppressionCacheTTL);
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

    return fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
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
   * Handles SES errors
   */
  #handleSESError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const errorCode = error.Code || error.name;
    const errorMessage = SESService.#SES_ERRORS[errorCode] || 'SES error';

    // Map specific SES errors to appropriate status codes
    let statusCode = 500;
    let appErrorCode = ERROR_CODES.EMAIL_SEND_ERROR;

    switch (errorCode) {
      case 'MessageRejected':
      case 'InvalidParameterValue':
        statusCode = 400;
        appErrorCode = ERROR_CODES.VALIDATION_ERROR;
        break;
      case 'MailFromDomainNotVerified':
      case 'ConfigurationSetDoesNotExist':
      case 'TemplateDoesNotExist':
        statusCode = 404;
        appErrorCode = ERROR_CODES.NOT_FOUND;
        break;
      case 'SendingQuotaExceeded':
      case 'MaxSendingRateExceeded':
      case 'Throttling':
        statusCode = 429;
        appErrorCode = ERROR_CODES.RATE_LIMIT_ERROR;
        break;
      case 'AccountSendingPausedException':
        statusCode = 403;
        appErrorCode = ERROR_CODES.FORBIDDEN;
        break;
    }

    return new AppError(
      errorMessage,
      statusCode,
      appErrorCode,
      {
        correlationId,
        sesError: errorCode,
        requestId: error.$metadata?.requestId,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates bulk ID
   */
  #generateBulkId() {
    return `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates queue ID
   */
  #generateQueueId() {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const quota = await this.getSendingQuota();
      
      return {
        healthy: true,
        service: 'SESService',
        region: this.#config.region,
        quotaRemaining: quota.remaining,
        quotaPercentageUsed: quota.percentageUsed,
        queueSize: this.#sendQueue.size
      };
    } catch (error) {
      logger.error('SES health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'SESService',
        region: this.#config.region,
        error: error.message
      };
    }
  }
}

module.exports = SESService;