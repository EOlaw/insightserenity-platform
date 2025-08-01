'use strict';

/**
 * @fileoverview Enterprise-grade webhook service for outgoing and incoming webhooks
 * @module shared/lib/services/webhook-service
 * @requires module:axios
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/crypto-utils
 * @requires module:shared/lib/database/models/webhook-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/config
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const CacheService = require('./cache-service');
const CryptoUtils = require('../security/encryption/crypto-utils');
const WebhookModel = require('../database/models/platform/webhook-model');
const AuditLogModel = require('../database/models/security/audit-log-model');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');

/**
 * @class WebhookService
 * @description Comprehensive webhook service with retry logic, signature verification, and event management
 */
class WebhookService {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #registeredWebhooks = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Function>}
   */
  static #eventHandlers = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #deliveryStats = new Map();

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #processingQueue = new Set();

  /**
   * @private
   * @static
   * @type {Map<string, NodeJS.Timeout>}
   */
  static #retryTimers = new Map();

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
  static WEBHOOK_EVENTS = {
    // User events
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_DELETED: 'user.deleted',
    USER_ACTIVATED: 'user.activated',
    USER_DEACTIVATED: 'user.deactivated',
    
    // Organization events
    ORGANIZATION_CREATED: 'organization.created',
    ORGANIZATION_UPDATED: 'organization.updated',
    ORGANIZATION_DELETED: 'organization.deleted',
    
    // Subscription events
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_UPDATED: 'subscription.updated',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
    SUBSCRIPTION_RENEWED: 'subscription.renewed',
    
    // Payment events
    PAYMENT_SUCCEEDED: 'payment.succeeded',
    PAYMENT_FAILED: 'payment.failed',
    PAYMENT_REFUNDED: 'payment.refunded',
    
    // Project events
    PROJECT_CREATED: 'project.created',
    PROJECT_UPDATED: 'project.updated',
    PROJECT_COMPLETED: 'project.completed',
    PROJECT_CANCELLED: 'project.cancelled',
    
    // Custom events
    CUSTOM: 'custom'
  };

  /**
   * Initialize webhook service
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
        timeout: config.webhooks?.timeout || 30000,
        retryPolicy: {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 60000,
          backoffMultiplier: 2,
          ...config.webhooks?.retryPolicy
        },
        security: {
          signatureHeader: 'X-Webhook-Signature',
          signatureAlgorithm: 'sha256',
          timestampHeader: 'X-Webhook-Timestamp',
          timestampTolerance: 300000, // 5 minutes
          ...config.webhooks?.security
        },
        rateLimit: {
          maxRequestsPerMinute: 60,
          maxBurstSize: 10,
          ...config.webhooks?.rateLimit
        },
        validation: {
          maxPayloadSize: 1048576, // 1MB
          allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded'],
          requireHttps: process.env.NODE_ENV === 'production',
          ...config.webhooks?.validation
        },
        delivery: {
          parallelRequests: 5,
          queueSize: 1000,
          ...config.webhooks?.delivery
        },
        ...options
      };

      this.#cacheService = new CacheService({ namespace: 'webhooks' });

      // Load registered webhooks from database
      await this.#loadRegisteredWebhooks();

      // Start delivery queue processor
      this.#startDeliveryProcessor();

      // Start cleanup task
      this.#startCleanupTask();

      this.#initialized = true;
      logger.info('WebhookService initialized', {
        registeredWebhooks: this.#registeredWebhooks.size,
        eventHandlers: this.#eventHandlers.size
      });

    } catch (error) {
      logger.error('Failed to initialize WebhookService', { error: error.message });
      throw new AppError(
        'Webhook service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Register webhook endpoint
   * @static
   * @param {Object} options - Webhook registration options
   * @param {string} options.url - Webhook URL
   * @param {Array<string>} options.events - Events to subscribe to
   * @param {string} [options.name] - Webhook name
   * @param {string} [options.description] - Webhook description
   * @param {Object} [options.headers] - Custom headers
   * @param {string} [options.secret] - Webhook secret for signatures
   * @param {boolean} [options.active=true] - Is webhook active
   * @param {string} [options.userId] - User ID
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} Registered webhook
   */
  static async register(options) {
    await this.initialize();

    try {
      // Validate options
      const validated = await this.#validateWebhookOptions(options);
      
      // Check if webhook already exists
      const existing = await WebhookModel.findOne({
        url: validated.url,
        organizationId: validated.organizationId,
        active: true
      });

      if (existing) {
        throw new AppError(
          'Webhook already registered',
          409,
          ERROR_CODES.WEBHOOK_ALREADY_EXISTS
        );
      }

      // Generate webhook ID and secret
      const webhookId = this.#generateWebhookId();
      const secret = validated.secret || this.#generateSecret();

      // Create webhook
      const webhook = await WebhookModel.create({
        _id: webhookId,
        ...validated,
        secret: await CryptoUtils.hash(secret),
        createdAt: new Date()
      });

      // Cache webhook
      this.#registeredWebhooks.set(webhookId, {
        ...webhook.toObject(),
        secret // Store plain secret in memory for signing
      });

