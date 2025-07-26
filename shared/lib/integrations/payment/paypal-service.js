'use strict';

/**
 * @fileoverview PayPal payment integration service
 * @module shared/lib/integrations/payment/paypal-service
 * @requires module:axios
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/external-api-service
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const ExternalApiService = require('../../services/external-api-service');

/**
 * @class PayPalService
 * @description Handles PayPal payment operations using REST API v2
 * Implements secure payment processing with OAuth 2.0 authentication
 */
class PayPalService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for access tokens
   */
  #cacheService;

  /**
   * @private
   * @type {ExternalApiService}
   * @description External API service for HTTP requests
   */
  #apiService;

  /**
   * @private
   * @type {Object}
   * @description Axios instance for PayPal API
   */
  #httpClient;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    environment: 'sandbox',
    maxRetries: 3,
    timeout: 30000,
    apiVersion: 'v2',
    tokenCacheTTL: 28800, // 8 hours
    webhookVerificationTTL: 172800 // 48 hours
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description PayPal API endpoints
   */
  static #ENDPOINTS = {
    sandbox: 'https://api-m.sandbox.paypal.com',
    production: 'https://api-m.paypal.com'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Payment status mappings
   */
  static #PAYMENT_STATUS = {
    CREATED: 'created',
    SAVED: 'saved',
    APPROVED: 'approved',
    VOIDED: 'voided',
    COMPLETED: 'completed',
    PAYER_ACTION_REQUIRED: 'payer_action_required'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Refund status mappings
   */
  static #REFUND_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed'
  };

  /**
   * Creates a new PayPalService instance
   * @param {Object} config - Service configuration
   * @param {string} config.clientId - PayPal client ID
   * @param {string} config.clientSecret - PayPal client secret
   * @param {string} [config.environment='sandbox'] - Environment (sandbox/production)
   * @param {string} [config.webhookId] - Webhook ID for verification
   * @param {number} [config.maxRetries] - Maximum retry attempts
   * @param {number} [config.timeout] - Request timeout in milliseconds
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {ExternalApiService} [apiService] - External API service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, apiService) {
    try {
      if (!config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'PayPal client ID and secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'PayPalService' }
        );
      }

      this.#config = {
        ...PayPalService.#DEFAULT_CONFIG,
        ...config
      };

      this.#cacheService = cacheService || new CacheService();
      this.#apiService = apiService || new ExternalApiService();

      const baseURL = PayPalService.#ENDPOINTS[this.#config.environment];
      this.#httpClient = axios.create({
        baseURL,
        timeout: this.#config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'PayPal-Request-Id': this.#generateRequestId()
        }
      });

      // Add request/response interceptors
      this.#setupInterceptors();

      logger.info('PayPalService initialized', {
        environment: this.#config.environment,
        hasWebhookId: !!this.#config.webhookId
      });
    } catch (error) {
      logger.error('PayPalService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize PayPal service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Initiates a payment order
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Amount in currency unit
   * @param {string} paymentData.currency - Three-letter ISO currency code
   * @param {string} [paymentData.description] - Purchase description
   * @param {string} [paymentData.customId] - Custom reference ID
   * @param {string} [paymentData.invoiceId] - Invoice ID
   * @param {Object} [paymentData.items] - Line items
   * @param {Object} [paymentData.shipping] - Shipping information
   * @param {string} [paymentData.returnUrl] - Return URL after approval
   * @param {string} [paymentData.cancelUrl] - Cancel URL
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Created order response
   * @throws {AppError} If payment initiation fails
   */
  async initiatePayment(paymentData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Initiating PayPal payment', {
        correlationId,
        amount: paymentData.amount,
        currency: paymentData.currency
      });

      // Validate payment data
      this.#validatePaymentData(paymentData);

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Create order payload
      const orderPayload = this.#buildOrderPayload(paymentData, correlationId);

      // Create order
      const response = await this.#httpClient.post('/v2/checkout/orders', orderPayload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'PayPal-Request-Id': correlationId
        }
      });

      logger.info('Payment order created successfully', {
        correlationId,
        orderId: response.data.id,
        status: response.data.status
      });

      return this.#sanitizeOrderResponse(response.data);

    } catch (error) {
      logger.error('Payment initiation failed', {
        correlationId,
        error: error.message,
        response: error.response?.data
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Captures an approved payment order
   * @param {string} orderId - PayPal order ID
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Captured order response
   * @throws {AppError} If capture fails
   */
  async capturePayment(orderId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Capturing PayPal payment', {
        correlationId,
        orderId
      });

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Capture order
      const response = await this.#httpClient.post(
        `/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': correlationId
          }
        }
      );

      logger.info('Payment captured successfully', {
        correlationId,
        orderId: response.data.id,
        status: response.data.status
      });

      return this.#sanitizeCaptureResponse(response.data);

    } catch (error) {
      logger.error('Payment capture failed', {
        correlationId,
        orderId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Processes a refund for a captured payment
   * @param {Object} refundData - Refund information
   * @param {string} refundData.captureId - Capture ID from captured payment
   * @param {number} [refundData.amount] - Amount to refund (defaults to full)
   * @param {string} [refundData.currency] - Currency code (required if amount specified)
   * @param {string} [refundData.reason] - Refund reason
   * @param {string} [refundData.invoiceId] - Invoice ID
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Refund response
   * @throws {AppError} If refund fails
   */
  async refundPayment(refundData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Processing PayPal refund', {
        correlationId,
        captureId: refundData.captureId,
        amount: refundData.amount
      });

      // Validate refund data
      if (!refundData.captureId) {
        throw new AppError(
          'Capture ID is required for refund',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { field: 'captureId' }
        );
      }

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Build refund payload
      const refundPayload = {};
      if (refundData.amount) {
        refundPayload.amount = {
          value: refundData.amount.toFixed(2),
          currency_code: refundData.currency
        };
      }
      if (refundData.invoiceId) {
        refundPayload.invoice_id = refundData.invoiceId;
      }
      if (refundData.reason) {
        refundPayload.note_to_payer = refundData.reason;
      }

      // Process refund
      const response = await this.#httpClient.post(
        `/v2/payments/captures/${refundData.captureId}/refund`,
        refundPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': correlationId
          }
        }
      );

      logger.info('Refund processed successfully', {
        correlationId,
        refundId: response.data.id,
        status: response.data.status
      });

      return this.#sanitizeRefundResponse(response.data);

    } catch (error) {
      logger.error('Refund processing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Retrieves payment order status and details
   * @param {string} orderId - PayPal order ID
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Order status and details
   * @throws {AppError} If retrieval fails
   */
  async getPaymentStatus(orderId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `paypal:order:${orderId}`;
      const cached = await this.#cacheService.get(cacheKey);

      if (cached && options.useCache !== false) {
        logger.debug('Payment status retrieved from cache', { correlationId, orderId });
        return cached;
      }

      logger.info('Retrieving payment status', { correlationId, orderId });

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Get order details
      const response = await this.#httpClient.get(`/v2/checkout/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const status = this.#mapPaymentStatus(response.data);

      // Cache the result
      await this.#cacheService.set(cacheKey, status, 300); // 5 minutes

      return status;

    } catch (error) {
      logger.error('Payment status retrieval failed', {
        correlationId,
        orderId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Creates a billing agreement for recurring payments
   * @param {Object} agreementData - Agreement information
   * @param {string} agreementData.planId - Billing plan ID
   * @param {Object} agreementData.payer - Payer information
   * @param {Date} [agreementData.startDate] - Agreement start date
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Billing agreement response
   * @throws {AppError} If agreement creation fails
   */
  async createBillingAgreement(agreementData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating billing agreement', {
        correlationId,
        planId: agreementData.planId
      });

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Build agreement payload
      const agreementPayload = {
        plan_id: agreementData.planId,
        payer: agreementData.payer,
        start_date: agreementData.startDate || new Date(Date.now() + 86400000).toISOString()
      };

      // Create agreement
      const response = await this.#httpClient.post(
        '/v1/billing/subscriptions',
        agreementPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': correlationId
          }
        }
      );

      logger.info('Billing agreement created successfully', {
        correlationId,
        agreementId: response.data.id,
        status: response.data.status
      });

      return this.#sanitizeAgreementResponse(response.data);

    } catch (error) {
      logger.error('Billing agreement creation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Cancels a billing agreement
   * @param {string} agreementId - Agreement ID
   * @param {Object} [options] - Cancellation options
   * @param {string} [options.reason] - Cancellation reason
   * @returns {Promise<Object>} Cancellation response
   * @throws {AppError} If cancellation fails
   */
  async cancelBillingAgreement(agreementId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Canceling billing agreement', {
        correlationId,
        agreementId,
        reason: options.reason
      });

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Cancel agreement
      const response = await this.#httpClient.post(
        `/v1/billing/subscriptions/${agreementId}/cancel`,
        { reason: options.reason || 'Customer requested cancellation' },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': correlationId
          }
        }
      );

      logger.info('Billing agreement canceled successfully', {
        correlationId,
        agreementId
      });

      return { success: true, agreementId };

    } catch (error) {
      logger.error('Billing agreement cancellation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * Verifies webhook notification
   * @param {Object} headers - Webhook headers
   * @param {string} body - Raw webhook body
   * @param {string} webhookId - Webhook ID
   * @returns {Promise<Object>} Verification result
   * @throws {AppError} If verification fails
   */
  async verifyWebhook(headers, body, webhookId) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Verifying PayPal webhook', { correlationId, webhookId });

      // Get access token
      const accessToken = await this.#getAccessToken(correlationId);

      // Build verification payload
      const verificationPayload = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId || this.#config.webhookId,
        webhook_event: JSON.parse(body)
      };

      // Verify webhook
      const response = await this.#httpClient.post(
        '/v1/notifications/verify-webhook-signature',
        verificationPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const isValid = response.data.verification_status === 'SUCCESS';

      logger.info('Webhook verification completed', {
        correlationId,
        isValid,
        eventType: verificationPayload.webhook_event.event_type
      });

      return {
        verified: isValid,
        event: isValid ? verificationPayload.webhook_event : null
      };

    } catch (error) {
      logger.error('Webhook verification failed', {
        correlationId,
        error: error.message
      });

      throw this.#handlePayPalError(error, correlationId);
    }
  }

  /**
   * @private
   * Gets or refreshes access token
   */
  async #getAccessToken(correlationId) {
    try {
      // Check cache for existing token
      const cacheKey = `paypal:token:${this.#config.environment}`;
      const cached = await this.#cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Using cached PayPal access token', { correlationId });
        return cached;
      }

      logger.info('Obtaining new PayPal access token', { correlationId });

      // Request new token
      const auth = Buffer.from(`${this.#config.clientId}:${this.#config.clientSecret}`).toString('base64');
      
      const response = await this.#httpClient.post(
        '/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, expires_in } = response.data;

      // Cache token (with buffer before expiration)
      const ttl = Math.max(expires_in - 300, 60); // At least 1 minute
      await this.#cacheService.set(cacheKey, access_token, ttl);

      return access_token;

    } catch (error) {
      logger.error('Failed to obtain PayPal access token', {
        correlationId,
        error: error.message
      });

      throw new AppError(
        'PayPal authentication failed',
        401,
        ERROR_CODES.AUTHENTICATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Sets up HTTP client interceptors
   */
  #setupInterceptors() {
    // Request interceptor
    this.#httpClient.interceptors.request.use(
      (config) => {
        logger.debug('PayPal API request', {
          method: config.method,
          url: config.url,
          headers: {
            ...config.headers,
            Authorization: config.headers.Authorization ? '[REDACTED]' : undefined
          }
        });
        return config;
      },
      (error) => {
        logger.error('PayPal request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor with retry logic
    this.#httpClient.interceptors.response.use(
      (response) => {
        logger.debug('PayPal API response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      async (error) => {
        const { config, response } = error;
        const retryCount = config._retryCount || 0;

        // Retry logic for specific errors
        if (retryCount < this.#config.maxRetries) {
          const shouldRetry = !response || 
            response.status === 429 || 
            response.status >= 500;

          if (shouldRetry) {
            config._retryCount = retryCount + 1;
            
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            logger.warn(`Retrying PayPal request (${config._retryCount}/${this.#config.maxRetries})`, {
              url: config.url,
              status: response?.status,
              delay
            });

            await new Promise(resolve => setTimeout(resolve, delay));
            return this.#httpClient(config);
          }
        }

        return Promise.reject(error);
      }
    );
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
   * Builds order payload
   */
  #buildOrderPayload(paymentData, correlationId) {
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: paymentData.customId || correlationId,
        amount: {
          currency_code: paymentData.currency.toUpperCase(),
          value: paymentData.amount.toFixed(2)
        }
      }]
    };

    if (paymentData.description) {
      payload.purchase_units[0].description = paymentData.description;
    }

    if (paymentData.invoiceId) {
      payload.purchase_units[0].invoice_id = paymentData.invoiceId;
    }

    if (paymentData.items && paymentData.items.length > 0) {
      payload.purchase_units[0].items = paymentData.items.map(item => ({
        name: item.name,
        quantity: item.quantity.toString(),
        unit_amount: {
          currency_code: paymentData.currency.toUpperCase(),
          value: item.price.toFixed(2)
        }
      }));
    }

    if (paymentData.shipping) {
      payload.purchase_units[0].shipping = {
        name: {
          full_name: paymentData.shipping.name
        },
        address: {
          address_line_1: paymentData.shipping.address1,
          address_line_2: paymentData.shipping.address2,
          admin_area_2: paymentData.shipping.city,
          admin_area_1: paymentData.shipping.state,
          postal_code: paymentData.shipping.postalCode,
          country_code: paymentData.shipping.countryCode
        }
      };
    }

    if (paymentData.returnUrl && paymentData.cancelUrl) {
      payload.application_context = {
        return_url: paymentData.returnUrl,
        cancel_url: paymentData.cancelUrl,
        shipping_preference: paymentData.shipping ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
        user_action: 'PAY_NOW'
      };
    }

    return payload;
  }

  /**
   * @private
   * Maps PayPal order status to internal format
   */
  #mapPaymentStatus(order) {
    const statusMap = {
      'CREATED': PayPalService.#PAYMENT_STATUS.CREATED,
      'SAVED': PayPalService.#PAYMENT_STATUS.SAVED,
      'APPROVED': PayPalService.#PAYMENT_STATUS.APPROVED,
      'VOIDED': PayPalService.#PAYMENT_STATUS.VOIDED,
      'COMPLETED': PayPalService.#PAYMENT_STATUS.COMPLETED,
      'PAYER_ACTION_REQUIRED': PayPalService.#PAYMENT_STATUS.PAYER_ACTION_REQUIRED
    };

    return {
      id: order.id,
      status: statusMap[order.status] || order.status,
      amount: order.purchase_units[0].amount.value,
      currency: order.purchase_units[0].amount.currency_code,
      created: order.create_time,
      updated: order.update_time,
      links: order.links,
      payer: order.payer
    };
  }

  /**
   * @private
   * Sanitizes order response
   */
  #sanitizeOrderResponse(order) {
    return {
      id: order.id,
      status: order.status,
      amount: order.purchase_units[0].amount.value,
      currency: order.purchase_units[0].amount.currency_code,
      created: order.create_time,
      links: {
        approve: order.links.find(link => link.rel === 'approve')?.href,
        self: order.links.find(link => link.rel === 'self')?.href
      }
    };
  }

  /**
   * @private
   * Sanitizes capture response
   */
  #sanitizeCaptureResponse(order) {
    const capture = order.purchase_units[0].payments.captures[0];
    
    return {
      id: order.id,
      status: order.status,
      captureId: capture.id,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
      finalCapture: capture.final_capture,
      created: capture.create_time,
      payer: {
        id: order.payer.payer_id,
        email: order.payer.email_address,
        name: order.payer.name
      }
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
      amount: refund.amount.value,
      currency: refund.amount.currency_code,
      created: refund.create_time,
      updated: refund.update_time,
      invoiceId: refund.invoice_id,
      reason: refund.note_to_payer
    };
  }

  /**
   * @private
   * Sanitizes agreement response
   */
  #sanitizeAgreementResponse(agreement) {
    return {
      id: agreement.id,
      status: agreement.status,
      planId: agreement.plan_id,
      startDate: agreement.start_time,
      subscriber: {
        id: agreement.subscriber.payer_id,
        email: agreement.subscriber.email_address,
        name: agreement.subscriber.name
      },
      links: {
        approve: agreement.links.find(link => link.rel === 'approve')?.href,
        self: agreement.links.find(link => link.rel === 'self')?.href
      }
    };
  }

  /**
   * @private
   * Handles PayPal errors
   */
  #handlePayPalError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const response = error.response?.data;
    const status = error.response?.status;

    // Map common PayPal errors
    if (response?.name === 'INVALID_RESOURCE_ID') {
      return new AppError(
        'Invalid PayPal resource ID',
        404,
        ERROR_CODES.NOT_FOUND,
        { correlationId, resource: response.details }
      );
    }

    if (response?.name === 'PERMISSION_DENIED') {
      return new AppError(
        'PayPal permission denied',
        403,
        ERROR_CODES.FORBIDDEN,
        { correlationId }
      );
    }

    if (response?.name === 'RATE_LIMIT_REACHED') {
      return new AppError(
        'PayPal rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR,
        { correlationId }
      );
    }

    if (status === 401) {
      return new AppError(
        'PayPal authentication failed',
        401,
        ERROR_CODES.AUTHENTICATION_ERROR,
        { correlationId }
      );
    }

    // Default error
    return new AppError(
      response?.message || 'PayPal payment processing error',
      status || 500,
      ERROR_CODES.PAYMENT_ERROR,
      {
        correlationId,
        paypalError: response?.name,
        details: response?.details,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates request ID
   */
  #generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Attempt to get access token as health check
      const correlationId = this.#generateCorrelationId();
      await this.#getAccessToken(correlationId);
      
      return {
        healthy: true,
        service: 'PayPalService',
        environment: this.#config.environment
      };
    } catch (error) {
      logger.error('PayPal health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'PayPalService',
        environment: this.#config.environment,
        error: error.message
      };
    }
  }
}

module.exports = PayPalService;