'use strict';

/**
 * @fileoverview Enterprise-grade payment processing service with multiple provider support
 * @module shared/lib/services/payment-service
 * @requires module:shared/lib/integrations/payment/stripe-service
 * @requires module:shared/lib/integrations/payment/paypal-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/webhook-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/config
 */

const StripeService = require('../integrations/payment/stripe-service');
const PayPalService = require('../integrations/payment/paypal-service');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const OrganizationModel = require('../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const AuditLogModel = require('../database/models/security/audit-log-model');
const CacheService = require('./cache-service');
const WebhookService = require('./webhook-service');
const EncryptionService = require('../security/encryption/encryption-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const { validateEmail } = require('../utils/validators/common-validators');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * @class PaymentService
 * @extends EventEmitter
 * @description Comprehensive payment service supporting multiple providers and payment methods
 */
class PaymentService extends EventEmitter {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #providers = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {EncryptionService}
   */
  static #encryptionService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #paymentMethods = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #subscriptions = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #transactionLocks = new Map();

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @type {EventEmitter}
   */
  static #eventEmitter = new EventEmitter();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    providers: {
      stripe: {
        enabled: true,
        defaultCurrency: 'usd',
        statementDescriptor: 'INSIGHTSERENITY'
      },
      paypal: {
        enabled: true,
        defaultCurrency: 'USD'
      }
    },
    webhooks: {
      enabled: true,
      secret: null
    },
    retry: {
      maxAttempts: 3,
      delay: 1000
    },
    cache: {
      ttl: 300 // 5 minutes
    }
  };

  /**
   * Initialize payment service
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.#initialized) {
      return;
    }

    try {
      this.#cacheService = new CacheService({ namespace: 'payments' });
      this.#encryptionService = new EncryptionService();

      // Merge config
      Object.assign(this.#config, config.payment || {});

      // Initialize providers
      if (this.#config.providers.stripe.enabled) {
        const stripeService = new StripeService(config.payment?.stripe);
        await stripeService.initialize();
        this.#providers.set('stripe', stripeService);
      }

      if (this.#config.providers.paypal.enabled) {
        const paypalService = new PayPalService(config.payment?.paypal);
        await paypalService.initialize();
        this.#providers.set('paypal', paypalService);
      }

      // Register webhook handlers
      await this.#registerWebhookHandlers();

      this.#initialized = true;
      logger.info('PaymentService initialized', {
        providers: Array.from(this.#providers.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize PaymentService', { error: error.message });
      throw new AppError(
        'Payment service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Create payment intent
   * @static
   * @param {Object} options - Payment options
   * @param {number} options.amount - Amount in cents
   * @param {string} options.currency - Currency code
   * @param {string} options.organizationId - Organization ID
   * @param {string} [options.customerId] - Customer ID
   * @param {string} [options.description] - Payment description
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {string} [options.paymentMethodId] - Existing payment method
   * @param {boolean} [options.setupFutureUsage=false] - Save for future use
   * @param {string} [options.userId] - User creating payment
   * @returns {Promise<Object>} Payment intent
   */
  static async createPaymentIntent(options) {
    await this.initialize();

    const transactionId = this.#generateTransactionId();
    const startTime = Date.now();

    try {
      // Validate options
      const validated = await this.#validatePaymentOptions(options);

      // Acquire lock to prevent duplicate payments
      await this.#acquireTransactionLock(transactionId, validated);

      // Get provider
      const provider = this.#getProvider(validated.provider || 'stripe');

      // Create payment intent
      logger.info('Creating payment intent', {
        transactionId,
        organizationId: validated.organizationId,
        amount: validated.amount,
        currency: validated.currency
      });

      const intent = await provider.createPaymentIntent({
        amount: validated.amount,
        currency: validated.currency,
        customer: validated.customerId,
        description: validated.description,
        metadata: {
          ...validated.metadata,
          transactionId,
          organizationId: validated.organizationId
        },
        payment_method: validated.paymentMethodId,
        setup_future_usage: validated.setupFutureUsage ? 'off_session' : null,
        statement_descriptor: this.#config.providers[validated.provider]?.statementDescriptor
      });

      // Store intent details
      await this.#storePaymentIntent({
        transactionId,
        intentId: intent.id,
        organizationId: validated.organizationId,
        customerId: validated.customerId,
        amount: validated.amount,
        currency: validated.currency,
        provider: validated.provider,
        status: intent.status,
        metadata: validated.metadata,
        createdBy: validated.userId
      });

      // Emit event
      this.#eventEmitter.emit('payment:intent:created', {
        transactionId,
        intentId: intent.id,
        organizationId: validated.organizationId
      });

      // Audit log
      await this.#auditLog({
        action: 'payment.intent.created',
        transactionId,
        organizationId: validated.organizationId,
        userId: validated.userId,
        metadata: {
          intentId: intent.id,
          amount: validated.amount,
          currency: validated.currency
        }
      });

      return {
        transactionId,
        intentId: intent.id,
        clientSecret: intent.client_secret,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        provider: validated.provider
      };

    } catch (error) {
      logger.error('Failed to create payment intent', {
        transactionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create payment intent',
        500,
        ERROR_CODES.PAYMENT_INTENT_FAILED,
        { transactionId, originalError: error.message }
      );

    } finally {
      await this.#releaseTransactionLock(transactionId);
    }
  }

  /**
   * Process payment
   * @static
   * @param {Object} options - Payment options
   * @param {string} options.paymentIntentId - Payment intent ID
   * @param {string} options.paymentMethodId - Payment method ID
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {Object} [options.billing] - Billing details
   * @param {string} [options.userId] - User processing payment
   * @returns {Promise<Object>} Payment result
   */
  static async processPayment(options) {
    await this.initialize();

    const { paymentIntentId, paymentMethodId, provider = 'stripe', billing, userId } = options;

    try {
      const providerService = this.#getProvider(provider);

      // Confirm payment
      const result = await providerService.confirmPayment({
        paymentIntentId,
        paymentMethodId,
        billing
      });

      // Update stored intent
      await this.#updatePaymentIntent(paymentIntentId, {
        status: result.status,
        paymentMethodId,
        processedAt: new Date()
      });

      // Handle successful payment
      if (result.status === 'succeeded') {
        await this.#handleSuccessfulPayment(result, userId);
      }

      return {
        success: result.status === 'succeeded',
        status: result.status,
        paymentId: result.id,
        amount: result.amount,
        currency: result.currency,
        receipt: result.receipt_url
      };

    } catch (error) {
      logger.error('Payment processing failed', {
        paymentIntentId,
        error: error.message
      });

      throw new AppError(
        'Payment processing failed',
        400,
        ERROR_CODES.PAYMENT_PROCESSING_FAILED,
        { paymentIntentId, error: error.message }
      );
    }
  }

  /**
   * Create customer
   * @static
   * @param {Object} options - Customer options
   * @param {string} options.organizationId - Organization ID
   * @param {string} options.email - Customer email
   * @param {string} [options.name] - Customer name
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {string} [options.userId] - User creating customer
   * @returns {Promise<Object>} Customer object
   */
  static async createCustomer(options) {
    await this.initialize();

    const { organizationId, email, name, metadata, provider = 'stripe', userId } = options;

    try {
      // Validate email
      if (!validateEmail(email)) {
        throw new AppError(
          'Invalid email address',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Check if customer exists
      const existingCustomer = await this.#getCustomerByEmail(email, provider);
      if (existingCustomer) {
        return existingCustomer;
      }

      const providerService = this.#getProvider(provider);

      // Create customer
      const customer = await providerService.createCustomer({
        email,
        name,
        metadata: {
          ...metadata,
          organizationId
        }
      });

      // Store customer reference
      await OrganizationModel.updateOne(
        { _id: organizationId },
        {
          $push: {
            'payment.customers': {
              provider,
              customerId: customer.id,
              email,
              name,
              createdAt: new Date()
            }
          }
        }
      );

      // Audit log
      await this.#auditLog({
        action: 'payment.customer.created',
        customerId: customer.id,
        organizationId,
        userId,
        metadata: { provider, email }
      });

      return {
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        provider
      };

    } catch (error) {
      logger.error('Failed to create customer', {
        email,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create customer',
        500,
        ERROR_CODES.CUSTOMER_CREATION_FAILED,
        { email, error: error.message }
      );
    }
  }

  /**
   * Add payment method
   * @static
   * @param {Object} options - Payment method options
   * @param {string} options.customerId - Customer ID
   * @param {string} options.paymentMethodId - Payment method ID
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {boolean} [options.setDefault=false] - Set as default
   * @param {string} [options.userId] - User adding method
   * @returns {Promise<Object>} Payment method
   */
  static async addPaymentMethod(options) {
    await this.initialize();

    const { customerId, paymentMethodId, provider = 'stripe', setDefault = false, userId } = options;

    try {
      const providerService = this.#getProvider(provider);

      // Attach payment method
      const paymentMethod = await providerService.attachPaymentMethod({
        customerId,
        paymentMethodId
      });

      // Set as default if requested
      if (setDefault) {
        await providerService.setDefaultPaymentMethod({
          customerId,
          paymentMethodId
        });
      }

      // Store payment method reference
      const methodKey = `${provider}:${customerId}:${paymentMethodId}`;
      this.#paymentMethods.set(methodKey, {
        ...paymentMethod,
        isDefault: setDefault
      });

      // Emit event
      this.#eventEmitter.emit('payment:method:added', {
        customerId,
        paymentMethodId,
        provider
      });

      return {
        paymentMethodId: paymentMethod.id,
        type: paymentMethod.type,
        last4: paymentMethod.card?.last4,
        brand: paymentMethod.card?.brand,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: setDefault
      };

    } catch (error) {
      logger.error('Failed to add payment method', {
        customerId,
        error: error.message
      });

      throw new AppError(
        'Failed to add payment method',
        400,
        ERROR_CODES.PAYMENT_METHOD_FAILED,
        { customerId, error: error.message }
      );
    }
  }

  /**
   * Create subscription
   * @static
   * @param {Object} options - Subscription options
   * @param {string} options.customerId - Customer ID
   * @param {string} options.priceId - Price/Plan ID
   * @param {string} [options.paymentMethodId] - Payment method ID
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {number} [options.trialDays] - Trial period in days
   * @param {string} [options.userId] - User creating subscription
   * @returns {Promise<Object>} Subscription object
   */
  static async createSubscription(options) {
    await this.initialize();

    const {
      customerId,
      priceId,
      paymentMethodId,
      metadata,
      provider = 'stripe',
      trialDays,
      userId
    } = options;

    const subscriptionId = this.#generateSubscriptionId();

    try {
      const providerService = this.#getProvider(provider);

      // Create subscription
      const subscription = await providerService.createSubscription({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        default_payment_method: paymentMethodId,
        metadata: {
          ...metadata,
          subscriptionId
        },
        trial_period_days: trialDays,
        expand: ['latest_invoice.payment_intent']
      });

      // Store subscription
      await this.#storeSubscription({
        subscriptionId,
        providerId: subscription.id,
        customerId,
        priceId,
        provider,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        metadata,
        createdBy: userId
      });

      // Handle payment if required
      let paymentIntent = null;
      if (subscription.latest_invoice?.payment_intent) {
        paymentIntent = {
          id: subscription.latest_invoice.payment_intent.id,
          clientSecret: subscription.latest_invoice.payment_intent.client_secret,
          status: subscription.latest_invoice.payment_intent.status
        };
      }

      // Emit event
      this.#eventEmitter.emit('subscription:created', {
        subscriptionId,
        customerId,
        status: subscription.status
      });

      return {
        subscriptionId,
        providerId: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        paymentIntent
      };

    } catch (error) {
      logger.error('Failed to create subscription', {
        customerId,
        priceId,
        error: error.message
      });

      throw new AppError(
        'Failed to create subscription',
        400,
        ERROR_CODES.SUBSCRIPTION_CREATION_FAILED,
        { customerId, priceId, error: error.message }
      );
    }
  }

  /**
   * Cancel subscription
   * @static
   * @param {Object} options - Cancel options
   * @param {string} options.subscriptionId - Subscription ID
   * @param {boolean} [options.immediately=false] - Cancel immediately
   * @param {string} [options.reason] - Cancellation reason
   * @param {string} [options.userId] - User canceling subscription
   * @returns {Promise<Object>} Canceled subscription
   */
  static async cancelSubscription(options) {
    await this.initialize();

    const { subscriptionId, immediately = false, reason, userId } = options;

    try {
      // Get subscription
      const subscription = await this.#getSubscription(subscriptionId);
      if (!subscription) {
        throw new AppError(
          'Subscription not found',
          404,
          ERROR_CODES.RESOURCE_NOT_FOUND
        );
      }

      const providerService = this.#getProvider(subscription.provider);

      // Cancel subscription
      const canceled = await providerService.cancelSubscription({
        subscriptionId: subscription.providerId,
        immediately
      });

      // Update stored subscription
      await this.#updateSubscription(subscriptionId, {
        status: canceled.status,
        canceledAt: new Date(),
        cancelReason: reason,
        canceledBy: userId
      });

      // Emit event
      this.#eventEmitter.emit('subscription:canceled', {
        subscriptionId,
        immediately,
        reason
      });

      // Audit log
      await this.#auditLog({
        action: 'payment.subscription.canceled',
        subscriptionId,
        userId,
        metadata: { immediately, reason }
      });

      return {
        subscriptionId,
        status: canceled.status,
        canceledAt: new Date(canceled.canceled_at * 1000),
        currentPeriodEnd: new Date(canceled.current_period_end * 1000)
      };

    } catch (error) {
      logger.error('Failed to cancel subscription', {
        subscriptionId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to cancel subscription',
        500,
        ERROR_CODES.SUBSCRIPTION_CANCEL_FAILED,
        { subscriptionId, error: error.message }
      );
    }
  }

  /**
   * Process refund
   * @static
   * @param {Object} options - Refund options
   * @param {string} options.paymentId - Payment/Charge ID
   * @param {number} [options.amount] - Refund amount (partial refund)
   * @param {string} [options.reason] - Refund reason
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.provider='stripe'] - Payment provider
   * @param {string} [options.userId] - User processing refund
   * @returns {Promise<Object>} Refund object
   */
  static async processRefund(options) {
    await this.initialize();

    const { paymentId, amount, reason, metadata, provider = 'stripe', userId } = options;
    const refundId = this.#generateRefundId();

    try {
      const providerService = this.#getProvider(provider);

      // Create refund
      const refund = await providerService.createRefund({
        charge: paymentId,
        amount,
        reason,
        metadata: {
          ...metadata,
          refundId,
          processedBy: userId
        }
      });

      // Store refund details
      await this.#storeRefund({
        refundId,
        providerId: refund.id,
        paymentId,
        amount: refund.amount,
        currency: refund.currency,
        reason,
        status: refund.status,
        provider,
        processedBy: userId
      });

      // Emit event
      this.#eventEmitter.emit('payment:refund:processed', {
        refundId,
        paymentId,
        amount: refund.amount
      });

      // Audit log
      await this.#auditLog({
        action: 'payment.refund.processed',
        refundId,
        userId,
        metadata: {
          paymentId,
          amount: refund.amount,
          reason
        }
      });

      return {
        refundId,
        providerId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        created: new Date(refund.created * 1000)
      };

    } catch (error) {
      logger.error('Failed to process refund', {
        paymentId,
        error: error.message
      });

      throw new AppError(
        'Failed to process refund',
        400,
        ERROR_CODES.REFUND_FAILED,
        { paymentId, error: error.message }
      );
    }
  }

  /**
   * Get payment history
   * @static
   * @param {Object} options - Query options
   * @param {string} [options.organizationId] - Organization ID
   * @param {string} [options.customerId] - Customer ID
   * @param {Date} [options.startDate] - Start date
   * @param {Date} [options.endDate] - End date
   * @param {number} [options.limit=100] - Result limit
   * @param {string} [options.provider] - Filter by provider
   * @returns {Promise<Array>} Payment history
   */
  static async getPaymentHistory(options = {}) {
    await this.initialize();

    const { organizationId, customerId, startDate, endDate, limit = 100, provider } = options;

    try {
      // Build query
      const query = {};
      if (organizationId) query.organizationId = organizationId;
      if (customerId) query.customerId = customerId;
      if (provider) query.provider = provider;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      // Get from database (assuming payment collection exists)
      // This is a simplified example - implement based on your data model
      const payments = await OrganizationModel.aggregate([
        { $match: { _id: organizationId } },
        { $unwind: '$payments' },
        { $match: query },
        { $limit: limit },
        { $sort: { 'payments.createdAt': -1 } }
      ]);

      return payments.map(p => ({
        transactionId: p.payments.transactionId,
        amount: p.payments.amount,
        currency: p.payments.currency,
        status: p.payments.status,
        provider: p.payments.provider,
        createdAt: p.payments.createdAt
      }));

    } catch (error) {
      logger.error('Failed to get payment history', {
        error: error.message,
        options
      });

      throw new AppError(
        'Failed to retrieve payment history',
        500,
        ERROR_CODES.PAYMENT_HISTORY_ERROR,
        { error: error.message }
      );
    }
  }

  /**
   * Handle webhook
   * @static
   * @param {Object} options - Webhook options
   * @param {string} options.provider - Payment provider
   * @param {Object} options.headers - Request headers
   * @param {Object} options.body - Request body
   * @param {string} [options.signature] - Webhook signature
   * @returns {Promise<Object>} Processing result
   */
  static async handleWebhook(options) {
    await this.initialize();

    const { provider, headers, body, signature } = options;

    try {
      const providerService = this.#getProvider(provider);

      // Verify webhook
      const event = await providerService.verifyWebhook({
        headers,
        body,
        signature
      });

      // Process event
      logger.info('Processing payment webhook', {
        provider,
        type: event.type,
        id: event.id
      });

      const result = await this.#processWebhookEvent(provider, event);

      // Emit event
      this.#eventEmitter.emit('webhook:processed', {
        provider,
        type: event.type,
        result
      });

      return {
        processed: true,
        event: event.type,
        result
      };

    } catch (error) {
      logger.error('Webhook processing failed', {
        provider,
        error: error.message
      });

      throw new AppError(
        'Webhook processing failed',
        400,
        ERROR_CODES.WEBHOOK_PROCESSING_FAILED,
        { provider, error: error.message }
      );
    }
  }

  /**
   * Get provider capabilities
   * @static
   * @param {string} [provider] - Provider name
   * @returns {Object} Provider capabilities
   */
  static getCapabilities(provider) {
    if (provider) {
      const providerService = this.#providers.get(provider);
      if (!providerService) {
        throw new AppError(
          'Provider not found',
          404,
          ERROR_CODES.PROVIDER_NOT_FOUND
        );
      }

      return providerService.getCapabilities();
    }

    // Return all provider capabilities
    const capabilities = {};
    this.#providers.forEach((service, name) => {
      capabilities[name] = service.getCapabilities();
    });

    return capabilities;
  }

  /**
   * Subscribe to payment events
   * @static
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  static on(event, handler) {
    this.#eventEmitter.on(event, handler);
    return () => this.#eventEmitter.off(event, handler);
  }

  /**
   * @private
   * Get payment provider
   */
  static #getProvider(name) {
    const provider = this.#providers.get(name);
    if (!provider) {
      throw new AppError(
        `Payment provider '${name}' not found`,
        404,
        ERROR_CODES.PROVIDER_NOT_FOUND
      );
    }
    return provider;
  }

  /**
   * @private
   * Validate payment options
   */
  static async #validatePaymentOptions(options) {
    const validated = { ...options };

    // Validate amount
    if (!validated.amount || validated.amount <= 0) {
      throw new AppError(
        'Invalid payment amount',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Validate currency
    if (!validated.currency) {
      validated.currency = this.#config.providers[validated.provider || 'stripe']?.defaultCurrency || 'usd';
    }

    // Validate organization
    if (!validated.organizationId) {
      throw new AppError(
        'Organization ID is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return validated;
  }

  /**
   * @private
   * Acquire transaction lock
   */
  static async #acquireTransactionLock(transactionId, options) {
    const lockKey = `payment:lock:${options.organizationId}:${options.amount}`;
    const existingLock = this.#transactionLocks.get(lockKey);

    if (existingLock && Date.now() - existingLock.timestamp < 30000) {
      throw new AppError(
        'Duplicate payment detected',
        409,
        ERROR_CODES.DUPLICATE_PAYMENT
      );
    }

    this.#transactionLocks.set(lockKey, {
      transactionId,
      timestamp: Date.now(),
      options
    });
  }

  /**
   * @private
   * Release transaction lock
   */
  static async #releaseTransactionLock(transactionId) {
    // Find and remove lock
    for (const [key, lock] of this.#transactionLocks.entries()) {
      if (lock.transactionId === transactionId) {
        this.#transactionLocks.delete(key);
        break;
      }
    }
  }

  /**
   * @private
   * Store payment intent
   */
  static async #storePaymentIntent(data) {
    const cacheKey = `payment:intent:${data.intentId}`;
    await this.#cacheService.set(cacheKey, data, 86400); // 24 hours
  }

  /**
   * @private
   * Update payment intent
   */
  static async #updatePaymentIntent(intentId, updates) {
    const cacheKey = `payment:intent:${intentId}`;
    const existing = await this.#cacheService.get(cacheKey);
    
    if (existing) {
      await this.#cacheService.set(cacheKey, { ...existing, ...updates }, 86400);
    }
  }

  /**
   * @private
   * Handle successful payment
   */
  static async #handleSuccessfulPayment(payment, userId) {
    // Update organization billing
    if (payment.metadata?.organizationId) {
      await OrganizationModel.updateOne(
        { _id: payment.metadata.organizationId },
        {
          $push: {
            'billing.payments': {
              paymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              status: 'succeeded',
              paidAt: new Date()
            }
          },
          $inc: {
            'billing.totalPaid': payment.amount
          }
        }
      );
    }

    // Emit success event
    this.#eventEmitter.emit('payment:succeeded', {
      paymentId: payment.id,
      amount: payment.amount,
      organizationId: payment.metadata?.organizationId
    });
  }

  /**
   * @private
   * Get customer by email
   */
  static async #getCustomerByEmail(email, provider) {
    const organization = await OrganizationModel.findOne({
      'payment.customers.email': email,
      'payment.customers.provider': provider
    });

    if (organization) {
      const customer = organization.payment.customers.find(
        c => c.email === email && c.provider === provider
      );
      return customer ? { customerId: customer.customerId, email, provider } : null;
    }

    return null;
  }

  /**
   * @private
   * Get subscription
   */
  static async #getSubscription(subscriptionId) {
    // Check cache first
    if (this.#subscriptions.has(subscriptionId)) {
      return this.#subscriptions.get(subscriptionId);
    }

    // Get from cache service
    const cached = await this.#cacheService.get(`subscription:${subscriptionId}`);
    if (cached) {
      this.#subscriptions.set(subscriptionId, cached);
      return cached;
    }

    return null;
  }

  /**
   * @private
   * Store subscription
   */
  static async #storeSubscription(data) {
    const cacheKey = `subscription:${data.subscriptionId}`;
    await this.#cacheService.set(cacheKey, data, 0); // No expiry
    this.#subscriptions.set(data.subscriptionId, data);
  }

  /**
   * @private
   * Update subscription
   */
  static async #updateSubscription(subscriptionId, updates) {
    const subscription = await this.#getSubscription(subscriptionId);
    if (subscription) {
      const updated = { ...subscription, ...updates };
      await this.#storeSubscription(updated);
    }
  }

  /**
   * @private
   * Store refund
   */
  static async #storeRefund(data) {
    const cacheKey = `refund:${data.refundId}`;
    await this.#cacheService.set(cacheKey, data, 2592000); // 30 days
  }

  /**
   * @private
   * Process webhook event
   */
  static async #processWebhookEvent(provider, event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return await this.#handlePaymentSucceeded(provider, event.data.object);
      
      case 'payment_intent.payment_failed':
        return await this.#handlePaymentFailed(provider, event.data.object);
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return await this.#handleSubscriptionUpdate(provider, event.data.object);
      
      case 'customer.subscription.deleted':
        return await this.#handleSubscriptionDeleted(provider, event.data.object);
      
      case 'invoice.payment_succeeded':
        return await this.#handleInvoicePaymentSucceeded(provider, event.data.object);
      
      case 'charge.refunded':
        return await this.#handleChargeRefunded(provider, event.data.object);
      
      default:
        logger.debug('Unhandled webhook event', { provider, type: event.type });
        return { handled: false };
    }
  }

  /**
   * @private
   * Handle payment succeeded webhook
   */
  static async #handlePaymentSucceeded(provider, paymentIntent) {
    await this.#updatePaymentIntent(paymentIntent.id, {
      status: 'succeeded',
      succeededAt: new Date()
    });

    await this.#handleSuccessfulPayment(paymentIntent);

    return { handled: true, action: 'payment_succeeded' };
  }

  /**
   * @private
   * Handle payment failed webhook
   */
  static async #handlePaymentFailed(provider, paymentIntent) {
    await this.#updatePaymentIntent(paymentIntent.id, {
      status: 'failed',
      failedAt: new Date(),
      failureReason: paymentIntent.last_payment_error?.message
    });

    this.#eventEmitter.emit('payment:failed', {
      paymentId: paymentIntent.id,
      reason: paymentIntent.last_payment_error?.message
    });

    return { handled: true, action: 'payment_failed' };
  }

  /**
   * @private
   * Handle subscription update webhook
   */
  static async #handleSubscriptionUpdate(provider, subscription) {
    const subscriptionId = subscription.metadata?.subscriptionId;
    if (!subscriptionId) return { handled: false };

    await this.#updateSubscription(subscriptionId, {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date()
    });

    return { handled: true, action: 'subscription_updated' };
  }

  /**
   * @private
   * Handle subscription deleted webhook
   */
  static async #handleSubscriptionDeleted(provider, subscription) {
    const subscriptionId = subscription.metadata?.subscriptionId;
    if (!subscriptionId) return { handled: false };

    await this.#updateSubscription(subscriptionId, {
      status: 'canceled',
      canceledAt: new Date(),
      endedAt: new Date()
    });

    this.#eventEmitter.emit('subscription:ended', {
      subscriptionId,
      customerId: subscription.customer
    });

    return { handled: true, action: 'subscription_deleted' };
  }

  /**
   * @private
   * Handle invoice payment succeeded webhook
   */
  static async #handleInvoicePaymentSucceeded(provider, invoice) {
    if (invoice.subscription) {
      const subscriptionId = invoice.subscription_details?.metadata?.subscriptionId;
      if (subscriptionId) {
        await this.#updateSubscription(subscriptionId, {
          lastPaymentAt: new Date(),
          lastPaymentAmount: invoice.amount_paid
        });
      }
    }

    return { handled: true, action: 'invoice_paid' };
  }

  /**
   * @private
   * Handle charge refunded webhook
   */
  static async #handleChargeRefunded(provider, charge) {
    this.#eventEmitter.emit('payment:refunded', {
      chargeId: charge.id,
      amount: charge.amount_refunded,
      refunds: charge.refunds.data
    });

    return { handled: true, action: 'charge_refunded' };
  }

  /**
   * @private
   * Register webhook handlers
   */
  static async #registerWebhookHandlers() {
    if (!this.#config.webhooks.enabled) return;

    // Register with webhook service
    for (const provider of this.#providers.keys()) {
      await WebhookService.register({
        url: `/api/webhooks/payment/${provider}`,
        events: [`payment.${provider}.*`],
        metadata: { provider }
      });
    }
  }

  /**
   * @private
   * Generate transaction ID
   */
  static #generateTransactionId() {
    return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate subscription ID
   */
  static #generateSubscriptionId() {
    return `sub_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate refund ID
   */
  static #generateRefundId() {
    return `ref_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'payment',
        resourceId: data.transactionId || data.subscriptionId || data.refundId || data.customerId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error: error.message });
    }
  }
}

module.exports = PaymentService;