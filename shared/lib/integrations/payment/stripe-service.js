'use strict';

/**
 * @fileoverview Stripe payment integration service
 * @module shared/lib/integrations/payment/stripe-service
 * @requires module:stripe
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const stripe = require('stripe');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class StripeService
 * @description Handles all Stripe payment operations with PCI-DSS compliance
 * Implements tokenization, secure payment processing, and comprehensive error handling
 */
class StripeService {
  /**
   * @private
   * @type {Object}
   * @description Stripe client instance
   */
  #stripeClient;

  /**
   * @private
   * @type {Object}
   * @description Service configuration
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
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: '2023-10-16',
    maxRetries: 3,
    timeout: 30000,
    expandParams: ['data.customer', 'data.invoice'],
    webhookTolerance: 300,
    cacheTTL: 3600
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Supported payment method types
   */
  static #PAYMENT_METHOD_TYPES = {
    CARD: 'card',
    BANK_TRANSFER: 'bank_transfer',
    SEPA_DEBIT: 'sepa_debit',
    ACH_DEBIT: 'us_bank_account',
    ALIPAY: 'alipay',
    WECHAT: 'wechat_pay'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Payment status mappings
   */
  static #PAYMENT_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELED: 'canceled',
    REQUIRES_ACTION: 'requires_action',
    REQUIRES_CONFIRMATION: 'requires_confirmation'
  };

  /**
   * Creates a new StripeService instance
   * @param {Object} config - Service configuration
   * @param {string} config.secretKey - Stripe secret key
   * @param {string} [config.publishableKey] - Stripe publishable key
   * @param {string} [config.webhookSecret] - Webhook endpoint secret
   * @param {string} [config.apiVersion] - Stripe API version
   * @param {number} [config.maxRetries] - Maximum retry attempts
   * @param {number} [config.timeout] - Request timeout in milliseconds
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.secretKey) {
        throw new AppError(
          'Stripe secret key is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'StripeService' }
        );
      }

      this.#config = {
        ...StripeService.#DEFAULT_CONFIG,
        ...config
      };

      this.#stripeClient = stripe(this.#config.secretKey, {
        apiVersion: this.#config.apiVersion,
        maxNetworkRetries: this.#config.maxRetries,
        timeout: this.#config.timeout,
        telemetry: false
      });

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();

      logger.info('StripeService initialized', {
        apiVersion: this.#config.apiVersion,
        hasWebhookSecret: !!this.#config.webhookSecret
      });
    } catch (error) {
      logger.error('StripeService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize Stripe service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Initiates a payment with tokenization
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Amount in smallest currency unit
   * @param {string} paymentData.currency - Three-letter ISO currency code
   * @param {string} paymentData.paymentMethodId - Payment method ID or token
   * @param {string} [paymentData.customerId] - Stripe customer ID
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @param {boolean} [paymentData.confirm=true] - Auto-confirm payment
   * @param {string} [paymentData.returnUrl] - URL for 3D Secure redirects
   * @param {string} [paymentData.receiptEmail] - Email for receipt
   * @param {string} [paymentData.description] - Payment description
   * @param {string} [paymentData.statementDescriptor] - Statement descriptor
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Payment intent response
   * @throws {AppError} If payment initiation fails
   */
  async initiatePayment(paymentData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    
    try {
      logger.info('Initiating Stripe payment', {
        correlationId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        hasCustomer: !!paymentData.customerId
      });

      // Validate payment data
      this.#validatePaymentData(paymentData);

      // Create payment intent
      const paymentIntent = await this.#createPaymentIntent(paymentData, correlationId);

      // Handle confirmation if required
      if (paymentData.confirm) {
        return await this.#confirmPaymentIntent(paymentIntent.id, {
          paymentMethodId: paymentData.paymentMethodId,
          returnUrl: paymentData.returnUrl
        }, correlationId);
      }

      // Log successful initiation
      logger.info('Payment initiated successfully', {
        correlationId,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });

      return this.#sanitizePaymentResponse(paymentIntent);

    } catch (error) {
      logger.error('Payment initiation failed', {
        correlationId,
        error: error.message,
        type: error.type,
        code: error.code
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Processes a refund for a payment
   * @param {Object} refundData - Refund information
   * @param {string} refundData.paymentIntentId - Original payment intent ID
   * @param {number} [refundData.amount] - Amount to refund (defaults to full refund)
   * @param {string} [refundData.reason] - Refund reason
   * @param {Object} [refundData.metadata] - Additional metadata
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Refund response
   * @throws {AppError} If refund fails
   */
  async refundPayment(refundData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Processing refund', {
        correlationId,
        paymentIntentId: refundData.paymentIntentId,
        amount: refundData.amount,
        reason: refundData.reason
      });

      // Validate refund data
      if (!refundData.paymentIntentId) {
        throw new AppError(
          'Payment intent ID is required for refund',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { field: 'paymentIntentId' }
        );
      }

      // Create refund
      const refund = await this.#stripeClient.refunds.create({
        payment_intent: refundData.paymentIntentId,
        amount: refundData.amount,
        reason: this.#mapRefundReason(refundData.reason),
        metadata: {
          ...refundData.metadata,
          correlationId,
          processedAt: new Date().toISOString()
        }
      });

      logger.info('Refund processed successfully', {
        correlationId,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount
      });

      return this.#sanitizeRefundResponse(refund);

    } catch (error) {
      logger.error('Refund processing failed', {
        correlationId,
        error: error.message,
        type: error.type
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Retrieves payment status and details
   * @param {string} paymentIntentId - Payment intent ID
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Payment status and details
   * @throws {AppError} If status retrieval fails
   */
  async getPaymentStatus(paymentIntentId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `stripe:payment:${paymentIntentId}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('Payment status retrieved from cache', { correlationId, paymentIntentId });
        return cached;
      }

      logger.info('Retrieving payment status', { correlationId, paymentIntentId });

      const paymentIntent = await this.#stripeClient.paymentIntents.retrieve(
        paymentIntentId,
        { expand: this.#config.expandParams }
      );

      const status = this.#mapPaymentStatus(paymentIntent);

      // Cache the result
      await this.#cacheService.set(cacheKey, status, this.#config.cacheTTL);

      return status;

    } catch (error) {
      logger.error('Payment status retrieval failed', {
        correlationId,
        paymentIntentId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Creates a customer in Stripe
   * @param {Object} customerData - Customer information
   * @param {string} customerData.email - Customer email
   * @param {string} [customerData.name] - Customer name
   * @param {string} [customerData.phone] - Customer phone
   * @param {Object} [customerData.address] - Customer address
   * @param {Object} [customerData.metadata] - Additional metadata
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Customer object
   * @throws {AppError} If customer creation fails
   */
  async createCustomer(customerData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating Stripe customer', {
        correlationId,
        email: customerData.email
      });

      const customer = await this.#stripeClient.customers.create({
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        address: customerData.address,
        metadata: {
          ...customerData.metadata,
          correlationId,
          createdAt: new Date().toISOString()
        }
      });

      logger.info('Customer created successfully', {
        correlationId,
        customerId: customer.id
      });

      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        created: customer.created
      };

    } catch (error) {
      logger.error('Customer creation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Attaches a payment method to a customer
   * @param {string} paymentMethodId - Payment method ID
   * @param {string} customerId - Customer ID
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Attached payment method
   * @throws {AppError} If attachment fails
   */
  async attachPaymentMethod(paymentMethodId, customerId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Attaching payment method', {
        correlationId,
        paymentMethodId,
        customerId
      });

      const paymentMethod = await this.#stripeClient.paymentMethods.attach(
        paymentMethodId,
        { customer: customerId }
      );

      // Optionally set as default
      if (options.setAsDefault) {
        await this.#stripeClient.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      return this.#sanitizePaymentMethod(paymentMethod);

    } catch (error) {
      logger.error('Payment method attachment failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Lists payment methods for a customer
   * @param {string} customerId - Customer ID
   * @param {Object} [options] - Additional options
   * @param {string} [options.type='card'] - Payment method type
   * @param {number} [options.limit=10] - Number of methods to retrieve
   * @returns {Promise<Array>} List of payment methods
   * @throws {AppError} If retrieval fails
   */
  async listPaymentMethods(customerId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      const { type = 'card', limit = 10 } = options;

      logger.info('Listing payment methods', {
        correlationId,
        customerId,
        type,
        limit
      });

      const paymentMethods = await this.#stripeClient.paymentMethods.list({
        customer: customerId,
        type,
        limit
      });

      return paymentMethods.data.map(pm => this.#sanitizePaymentMethod(pm));

    } catch (error) {
      logger.error('Payment method listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Creates a subscription for a customer
   * @param {Object} subscriptionData - Subscription information
   * @param {string} subscriptionData.customerId - Customer ID
   * @param {string} subscriptionData.priceId - Price ID
   * @param {Object} [subscriptionData.metadata] - Additional metadata
   * @param {number} [subscriptionData.trialDays] - Trial period days
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Subscription object
   * @throws {AppError} If subscription creation fails
   */
  async createSubscription(subscriptionData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating subscription', {
        correlationId,
        customerId: subscriptionData.customerId,
        priceId: subscriptionData.priceId
      });

      const subscriptionParams = {
        customer: subscriptionData.customerId,
        items: [{ price: subscriptionData.priceId }],
        metadata: {
          ...subscriptionData.metadata,
          correlationId
        }
      };

      if (subscriptionData.trialDays) {
        subscriptionParams.trial_period_days = subscriptionData.trialDays;
      }

      const subscription = await this.#stripeClient.subscriptions.create(subscriptionParams);

      logger.info('Subscription created successfully', {
        correlationId,
        subscriptionId: subscription.id,
        status: subscription.status
      });

      return this.#sanitizeSubscriptionResponse(subscription);

    } catch (error) {
      logger.error('Subscription creation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Cancels a subscription
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} [options] - Cancellation options
   * @param {boolean} [options.immediately=false] - Cancel immediately vs end of period
   * @returns {Promise<Object>} Canceled subscription
   * @throws {AppError} If cancellation fails
   */
  async cancelSubscription(subscriptionId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Canceling subscription', {
        correlationId,
        subscriptionId,
        immediately: options.immediately
      });

      const subscription = options.immediately
        ? await this.#stripeClient.subscriptions.del(subscriptionId)
        : await this.#stripeClient.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true
          });

      logger.info('Subscription canceled successfully', {
        correlationId,
        subscriptionId: subscription.id,
        status: subscription.status
      });

      return this.#sanitizeSubscriptionResponse(subscription);

    } catch (error) {
      logger.error('Subscription cancellation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleStripeError(error, correlationId);
    }
  }

  /**
   * Validates webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Stripe signature header
   * @returns {Object} Validated event object
   * @throws {AppError} If validation fails
   */
  validateWebhookSignature(payload, signature) {
    try {
      if (!this.#config.webhookSecret) {
        throw new AppError(
          'Webhook secret not configured',
          500,
          ERROR_CODES.CONFIGURATION_ERROR
        );
      }

      const event = this.#stripeClient.webhooks.constructEvent(
        payload,
        signature,
        this.#config.webhookSecret
      );

      logger.info('Webhook signature validated', {
        eventId: event.id,
        type: event.type
      });

      return event;

    } catch (error) {
      logger.error('Webhook validation failed', { error: error.message });
      
      throw new AppError(
        'Invalid webhook signature',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Creates a payment intent
   */
  async #createPaymentIntent(paymentData, correlationId) {
    const params = {
      amount: paymentData.amount,
      currency: paymentData.currency.toLowerCase(),
      metadata: {
        ...paymentData.metadata,
        correlationId
      }
    };

    if (paymentData.customerId) {
      params.customer = paymentData.customerId;
    }

    if (paymentData.paymentMethodId) {
      params.payment_method = paymentData.paymentMethodId;
    }

    if (paymentData.description) {
      params.description = paymentData.description;
    }

    if (paymentData.receiptEmail) {
      params.receipt_email = paymentData.receiptEmail;
    }

    if (paymentData.statementDescriptor) {
      params.statement_descriptor = paymentData.statementDescriptor;
    }

    return await this.#stripeClient.paymentIntents.create(params);
  }

  /**
   * @private
   * Confirms a payment intent
   */
  async #confirmPaymentIntent(paymentIntentId, confirmData, correlationId) {
    return await this.#stripeClient.paymentIntents.confirm(paymentIntentId, {
      payment_method: confirmData.paymentMethodId,
      return_url: confirmData.returnUrl
    });
  }

  /**
   * @private
   * Validates payment data
   */
  #validatePaymentData(paymentData) {
    const errors = [];

    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!paymentData.currency || paymentData.currency.length !== 3) {
      errors.push('Currency must be a 3-letter ISO code');
    }

    if (!paymentData.paymentMethodId && !paymentData.customerId) {
      errors.push('Either paymentMethodId or customerId is required');
    }

    if (errors.length > 0) {
      throw new AppError(
        'Invalid payment data',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Maps Stripe payment status to internal status
   */
  #mapPaymentStatus(paymentIntent) {
    const statusMap = {
      'requires_payment_method': StripeService.#PAYMENT_STATUS.PENDING,
      'requires_confirmation': StripeService.#PAYMENT_STATUS.REQUIRES_CONFIRMATION,
      'requires_action': StripeService.#PAYMENT_STATUS.REQUIRES_ACTION,
      'processing': StripeService.#PAYMENT_STATUS.PROCESSING,
      'succeeded': StripeService.#PAYMENT_STATUS.SUCCEEDED,
      'canceled': StripeService.#PAYMENT_STATUS.CANCELED
    };

    return {
      id: paymentIntent.id,
      status: statusMap[paymentIntent.status] || paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customerId: paymentIntent.customer,
      created: paymentIntent.created,
      metadata: paymentIntent.metadata,
      lastError: paymentIntent.last_payment_error,
      nextAction: paymentIntent.next_action
    };
  }

  /**
   * @private
   * Maps refund reason to Stripe format
   */
  #mapRefundReason(reason) {
    const reasonMap = {
      'duplicate': 'duplicate',
      'fraudulent': 'fraudulent',
      'requested': 'requested_by_customer',
      'other': null
    };

    return reasonMap[reason] || null;
  }

  /**
   * @private
   * Sanitizes payment response to remove sensitive data
   */
  #sanitizePaymentResponse(paymentIntent) {
    return {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      created: paymentIntent.created,
      customerId: paymentIntent.customer,
      metadata: paymentIntent.metadata,
      clientSecret: paymentIntent.client_secret
    };
  }

  /**
   * @private
   * Sanitizes refund response
   */
  #sanitizeRefundResponse(refund) {
    return {
      id: refund.id,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      created: refund.created,
      paymentIntentId: refund.payment_intent,
      reason: refund.reason,
      metadata: refund.metadata
    };
  }

  /**
   * @private
   * Sanitizes payment method data
   */
  #sanitizePaymentMethod(paymentMethod) {
    const sanitized = {
      id: paymentMethod.id,
      type: paymentMethod.type,
      created: paymentMethod.created
    };

    if (paymentMethod.card) {
      sanitized.card = {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year
      };
    }

    return sanitized;
  }

  /**
   * @private
   * Sanitizes subscription response
   */
  #sanitizeSubscriptionResponse(subscription) {
    return {
      id: subscription.id,
      status: subscription.status,
      customerId: subscription.customer,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      canceledAt: subscription.canceled_at,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: subscription.items.data.map(item => ({
        id: item.id,
        priceId: item.price.id,
        quantity: item.quantity
      })),
      metadata: subscription.metadata
    };
  }

  /**
   * @private
   * Handles Stripe errors and converts to AppError
   */
  #handleStripeError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const errorMap = {
      'card_declined': {
        message: 'Payment declined',
        code: ERROR_CODES.PAYMENT_DECLINED,
        status: 402
      },
      'authentication_required': {
        message: 'Authentication required',
        code: ERROR_CODES.AUTHENTICATION_REQUIRED,
        status: 402
      },
      'insufficient_funds': {
        message: 'Insufficient funds',
        code: ERROR_CODES.INSUFFICIENT_FUNDS,
        status: 402
      },
      'rate_limit': {
        message: 'Rate limit exceeded',
        code: ERROR_CODES.RATE_LIMIT_ERROR,
        status: 429
      },
      'invalid_request_error': {
        message: 'Invalid request',
        code: ERROR_CODES.VALIDATION_ERROR,
        status: 400
      }
    };

    const mappedError = errorMap[error.code] || {
      message: 'Payment processing error',
      code: ERROR_CODES.PAYMENT_ERROR,
      status: 500
    };

    return new AppError(
      mappedError.message,
      mappedError.status,
      mappedError.code,
      {
        correlationId,
        stripeError: error.code,
        declineCode: error.decline_code,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID for tracking
   */
  #generateCorrelationId() {
    return `stripe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Attempt to retrieve account details as health check
      const account = await this.#stripeClient.account.retrieve();
      
      return {
        healthy: true,
        service: 'StripeService',
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled
      };
    } catch (error) {
      logger.error('Stripe health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'StripeService',
        error: error.message
      };
    }
  }
}

module.exports = StripeService;