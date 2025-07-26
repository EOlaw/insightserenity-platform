'use strict';

/**
 * @fileoverview Payment processor abstraction and factory
 * @module shared/lib/integrations/payment/payment-processor
 * @requires module:shared/lib/integrations/payment/stripe-service
 * @requires module:shared/lib/integrations/payment/paypal-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const StripeService = require('./stripe-service');
const PayPalService = require('./paypal-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const AuditLogModel = require('../../database/models/audit-log-model');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class PaymentProcessor
 * @description Abstract payment processor that provides unified interface for multiple payment providers
 * Implements strategy pattern for provider switching and handles provider-agnostic operations
 */
class PaymentProcessor {
  /**
   * @private
   * @type {Object}
   * @description Available payment providers
   */
  #providers = {};

  /**
   * @private
   * @type {string}
   * @description Currently active provider
   */
  #activeProvider;

  /**
   * @private
   * @type {Object}
   * @description Processor configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service instance
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
   * @static
   * @readonly
   * @type {Object}
   * @description Supported payment providers
   */
  static #PROVIDERS = {
    STRIPE: 'stripe',
    PAYPAL: 'paypal'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Provider capabilities mapping
   */
  static #PROVIDER_CAPABILITIES = {
    stripe: {
      cards: true,
      bankTransfers: true,
      subscriptions: true,
      webhooks: true,
      refunds: true,
      partialRefunds: true,
      disputes: true,
      multicurrency: true,
      savePaymentMethods: true,
      threeDSecure: true
    },
    paypal: {
      cards: true,
      bankTransfers: false,
      subscriptions: true,
      webhooks: true,
      refunds: true,
      partialRefunds: true,
      disputes: true,
      multicurrency: true,
      savePaymentMethods: true,
      threeDSecure: true
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Transaction status mappings
   */
  static #TRANSACTION_STATUS = {
    INITIATED: 'initiated',
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled',
    REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'partially_refunded'
  };