      // Audit log
      await this.#auditLog({
        action: 'webhook.registered',
        webhookId,
        userId: validated.userId,
        organizationId: validated.organizationId,
        metadata: {
          url: validated.url,
          events: validated.events
        }
      });

      logger.info('Webhook registered', {
        webhookId,
        url: validated.url,
        events: validated.events
      });

      return {
        id: webhookId,
        url: validated.url,
        events: validated.events,
        secret, // Return secret only on registration
        active: validated.active
      };

    } catch (error) {
      logger.error('Webhook registration failed', { error: error.message });
      throw error instanceof AppError ? error : new AppError(
        'Failed to register webhook',
        500,
        ERROR_CODES.WEBHOOK_REGISTRATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Update webhook
   * @static
   * @param {string} webhookId - Webhook ID
   * @param {Object} updates - Update options
   * @returns {Promise<Object>} Updated webhook
   */
  static async update(webhookId, updates) {
    await this.initialize();

    try {
      const webhook = await WebhookModel.findByIdAndUpdate(
        webhookId,
        {
          ...updates,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!webhook) {
        throw new AppError(
          'Webhook not found',
          404,
          ERROR_CODES.WEBHOOK_NOT_FOUND
        );
      }

      // Update cache
      const cached = this.#registeredWebhooks.get(webhookId);
      if (cached) {
        Object.assign(cached, webhook.toObject());
      }

      // Audit log
      await this.#auditLog({
        action: 'webhook.updated',
        webhookId,
        metadata: { updates }
      });

      return webhook;

    } catch (error) {
      logger.error('Webhook update failed', { webhookId, error: error.message });
      throw error instanceof AppError ? error : new AppError(
        'Failed to update webhook',
        500,
        ERROR_CODES.WEBHOOK_UPDATE_FAILED
      );
    }
  }

  /**
   * Delete webhook
   * @static
   * @param {string} webhookId - Webhook ID
   * @param {Object} [options] - Delete options
   * @returns {Promise<boolean>} Success status
   */
  static async delete(webhookId, options = {}) {
    await this.initialize();

    try {
      const webhook = await WebhookModel.findByIdAndDelete(webhookId);
      
      if (!webhook) {
        return false;
      }

      // Remove from cache
      this.#registeredWebhooks.delete(webhookId);

      // Cancel any pending retries
      const retryTimer = this.#retryTimers.get(webhookId);
      if (retryTimer) {
        clearTimeout(retryTimer);
        this.#retryTimers.delete(webhookId);
      }

      // Audit log
      await this.#auditLog({
        action: 'webhook.deleted',
        webhookId,
        userId: options.userId,
        organizationId: options.organizationId
      });

      logger.info('Webhook deleted', { webhookId });
      return true;

    } catch (error) {
      logger.error('Webhook deletion failed', { webhookId, error: error.message });
      throw new AppError(
        'Failed to delete webhook',
        500,
        ERROR_CODES.WEBHOOK_DELETE_FAILED
      );
    }
  }

  /**
   * Trigger webhook event
   * @static
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} [options] - Trigger options
   * @returns {Promise<Object>} Delivery results
   */
  static async trigger(event, data, options = {}) {
    await this.initialize();

    const eventId = this.#generateEventId();
    const timestamp = Date.now();

    try {
      // Validate event
      if (!Object.values(this.WEBHOOK_EVENTS).includes(event) && event !== this.WEBHOOK_EVENTS.CUSTOM) {
        throw new AppError(
          'Invalid webhook event',
          400,
          ERROR_CODES.INVALID_WEBHOOK_EVENT
        );
      }

      // Get webhooks subscribed to this event
      const webhooks = await this.#getWebhooksForEvent(event, options);
      
      if (webhooks.length === 0) {
        logger.debug('No webhooks registered for event', { event });
        return { eventId, delivered: 0, total: 0 };
      }

      // Prepare payload
      const payload = {
        id: eventId,
        event,
        data,
        timestamp: new Date(timestamp).toISOString(),
        metadata: options.metadata || {}
      };

      // Queue deliveries
      const deliveries = [];
      for (const webhook of webhooks) {
        deliveries.push(
          this.#queueDelivery(webhook, payload, eventId)
        );
      }

      // Wait for initial delivery attempts
      const results = await Promise.allSettled(deliveries);
      
      const stats = {
        eventId,
        event,
        total: webhooks.length,
        delivered: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length
      };

      logger.info('Webhook event triggered', stats);
      return stats;

    } catch (error) {
      logger.error('Webhook trigger failed', { 
        event, 
        eventId, 
        error: error.message 
      });
      throw error instanceof AppError ? error : new AppError(
        'Failed to trigger webhook',
        500,
        ERROR_CODES.WEBHOOK_TRIGGER_FAILED
      );
    }
  }

  /**
   * Handle incoming webhook
   * @static
   * @param {Object} options - Incoming webhook options
   * @param {string} options.path - Webhook path/endpoint
   * @param {Object} options.headers - Request headers
   * @param {Object|string} options.body - Request body
   * @param {string} [options.method='POST'] - HTTP method
   * @param {string} [options.ip] - Client IP
   * @returns {Promise<Object>} Processing result
   */
  static async handleIncoming(options) {
    await this.initialize();

    const webhookId = this.#generateWebhookId();

    try {
      // Validate incoming webhook
      const validated = await this.#validateIncomingWebhook(options);
      
      // Check rate limits
      await this.#checkRateLimit(validated.ip || 'unknown');

      // Get handler for path
      const handler = this.#eventHandlers.get(validated.path);
      if (!handler) {
        throw new AppError(
          'Webhook endpoint not found',
          404,
          ERROR_CODES.WEBHOOK_ENDPOINT_NOT_FOUND
        );
      }

      // Verify signature if required
      if (handler.requireSignature) {
        const isValid = await this.#verifySignature(
          validated.body,
          validated.headers,
          handler.secret
        );
        
        if (!isValid) {
          throw new AppError(
            'Invalid webhook signature',
            401,
            ERROR_CODES.INVALID_WEBHOOK_SIGNATURE
          );
        }
      }

      // Process webhook
      const result = await handler.handler({
        id: webhookId,
        ...validated,
        verified: handler.requireSignature
      });

      // Record incoming webhook
      await this.#recordIncomingWebhook({
        webhookId,
        path: validated.path,
        success: true,
        result
      });

      logger.info('Incoming webhook processed', {
        webhookId,
        path: validated.path
      });

      return {
        webhookId,
        success: true,
        result
      };

    } catch (error) {
      // Record failed webhook
      await this.#recordIncomingWebhook({
        webhookId,
        path: options.path,
        success: false,
        error: error.message
      });

      logger.error('Incoming webhook failed', {
        webhookId,
        path: options.path,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to process incoming webhook',
        500,
        ERROR_CODES.INCOMING_WEBHOOK_FAILED
      );
    }
  }

  /**
   * Register incoming webhook handler
   * @static
   * @param {string} path - Webhook path
   * @param {Function} handler - Handler function
   * @param {Object} [options] - Handler options
   */
  static registerHandler(path, handler, options = {}) {
    if (!path || typeof handler !== 'function') {
      throw new AppError(
        'Invalid handler configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#eventHandlers.set(path, {
      handler,
      requireSignature: options.requireSignature || false,
      secret: options.secret,
      rateLimit: options.rateLimit,
      metadata: options.metadata || {}
    });

    logger.info('Webhook handler registered', { path });
  }

  /**
   * Get webhook delivery history
   * @static
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Delivery history
   */
  static async getDeliveryHistory(options = {}) {
    await this.initialize();

    const {
      webhookId,
      event,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 20
    } = options;

    try {
      const query = {};
      
      if (webhookId) query.webhookId = webhookId;
      if (event) query.event = event;
      if (status) query.status = status;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      const deliveries = await this.#cacheService.get('delivery_history') || [];
      
      // Filter deliveries
      const filtered = deliveries.filter(delivery => {
        return Object.entries(query).every(([key, value]) => {
          if (key === 'timestamp') {
            const timestamp = new Date(delivery.timestamp);
            if (value.$gte && timestamp < value.$gte) return false;
            if (value.$lte && timestamp > value.$lte) return false;
            return true;
          }
          return delivery[key] === value;
        });
      });

      // Paginate
      const start = (page - 1) * pageSize;
      const paginated = filtered.slice(start, start + pageSize);

      return {
        deliveries: paginated,
        pagination: {
          total: filtered.length,
          page,
          pageSize,
          totalPages: Math.ceil(filtered.length / pageSize)
        }
      };

    } catch (error) {
      logger.error('Failed to get delivery history', { error: error.message });
      throw new AppError(
        'Failed to get delivery history',
        500,
        ERROR_CODES.HISTORY_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Get webhook statistics
   * @static
   * @returns {Object} Webhook statistics
   */
  static getStats() {
    const stats = {
      totalWebhooks: this.#registeredWebhooks.size,
      activeWebhooks: 0,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      avgDeliveryTime: 0,
      byEvent: {},
      byStatus: {}
    };

    // Count active webhooks
    this.#registeredWebhooks.forEach(webhook => {
      if (webhook.active) stats.activeWebhooks++;
    });

    // Aggregate delivery stats
    let totalTime = 0;
    this.#deliveryStats.forEach((eventStats, event) => {
      stats.byEvent[event] = {
        total: eventStats.total,
        successful: eventStats.successful,
        failed: eventStats.failed,
        avgTime: eventStats.totalTime / eventStats.total || 0
      };

      stats.totalDeliveries += eventStats.total;
      stats.successfulDeliveries += eventStats.successful;
      stats.failedDeliveries += eventStats.failed;
      totalTime += eventStats.totalTime;
    });

    stats.avgDeliveryTime = stats.totalDeliveries > 0 
      ? totalTime / stats.totalDeliveries 
      : 0;

    stats.successRate = stats.totalDeliveries > 0
      ? (stats.successfulDeliveries / stats.totalDeliveries) * 100
      : 0;

    return stats;
  }

  /**
   * Test webhook endpoint
   * @static
   * @param {string} webhookId - Webhook ID
   * @param {Object} [testData] - Test payload
   * @returns {Promise<Object>} Test result
   */
  static async test(webhookId, testData = {}) {
    await this.initialize();

    const webhook = this.#registeredWebhooks.get(webhookId);
    if (!webhook) {
      throw new AppError(
        'Webhook not found',
        404,
        ERROR_CODES.WEBHOOK_NOT_FOUND
      );
    }

    const testPayload = {
      id: this.#generateEventId(),
      event: 'test',
      data: testData,
      timestamp: new Date().toISOString(),
      metadata: { test: true }
    };

    try {
      const result = await this.#deliver(webhook, testPayload, 'test_' + Date.now());
      
      return {
        success: true,
        statusCode: result.statusCode,
        responseTime: result.duration,
        headers: result.headers
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status
      };
    }
  }

  /**
   * @private
   * Load registered webhooks from database
   */
  static async #loadRegisteredWebhooks() {
    try {
      const webhooks = await WebhookModel.find({ active: true });
      
      webhooks.forEach(webhook => {
        this.#registeredWebhooks.set(webhook._id, webhook.toObject());
      });

      logger.info('Loaded registered webhooks', { count: webhooks.length });

    } catch (error) {
      logger.error('Failed to load webhooks', { error: error.message });
    }
  }

  /**
   * @private
   * Validate webhook options
   */
  static async #validateWebhookOptions(options) {
    const validated = { ...options };

    // Validate URL
    if (!validated.url) {
      throw new AppError(
        'Webhook URL is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    try {
      const url = new URL(validated.url);
      
      // Check HTTPS requirement
      if (this.#config.validation.requireHttps && url.protocol !== 'https:') {
        throw new AppError(
          'HTTPS is required for webhooks',
          400,
          ERROR_CODES.HTTPS_REQUIRED
        );
      }
    } catch (error) {
      throw new AppError(
        'Invalid webhook URL',
        400,
        ERROR_CODES.INVALID_URL
      );
    }

    // Validate events
    if (!validated.events || validated.events.length === 0) {
      throw new AppError(
        'At least one event is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Validate event names
    validated.events = validated.events.filter(event => 
      Object.values(this.WEBHOOK_EVENTS).includes(event) || 
      event.startsWith('custom.')
    );

    if (validated.events.length === 0) {
      throw new AppError(
        'No valid events specified',
        400,
        ERROR_CODES.INVALID_WEBHOOK_EVENT
      );
    }

    // Set defaults
    validated.active = validated.active !== false;
    validated.headers = validated.headers || {};
    validated.retryPolicy = {
      ...this.#config.retryPolicy,
      ...validated.retryPolicy
    };

    return validated;
  }

  /**
   * @private
   * Get webhooks for event
   */
  static async #getWebhooksForEvent(event, options = {}) {
    const webhooks = [];
    
    this.#registeredWebhooks.forEach(webhook => {
      if (!webhook.active) return;
      
      if (webhook.events.includes(event) || webhook.events.includes('*')) {
        // Check organization filter
        if (options.organizationId && webhook.organizationId !== options.organizationId) {
          return;
        }
        
        webhooks.push(webhook);
      }
    });

    return webhooks;
  }

  /**
   * @private
   * Queue webhook delivery
   */
  static async #queueDelivery(webhook, payload, eventId) {
    const deliveryId = this.#generateDeliveryId();
    
    // Add to processing queue
    const queueKey = `${webhook._id}:${eventId}`;
    if (this.#processingQueue.has(queueKey)) {
      logger.debug('Delivery already in queue', { webhookId: webhook._id, eventId });
      return { queued: true, deliveryId };
    }
    
    this.#processingQueue.add(queueKey);

    try {
      // Attempt immediate delivery
      const result = await this.#deliver(webhook, payload, deliveryId);
      
      // Record successful delivery
      await this.#recordDelivery({
        deliveryId,
        webhookId: webhook._id,
        event: payload.event,
        status: 'delivered',
        statusCode: result.statusCode,
        duration: result.duration,
        attempts: 1
      });

      return { delivered: true, deliveryId };

    } catch (error) {
      logger.warn('Initial delivery failed, scheduling retry', {
        webhookId: webhook._id,
        error: error.message
      });

      // Schedule retry
      await this.#scheduleRetry(webhook, payload, deliveryId, 1);
      
      return { queued: true, deliveryId };

    } finally {
      this.#processingQueue.delete(queueKey);
    }
  }

  /**
   * @private
   * Deliver webhook
   */
  static async #deliver(webhook, payload, deliveryId) {
    const startTime = Date.now();
    
    // Prepare request
    const signature = this.#generateSignature(payload, webhook.secret);
    const timestamp = Date.now();
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'InsightSerenity-Webhook/1.0',
      [this.#config.security.signatureHeader]: signature,
      [this.#config.security.timestampHeader]: timestamp,
      'X-Webhook-Id': webhook._id,
      'X-Delivery-Id': deliveryId,
      ...webhook.headers
    };

    try {
      const response = await axios({
        method: 'POST',
        url: webhook.url,
        data: payload,
        headers,
        timeout: this.#config.timeout,
        validateStatus: status => status < 500 // Don't throw on 4xx
      });

      const duration = Date.now() - startTime;
      
      // Update delivery stats
      this.#updateDeliveryStats(payload.event, true, duration);

      logger.debug('Webhook delivered', {
        webhookId: webhook._id,
        deliveryId,
        statusCode: response.status,
        duration
      });

      return {
        statusCode: response.status,
        headers: response.headers,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update delivery stats
      this.#updateDeliveryStats(payload.event, false, duration);

      logger.error('Webhook delivery failed', {
        webhookId: webhook._id,
        deliveryId,
        error: error.message,
        statusCode: error.response?.status
      });

      throw error;
    }
  }

  /**
   * @private
   * Schedule webhook retry
   */
  static async #scheduleRetry(webhook, payload, deliveryId, attempt) {
    if (attempt >= webhook.retryPolicy.maxAttempts) {
      logger.warn('Max retry attempts reached', {
        webhookId: webhook._id,
        deliveryId,
        attempts: attempt
      });

      // Record final failure
      await this.#recordDelivery({
        deliveryId,
        webhookId: webhook._id,
        event: payload.event,
        status: 'failed',
        error: 'Max retries exceeded',
        attempts: attempt
      });

      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      webhook.retryPolicy.initialDelay * Math.pow(webhook.retryPolicy.backoffMultiplier, attempt - 1),
      webhook.retryPolicy.maxDelay || this.#config.retryPolicy.maxDelay
    );

    // Schedule retry
    const timer = setTimeout(async () => {
      try {
        const result = await this.#deliver(webhook, payload, deliveryId);
        
        // Record successful retry
        await this.#recordDelivery({
          deliveryId,
          webhookId: webhook._id,
          event: payload.event,
          status: 'delivered',
          statusCode: result.statusCode,
          duration: result.duration,
          attempts: attempt + 1
        });

      } catch (error) {
        // Schedule next retry
        await this.#scheduleRetry(webhook, payload, deliveryId, attempt + 1);
      }
      
      this.#retryTimers.delete(deliveryId);
    }, delay);

    this.#retryTimers.set(deliveryId, timer);

    logger.info('Webhook retry scheduled', {
      webhookId: webhook._id,
      deliveryId,
      attempt: attempt + 1,
      delay
    });
  }

  /**
   * @private
   * Generate webhook signature
   */
  static #generateSignature(payload, secret) {
    const timestamp = Date.now();
    const message = `${timestamp}.${JSON.stringify(payload)}`;
    
    return crypto
      .createHmac(this.#config.security.signatureAlgorithm, secret)
      .update(message)
      .digest('hex');
  }

  /**
   * @private
   * Verify webhook signature
   */
  static async #verifySignature(body, headers, secret) {
    const signature = headers[this.#config.security.signatureHeader.toLowerCase()];
    const timestamp = headers[this.#config.security.timestampHeader.toLowerCase()];

    if (!signature || !timestamp) {
      return false;
    }

    // Check timestamp to prevent replay attacks
    const timestampAge = Date.now() - parseInt(timestamp);
    if (timestampAge > this.#config.security.timestampTolerance) {
      logger.warn('Webhook timestamp too old', { age: timestampAge });
      return false;
    }

    // Verify signature
    const message = `${timestamp}.${typeof body === 'string' ? body : JSON.stringify(body)}`;
    const expectedSignature = crypto
      .createHmac(this.#config.security.signatureAlgorithm, secret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * @private
   * Validate incoming webhook
   */
  static async #validateIncomingWebhook(options) {
    const validated = { ...options };

    // Check content type
    const contentType = validated.headers['content-type']?.split(';')[0];
    if (!this.#config.validation.allowedContentTypes.includes(contentType)) {
      throw new AppError(
        'Invalid content type',
        415,
        ERROR_CODES.INVALID_CONTENT_TYPE
      );
    }

    // Check payload size
    const payloadSize = JSON.stringify(validated.body).length;
    if (payloadSize > this.#config.validation.maxPayloadSize) {
      throw new AppError(
        'Payload too large',
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE
      );
    }

    // Parse body if string
    if (typeof validated.body === 'string') {
      try {
        validated.body = JSON.parse(validated.body);
      } catch (error) {
        throw new AppError(
          'Invalid JSON payload',
          400,
          ERROR_CODES.INVALID_JSON
        );
      }
    }

    return validated;
  }

  /**
   * @private
   * Check rate limit
   */
  static async #checkRateLimit(identifier) {
    const key = `rate_limit:${identifier}`;
    const count = await this.#cacheService.get(key) || 0;
    
    if (count >= this.#config.rateLimit.maxRequestsPerMinute) {
      throw new AppError(
        'Rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        { 
          limit: this.#config.rateLimit.maxRequestsPerMinute,
          window: '1 minute'
        }
      );
    }

    await this.#cacheService.increment(key, 1, 60);
  }

  /**
   * @private
   * Record webhook delivery
   */
  static async #recordDelivery(delivery) {
    try {
      // Store in cache for history
      const history = await this.#cacheService.get('delivery_history') || [];
      history.unshift({
        ...delivery,
        timestamp: new Date()
      });

      // Keep last 1000 deliveries
      if (history.length > 1000) {
        history.length = 1000;
      }

      await this.#cacheService.set('delivery_history', history, 86400); // 24 hours

    } catch (error) {
      logger.error('Failed to record delivery', { error: error.message });
    }
  }

  /**
   * @private
   * Record incoming webhook
   */
  static async #recordIncomingWebhook(data) {
    try {
      const history = await this.#cacheService.get('incoming_history') || [];
      history.unshift({
        ...data,
        timestamp: new Date()
      });

      if (history.length > 1000) {
        history.length = 1000;
      }

      await this.#cacheService.set('incoming_history', history, 86400);

    } catch (error) {
      logger.error('Failed to record incoming webhook', { error: error.message });
    }
  }

  /**
   * @private
   * Update delivery statistics
   */
  static #updateDeliveryStats(event, success, duration) {
    if (!this.#deliveryStats.has(event)) {
      this.#deliveryStats.set(event, {
        total: 0,
        successful: 0,
        failed: 0,
        totalTime: 0
      });
    }

    const stats = this.#deliveryStats.get(event);
    stats.total++;
    if (success) {
      stats.successful++;
    } else {
      stats.failed++;
    }
    stats.totalTime += duration;
  }

  /**
   * @private
   * Start delivery processor
   */
  static #startDeliveryProcessor() {
    // This could be expanded to process queued deliveries
    // Currently, deliveries are processed immediately or scheduled as retries
  }

  /**
   * @private
   * Start cleanup task
   */
  static #startCleanupTask() {
    // Clean up old delivery records and expired retries
    setInterval(async () => {
      try {
        // Clean up completed retries
        this.#retryTimers.forEach((timer, deliveryId) => {
          if (!timer._destroyed) return;
          this.#retryTimers.delete(deliveryId);
        });

        // Clean up old webhook records
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
        await WebhookModel.deleteMany({
          active: false,
          updatedAt: { $lt: cutoff }
        });

      } catch (error) {
        logger.error('Cleanup task error', { error: error.message });
      }
    }, 3600000); // Every hour
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'webhook',
        resourceId: data.webhookId,
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
   * Generate webhook ID
   */
  static #generateWebhookId() {
    return `webhook_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate event ID
   */
  static #generateEventId() {
    return `event_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate delivery ID
   */
  static #generateDeliveryId() {
    return `delivery_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate webhook secret
   */
  static #generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  static async shutdown() {
    logger.info('Shutting down WebhookService');

    // Cancel all retry timers
    this.#retryTimers.forEach(timer => clearTimeout(timer));
    this.#retryTimers.clear();

    // Clear caches
    this.#registeredWebhooks.clear();
    this.#eventHandlers.clear();
    this.#deliveryStats.clear();
    this.#processingQueue.clear();

    await this.#cacheService.shutdown();

    this.#initialized = false;
    logger.info('WebhookService shutdown complete');
  }
}

// Export webhook events
WebhookService.EVENTS = WebhookService.WEBHOOK_EVENTS;

module.exports = WebhookService;