  /**
   * Creates a new PaymentProcessor instance
   * @param {Object} config - Processor configuration
   * @param {Object} config.providers - Provider configurations
   * @param {Object} [config.providers.stripe] - Stripe configuration
   * @param {Object} [config.providers.paypal] - PayPal configuration
   * @param {string} [config.defaultProvider='stripe'] - Default provider to use
   * @param {boolean} [config.enableAuditLog=true] - Enable transaction audit logging
   * @param {boolean} [config.enableEncryption=true] - Enable sensitive data encryption
   * @param {number} [config.transactionCacheTTL=3600] - Transaction cache TTL in seconds
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.providers || Object.keys(config.providers).length === 0) {
        throw new AppError(
          'At least one payment provider must be configured',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'PaymentProcessor' }
        );
      }

      this.#config = {
        defaultProvider: config.defaultProvider || PaymentProcessor.#PROVIDERS.STRIPE,
        enableAuditLog: config.enableAuditLog !== false,
        enableEncryption: config.enableEncryption !== false,
        transactionCacheTTL: config.transactionCacheTTL || 3600,
        ...config
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();

      // Initialize configured providers
      this.#initializeProviders(config.providers);

      // Set active provider
      this.#activeProvider = this.#config.defaultProvider;

      logger.info('PaymentProcessor initialized', {
        providers: Object.keys(this.#providers),
        defaultProvider: this.#activeProvider,
        auditLogEnabled: this.#config.enableAuditLog
      });
    } catch (error) {
      logger.error('PaymentProcessor initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize payment processor',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Initiates a payment using the active provider
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Amount in smallest currency unit
   * @param {string} paymentData.currency - Three-letter ISO currency code
   * @param {string} paymentData.customerId - Customer identifier
   * @param {string} [paymentData.paymentMethodId] - Payment method identifier
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @param {Object} [options] - Processing options
   * @param {string} [options.provider] - Override provider for this transaction
   * @param {string} [options.idempotencyKey] - Idempotency key for duplicate prevention
   * @param {boolean} [options.savePaymentMethod=false] - Save payment method for future use
   * @returns {Promise<Object>} Unified payment response
   * @throws {AppError} If payment initiation fails
   */
  async initiatePayment(paymentData, options = {}) {
    const transactionId = this.#generateTransactionId();
    const provider = options.provider || this.#activeProvider;

    try {
      logger.info('Initiating payment', {
        transactionId,
        provider,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customerId: paymentData.customerId
      });

      // Check idempotency
      if (options.idempotencyKey) {
        const cached = await this.#checkIdempotency(options.idempotencyKey);
        if (cached) {
          logger.info('Returning cached payment result', { transactionId, idempotencyKey: options.idempotencyKey });
          return cached;
        }
      }

      // Validate provider
      const service = this.#getProvider(provider);

      // Prepare provider-specific data
      const providerData = this.#prepareProviderData(provider, paymentData, options);

      // Initiate payment with provider
      const result = await service.initiatePayment(providerData, {
        correlationId: transactionId,
        ...options
      });

      // Create unified response
      const unifiedResponse = this.#createUnifiedResponse(provider, 'payment', result, {
        transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customerId: paymentData.customerId,
        status: PaymentProcessor.#TRANSACTION_STATUS.INITIATED
      });

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('payment.initiated', unifiedResponse, paymentData);
      }

      // Cache for idempotency
      if (options.idempotencyKey) {
        await this.#cacheService.set(
          `payment:idempotency:${options.idempotencyKey}`,
          unifiedResponse,
          86400 // 24 hours
        );
      }

      // Cache transaction
      await this.#cacheTransaction(transactionId, unifiedResponse);

      return unifiedResponse;

    } catch (error) {
      logger.error('Payment initiation failed', {
        transactionId,
        provider,
        error: error.message
      });

      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('payment.failed', { transactionId }, {
          error: error.message,
          provider
        });
      }

      throw this.#handleProcessorError(error, provider);
    }
  }

  /**
   * Processes a refund for a completed payment
   * @param {Object} refundData - Refund information
   * @param {string} refundData.transactionId - Original transaction ID
   * @param {number} [refundData.amount] - Amount to refund (defaults to full)
   * @param {string} [refundData.reason] - Refund reason
   * @param {Object} [options] - Processing options
   * @returns {Promise<Object>} Unified refund response
   * @throws {AppError} If refund fails
   */
  async refundPayment(refundData, options = {}) {
    const refundId = this.#generateTransactionId('refund');

    try {
      logger.info('Processing refund', {
        refundId,
        transactionId: refundData.transactionId,
        amount: refundData.amount
      });

      // Retrieve original transaction
      const originalTransaction = await this.#getTransaction(refundData.transactionId);
      if (!originalTransaction) {
        throw new AppError(
          'Original transaction not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { transactionId: refundData.transactionId }
        );
      }

      // Validate refund
      this.#validateRefund(originalTransaction, refundData);

      // Get provider service
      const provider = originalTransaction.provider;
      const service = this.#getProvider(provider);

      // Prepare provider-specific refund data
      const providerRefundData = this.#prepareRefundData(provider, originalTransaction, refundData);

      // Process refund with provider
      const result = await service.refundPayment(providerRefundData, {
        correlationId: refundId,
        ...options
      });

      // Create unified response
      const unifiedResponse = this.#createUnifiedResponse(provider, 'refund', result, {
        refundId,
        transactionId: refundData.transactionId,
        amount: refundData.amount || originalTransaction.amount,
        currency: originalTransaction.currency,
        status: PaymentProcessor.#TRANSACTION_STATUS.REFUNDED
      });

      // Update original transaction status
      await this.#updateTransactionStatus(
        refundData.transactionId,
        refundData.amount && refundData.amount < originalTransaction.amount
          ? PaymentProcessor.#TRANSACTION_STATUS.PARTIALLY_REFUNDED
          : PaymentProcessor.#TRANSACTION_STATUS.REFUNDED
      );

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('refund.processed', unifiedResponse, refundData);
      }

      return unifiedResponse;

    } catch (error) {
      logger.error('Refund processing failed', {
        refundId,
        error: error.message
      });

      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('refund.failed', { refundId }, {
          error: error.message,
          refundData
        });
      }

      throw this.#handleProcessorError(error);
    }
  }

  /**
   * Retrieves payment status from provider
   * @param {string} transactionId - Transaction ID
   * @param {Object} [options] - Retrieval options
   * @returns {Promise<Object>} Payment status and details
   * @throws {AppError} If status retrieval fails
   */
  async getPaymentStatus(transactionId, options = {}) {
    try {
      logger.info('Retrieving payment status', { transactionId });

      // Get transaction from cache or database
      const transaction = await this.#getTransaction(transactionId);
      if (!transaction) {
        throw new AppError(
          'Transaction not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { transactionId }
        );
      }

      // Get provider service
      const service = this.#getProvider(transaction.provider);

      // Get status from provider
      const providerStatus = await service.getPaymentStatus(
        transaction.providerTransactionId,
        options
      );

      // Map to unified status
      const unifiedStatus = this.#mapProviderStatus(transaction.provider, providerStatus);

      // Update cached transaction
      if (unifiedStatus.status !== transaction.status) {
        await this.#updateTransactionStatus(transactionId, unifiedStatus.status);
      }

      return {
        ...transaction,
        ...unifiedStatus,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Payment status retrieval failed', {
        transactionId,
        error: error.message
      });

      throw this.#handleProcessorError(error);
    }
  }

  /**
   * Creates a customer across payment providers
   * @param {Object} customerData - Customer information
   * @param {string} customerData.email - Customer email
   * @param {string} [customerData.name] - Customer name
   * @param {Object} [options] - Creation options
   * @param {Array<string>} [options.providers] - Providers to create customer in
   * @returns {Promise<Object>} Customer creation results
   * @throws {AppError} If customer creation fails
   */
  async createCustomer(customerData, options = {}) {
    const customerId = this.#generateCustomerId();

    try {
      logger.info('Creating customer', {
        customerId,
        email: customerData.email,
        providers: options.providers || 'all'
      });

      const providers = options.providers || Object.keys(this.#providers);
      const results = {};

      // Create customer in each provider
      for (const provider of providers) {
        try {
          const service = this.#getProvider(provider);
          const providerCustomer = await service.createCustomer(customerData, {
            correlationId: customerId
          });

          results[provider] = {
            success: true,
            customerId: providerCustomer.id,
            data: providerCustomer
          };
        } catch (error) {
          logger.error(`Customer creation failed for ${provider}`, {
            customerId,
            error: error.message
          });

          results[provider] = {
            success: false,
            error: error.message
          };
        }
      }

      // Store customer mapping
      const customerMapping = {
        customerId,
        email: customerData.email,
        providers: results,
        created: new Date().toISOString()
      };

      await this.#cacheService.set(
        `customer:${customerId}`,
        customerMapping,
        86400 * 30 // 30 days
      );

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('customer.created', customerMapping, customerData);
      }

      return customerMapping;

    } catch (error) {
      logger.error('Customer creation failed', {
        customerId,
        error: error.message
      });

      throw this.#handleProcessorError(error);
    }
  }

  /**
   * Validates webhook from any provider
   * @param {string} provider - Provider name
   * @param {Object} headers - Webhook headers
   * @param {string} body - Raw webhook body
   * @param {Object} [options] - Validation options
   * @returns {Promise<Object>} Validated webhook event
   * @throws {AppError} If validation fails
   */
  async validateWebhook(provider, headers, body, options = {}) {
    try {
      logger.info('Validating webhook', { provider });

      // Get provider service
      const service = this.#getProvider(provider);

      // Validate based on provider
      let validatedEvent;
      
      if (provider === PaymentProcessor.#PROVIDERS.STRIPE) {
        const signature = headers['stripe-signature'];
        validatedEvent = service.validateWebhookSignature(body, signature);
      } else if (provider === PaymentProcessor.#PROVIDERS.PAYPAL) {
        const result = await service.verifyWebhook(headers, body, options.webhookId);
        if (!result.verified) {
          throw new AppError(
            'Invalid webhook signature',
            400,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
        validatedEvent = result.event;
      }

      // Process webhook event
      const processedEvent = await this.#processWebhookEvent(provider, validatedEvent);

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditTransaction('webhook.processed', processedEvent, {
          provider,
          eventType: validatedEvent.type || validatedEvent.event_type
        });
      }

      return processedEvent;

    } catch (error) {
      logger.error('Webhook validation failed', {
        provider,
        error: error.message
      });

      throw this.#handleProcessorError(error, provider);
    }
  }

  /**
   * Switches the active payment provider
   * @param {string} provider - Provider to switch to
   * @throws {AppError} If provider is not configured
   */
  switchProvider(provider) {
    if (!this.#providers[provider]) {
      throw new AppError(
        `Provider '${provider}' is not configured`,
        400,
        ERROR_CODES.CONFIGURATION_ERROR,
        { availableProviders: Object.keys(this.#providers) }
      );
    }

    const previousProvider = this.#activeProvider;
    this.#activeProvider = provider;

    logger.info('Switched payment provider', {
      from: previousProvider,
      to: provider
    });
  }

  /**
   * Gets provider capabilities
   * @param {string} [provider] - Provider name (defaults to active)
   * @returns {Object} Provider capabilities
   */
  getProviderCapabilities(provider) {
    const providerName = provider || this.#activeProvider;
    return PaymentProcessor.#PROVIDER_CAPABILITIES[providerName] || {};
  }

  /**
   * Gets all configured providers
   * @returns {Array<string>} List of configured providers
   */
  getConfiguredProviders() {
    return Object.keys(this.#providers);
  }

  /**
   * Gets the active provider
   * @returns {string} Active provider name
   */
  getActiveProvider() {
    return this.#activeProvider;
  }

  /**
   * Performs health check on all providers
   * @returns {Promise<Object>} Health status for all providers
   */
  async getHealthStatus() {
    const results = {
      healthy: true,
      providers: {}
    };

    for (const [name, service] of Object.entries(this.#providers)) {
      try {
        const status = await service.getHealthStatus();
        results.providers[name] = status;
        
        if (!status.healthy) {
          results.healthy = false;
        }
      } catch (error) {
        results.providers[name] = {
          healthy: false,
          error: error.message
        };
        results.healthy = false;
      }
    }

    return results;
  }

  /**
   * @private
   * Initializes payment providers
   */
  #initializeProviders(providerConfigs) {
    for (const [provider, config] of Object.entries(providerConfigs)) {
      if (!config || !config.enabled) {
        continue;
      }

      try {
        switch (provider) {
          case PaymentProcessor.#PROVIDERS.STRIPE:
            this.#providers[provider] = new StripeService(
              config,
              this.#cacheService,
              this.#encryptionService
            );
            break;

          case PaymentProcessor.#PROVIDERS.PAYPAL:
            this.#providers[provider] = new PayPalService(
              config,
              this.#cacheService
            );
            break;

          default:
            logger.warn(`Unknown provider: ${provider}`);
        }
      } catch (error) {
        logger.error(`Failed to initialize provider: ${provider}`, error);
        throw error;
      }
    }

    if (Object.keys(this.#providers).length === 0) {
      throw new AppError(
        'No payment providers could be initialized',
        500,
        ERROR_CODES.INITIALIZATION_ERROR
      );
    }
  }

  /**
   * @private
   * Gets provider service instance
   */
  #getProvider(provider) {
    const service = this.#providers[provider];
    
    if (!service) {
      throw new AppError(
        `Payment provider '${provider}' is not configured`,
        400,
        ERROR_CODES.CONFIGURATION_ERROR,
        { availableProviders: Object.keys(this.#providers) }
      );
    }

    return service;
  }

  /**
   * @private
   * Prepares provider-specific payment data
   */
  #prepareProviderData(provider, paymentData, options) {
    const baseData = {
      amount: paymentData.amount,
      currency: paymentData.currency,
      metadata: {
        ...paymentData.metadata,
        processorTransactionId: options.transactionId,
        source: 'payment_processor'
      }
    };

    // Provider-specific mapping
    switch (provider) {
      case PaymentProcessor.#PROVIDERS.STRIPE:
        return {
          ...baseData,
          customerId: paymentData.stripeCustomerId || paymentData.customerId,
          paymentMethodId: paymentData.paymentMethodId,
          confirm: options.autoConfirm !== false,
          description: paymentData.description,
          receiptEmail: paymentData.email,
          statementDescriptor: paymentData.statementDescriptor
        };

      case PaymentProcessor.#PROVIDERS.PAYPAL:
        return {
          ...baseData,
          description: paymentData.description,
          customId: paymentData.customerId,
          invoiceId: paymentData.invoiceId,
          returnUrl: paymentData.returnUrl || options.returnUrl,
          cancelUrl: paymentData.cancelUrl || options.cancelUrl
        };

      default:
        return baseData;
    }
  }

  /**
   * @private
   * Prepares provider-specific refund data
   */
  #prepareRefundData(provider, transaction, refundData) {
    switch (provider) {
      case PaymentProcessor.#PROVIDERS.STRIPE:
        return {
          paymentIntentId: transaction.providerTransactionId,
          amount: refundData.amount,
          reason: refundData.reason,
          metadata: {
            refundId: refundData.refundId,
            originalTransactionId: transaction.transactionId
          }
        };

      case PaymentProcessor.#PROVIDERS.PAYPAL:
        return {
          captureId: transaction.providerCaptureId || transaction.providerTransactionId,
          amount: refundData.amount,
          currency: transaction.currency,
          reason: refundData.reason,
          invoiceId: refundData.invoiceId
        };

      default:
        return refundData;
    }
  }

  /**
   * @private
   * Creates unified response format
   */
  #createUnifiedResponse(provider, type, providerResponse, additionalData) {
    const response = {
      ...additionalData,
      provider,
      providerTransactionId: providerResponse.id,
      providerResponse: this.#config.enableEncryption
        ? this.#encryptionService.encrypt(JSON.stringify(providerResponse))
        : providerResponse,
      created: new Date().toISOString()
    };

    // Add provider-specific fields
    if (provider === PaymentProcessor.#PROVIDERS.STRIPE && type === 'payment') {
      response.clientSecret = providerResponse.clientSecret;
    } else if (provider === PaymentProcessor.#PROVIDERS.PAYPAL && type === 'payment') {
      response.approvalUrl = providerResponse.links?.approve;
    }

    return response;
  }

  /**
   * @private
   * Maps provider status to unified status
   */
  #mapProviderStatus(provider, providerStatus) {
    // Provider-specific status mapping logic
    let mappedStatus;

    switch (provider) {
      case PaymentProcessor.#PROVIDERS.STRIPE:
        mappedStatus = {
          succeeded: PaymentProcessor.#TRANSACTION_STATUS.COMPLETED,
          processing: PaymentProcessor.#TRANSACTION_STATUS.PROCESSING,
          requires_action: PaymentProcessor.#TRANSACTION_STATUS.PENDING,
          canceled: PaymentProcessor.#TRANSACTION_STATUS.CANCELED
        }[providerStatus.status] || providerStatus.status;
        break;

      case PaymentProcessor.#PROVIDERS.PAYPAL:
        mappedStatus = {
          COMPLETED: PaymentProcessor.#TRANSACTION_STATUS.COMPLETED,
          APPROVED: PaymentProcessor.#TRANSACTION_STATUS.PROCESSING,
          CREATED: PaymentProcessor.#TRANSACTION_STATUS.INITIATED,
          VOIDED: PaymentProcessor.#TRANSACTION_STATUS.CANCELED
        }[providerStatus.status] || providerStatus.status;
        break;

      default:
        mappedStatus = providerStatus.status;
    }

    return {
      status: mappedStatus,
      providerStatus: providerStatus.status,
      lastError: providerStatus.lastError,
      metadata: providerStatus.metadata
    };
  }

  /**
   * @private
   * Processes webhook events
   */
  async #processWebhookEvent(provider, event) {
    const eventType = event.type || event.event_type;
    const eventData = event.data || event.resource;

    logger.info('Processing webhook event', {
      provider,
      eventType,
      eventId: event.id
    });

    // Handle common webhook events
    switch (eventType) {
      case 'payment_intent.succeeded':
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.#handlePaymentCompleted(provider, eventData);
        break;

      case 'payment_intent.payment_failed':
      case 'PAYMENT.CAPTURE.DENIED':
        await this.#handlePaymentFailed(provider, eventData);
        break;

      case 'charge.refunded':
      case 'PAYMENT.CAPTURE.REFUNDED':
        await this.#handleRefundCompleted(provider, eventData);
        break;

      default:
        logger.debug('Unhandled webhook event type', { provider, eventType });
    }

    return {
      processed: true,
      eventId: event.id,
      eventType,
      provider
    };
  }

  /**
   * @private
   * Handles payment completed webhook
   */
  async #handlePaymentCompleted(provider, eventData) {
    // Update transaction status in cache/database
    const transactionId = eventData.metadata?.processorTransactionId;
    if (transactionId) {
      await this.#updateTransactionStatus(
        transactionId,
        PaymentProcessor.#TRANSACTION_STATUS.COMPLETED
      );
    }
  }

  /**
   * @private
   * Handles payment failed webhook
   */
  async #handlePaymentFailed(provider, eventData) {
    const transactionId = eventData.metadata?.processorTransactionId;
    if (transactionId) {
      await this.#updateTransactionStatus(
        transactionId,
        PaymentProcessor.#TRANSACTION_STATUS.FAILED
      );
    }
  }

  /**
   * @private
   * Handles refund completed webhook
   */
  async #handleRefundCompleted(provider, eventData) {
    const transactionId = eventData.metadata?.originalTransactionId;
    if (transactionId) {
      const transaction = await this.#getTransaction(transactionId);
      if (transaction) {
        const isPartial = eventData.amount < transaction.amount;
        await this.#updateTransactionStatus(
          transactionId,
          isPartial
            ? PaymentProcessor.#TRANSACTION_STATUS.PARTIALLY_REFUNDED
            : PaymentProcessor.#TRANSACTION_STATUS.REFUNDED
        );
      }
    }
  }

  /**
   * @private
   * Caches transaction data
   */
  async #cacheTransaction(transactionId, data) {
    const cacheKey = `transaction:${transactionId}`;
    await this.#cacheService.set(cacheKey, data, this.#config.transactionCacheTTL);
  }

  /**
   * @private
   * Retrieves transaction from cache
   */
  async #getTransaction(transactionId) {
    const cacheKey = `transaction:${transactionId}`;
    return await this.#cacheService.get(cacheKey);
  }

  /**
   * @private
   * Updates transaction status
   */
  async #updateTransactionStatus(transactionId, status) {
    const transaction = await this.#getTransaction(transactionId);
    if (transaction) {
      transaction.status = status;
      transaction.lastUpdated = new Date().toISOString();
      await this.#cacheTransaction(transactionId, transaction);
    }
  }

  /**
   * @private
   * Checks idempotency
   */
  async #checkIdempotency(idempotencyKey) {
    const cacheKey = `payment:idempotency:${idempotencyKey}`;
    return await this.#cacheService.get(cacheKey);
  }

  /**
   * @private
   * Validates refund request
   */
  #validateRefund(transaction, refundData) {
    const errors = [];

    // Check transaction status
    const refundableStatuses = [
      PaymentProcessor.#TRANSACTION_STATUS.COMPLETED,
      PaymentProcessor.#TRANSACTION_STATUS.PARTIALLY_REFUNDED
    ];

    if (!refundableStatuses.includes(transaction.status)) {
      errors.push(`Transaction is not refundable. Current status: ${transaction.status}`);
    }

    // Check refund amount
    if (refundData.amount) {
      const totalRefunded = transaction.refundedAmount || 0;
      const remainingAmount = transaction.amount - totalRefunded;

      if (refundData.amount > remainingAmount) {
        errors.push(`Refund amount exceeds remaining balance. Maximum refundable: ${remainingAmount}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid refund request',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors, transactionId: transaction.transactionId }
      );
    }
  }

  /**
   * @private
   * Audits transaction
   */
  async #auditTransaction(action, data, metadata = {}) {
    try {
      await AuditLogModel.create({
        action,
        category: 'payment',
        userId: metadata.userId || 'system',
        resourceType: 'transaction',
        resourceId: data.transactionId || data.refundId || data.customerId,
        details: {
          ...metadata,
          provider: data.provider,
          amount: data.amount,
          currency: data.currency
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });
    } catch (error) {
      logger.error('Failed to create audit log', {
        action,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Handles processor errors
   */
  #handleProcessorError(error, provider) {
    if (error instanceof AppError) {
      return error;
    }

    return new AppError(
      'Payment processing error',
      500,
      ERROR_CODES.PAYMENT_ERROR,
      {
        provider,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates transaction ID
   */
  #generateTransactionId(prefix = 'txn') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates customer ID
   */
  #generateCustomerId() {
    return `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = PaymentProcessor;