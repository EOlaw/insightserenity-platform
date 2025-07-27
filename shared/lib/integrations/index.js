'use strict';

/**
 * @fileoverview Integration services module index
 * @module shared/lib/integrations
 * @description Central export point for all third-party integration services
 * Provides unified access to payment, email, storage, and social platform integrations
 */

const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const { ERROR_CODES } = require('../utils/constants/error-codes');

// Email Services
const SendGridService = require('./email/sendgrid-service');
const MailgunService = require('./email/mailgun-service');
const SESService = require('./email/ses-service');

// Payment Services
const StripeService = require('./payment/stripe-service');
const PayPalService = require('./payment/paypal-service');
const PaymentProcessor = require('./payment/payment-processor');

// Storage Services
const S3Service = require('./storage/aws-s3-service');
const AzureBlobService = require('./storage/azure-blob-service');
const GCPStorageService = require('./storage/gcp-storage-service');

// Social APIs
const LinkedInAPI = require('./social/linkedin-api');
const GitHubAPI = require('./social/github-api');
const GoogleAPI = require('./social/google-api');

/**
 * @class IntegrationManager
 * @description Manages and provides access to all integration services
 * Implements factory pattern for service instantiation with configuration validation
 */
class IntegrationManager {
  /**
   * @private
   * @type {Object}
   * @description Singleton instances of integration services
   */
  #services;

  /**
   * @private
   * @type {Object}
   * @description Service configurations
   */
  #config;

  /**
   * @private
   * @type {Object}
   * @description Shared service dependencies
   */
  #dependencies;

  /**
   * @private
   * @static
   * @type {IntegrationManager}
   * @description Singleton instance
   */
  static #instance;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Service type mappings
   */
  static #SERVICE_TYPES = {
    EMAIL: {
      SENDGRID: 'sendgrid',
      MAILGUN: 'mailgun',
      SES: 'ses'
    },
    PAYMENT: {
      STRIPE: 'stripe',
      PAYPAL: 'paypal'
    },
    STORAGE: {
      S3: 's3',
      AZURE: 'azure',
      GCP: 'gcp'
    },
    SOCIAL: {
      LINKEDIN: 'linkedin',
      GITHUB: 'github',
      GOOGLE: 'google'
    }
  };

  /**
   * Creates a new IntegrationManager instance
   * @param {Object} config - Global configuration for all services
   * @param {Object} dependencies - Shared dependencies
   * @private
   */
  constructor(config = {}, dependencies = {}) {
    this.#services = {
      email: {},
      payment: {},
      storage: {},
      social: {}
    };
    this.#config = config;
    this.#dependencies = dependencies;

    logger.info('IntegrationManager initialized');
  }

  /**
   * Gets singleton instance of IntegrationManager
   * @param {Object} [config] - Configuration object
   * @param {Object} [dependencies] - Dependencies object
   * @returns {IntegrationManager} Singleton instance
   */
  static getInstance(config, dependencies) {
    if (!IntegrationManager.#instance) {
      IntegrationManager.#instance = new IntegrationManager(config, dependencies);
    }
    return IntegrationManager.#instance;
  }

  /**
   * Gets or creates an email service instance
   * @param {string} provider - Email provider (sendgrid, mailgun, ses)
   * @param {Object} [config] - Provider-specific configuration
   * @returns {Object} Email service instance
   * @throws {AppError} If provider is invalid or configuration fails
   */
  getEmailService(provider, config) {
    const normalizedProvider = provider?.toLowerCase();

    if (!Object.values(IntegrationManager.#SERVICE_TYPES.EMAIL).includes(normalizedProvider)) {
      throw new AppError(
        'Invalid email provider',
        400,
        ERROR_CODES.INVALID_INPUT,
        { 
          provider, 
          validProviders: Object.values(IntegrationManager.#SERVICE_TYPES.EMAIL) 
        }
      );
    }

    // Return existing instance if available
    if (this.#services.email[normalizedProvider]) {
      return this.#services.email[normalizedProvider];
    }

    // Create new instance
    const serviceConfig = {
      ...this.#config.email?.[normalizedProvider],
      ...config
    };

    try {
      let service;

      switch (normalizedProvider) {
        case IntegrationManager.#SERVICE_TYPES.EMAIL.SENDGRID:
          service = new SendGridService(
            serviceConfig,
            this.#dependencies.cacheService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.EMAIL.MAILGUN:
          service = new MailgunService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.apiService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.EMAIL.SES:
          service = new SESService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;
      }

      this.#services.email[normalizedProvider] = service;

      logger.info(`Email service initialized: ${normalizedProvider}`);
      return service;

    } catch (error) {
      logger.error(`Failed to initialize email service: ${normalizedProvider}`, error);
      throw error;
    }
  }

  /**
   * Gets or creates a payment service instance
   * @param {string} provider - Payment provider (stripe, paypal)
   * @param {Object} [config] - Provider-specific configuration
   * @returns {Object} Payment service instance
   * @throws {AppError} If provider is invalid or configuration fails
   */
  getPaymentService(provider, config) {
    const normalizedProvider = provider?.toLowerCase();

    if (!Object.values(IntegrationManager.#SERVICE_TYPES.PAYMENT).includes(normalizedProvider)) {
      throw new AppError(
        'Invalid payment provider',
        400,
        ERROR_CODES.INVALID_INPUT,
        { 
          provider, 
          validProviders: Object.values(IntegrationManager.#SERVICE_TYPES.PAYMENT) 
        }
      );
    }

    // Return existing instance if available
    if (this.#services.payment[normalizedProvider]) {
      return this.#services.payment[normalizedProvider];
    }

    // Create new instance
    const serviceConfig = {
      ...this.#config.payment?.[normalizedProvider],
      ...config
    };

    try {
      let service;

      switch (normalizedProvider) {
        case IntegrationManager.#SERVICE_TYPES.PAYMENT.STRIPE:
          service = new StripeService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.PAYMENT.PAYPAL:
          service = new PayPalService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;
      }

      this.#services.payment[normalizedProvider] = service;

      logger.info(`Payment service initialized: ${normalizedProvider}`);
      return service;

    } catch (error) {
      logger.error(`Failed to initialize payment service: ${normalizedProvider}`, error);
      throw error;
    }
  }

  /**
   * Gets the payment processor that handles multiple providers
   * @param {Object} [config] - Payment processor configuration
   * @returns {PaymentProcessor} Payment processor instance
   */
  getPaymentProcessor(config) {
    if (!this.#services.payment.processor) {
      const processorConfig = {
        ...this.#config.payment?.processor,
        ...config
      };

      this.#services.payment.processor = new PaymentProcessor(
        processorConfig,
        this.#dependencies.cacheService,
        this.#dependencies.encryptionService,
        this.#dependencies.notificationService
      );

      logger.info('Payment processor initialized');
    }

    return this.#services.payment.processor;
  }

  /**
   * Gets or creates a storage service instance
   * @param {string} provider - Storage provider (s3, azure, gcp)
   * @param {Object} [config] - Provider-specific configuration
   * @returns {Object} Storage service instance
   * @throws {AppError} If provider is invalid or configuration fails
   */
  getStorageService(provider, config) {
    const normalizedProvider = provider?.toLowerCase();

    if (!Object.values(IntegrationManager.#SERVICE_TYPES.STORAGE).includes(normalizedProvider)) {
      throw new AppError(
        'Invalid storage provider',
        400,
        ERROR_CODES.INVALID_INPUT,
        { 
          provider, 
          validProviders: Object.values(IntegrationManager.#SERVICE_TYPES.STORAGE) 
        }
      );
    }

    // Return existing instance if available
    if (this.#services.storage[normalizedProvider]) {
      return this.#services.storage[normalizedProvider];
    }

    // Create new instance
    const serviceConfig = {
      ...this.#config.storage?.[normalizedProvider],
      ...config
    };

    try {
      let service;

      switch (normalizedProvider) {
        case IntegrationManager.#SERVICE_TYPES.STORAGE.S3:
          service = new S3Service(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.STORAGE.AZURE:
          service = new AzureBlobService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.STORAGE.GCP:
          service = new GCPStorageService(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;
      }

      this.#services.storage[normalizedProvider] = service;

      logger.info(`Storage service initialized: ${normalizedProvider}`);
      return service;

    } catch (error) {
      logger.error(`Failed to initialize storage service: ${normalizedProvider}`, error);
      throw error;
    }
  }

  /**
   * Gets or creates a social API service instance
   * @param {string} provider - Social provider (linkedin, github, google)
   * @param {Object} [config] - Provider-specific configuration
   * @returns {Object} Social API service instance
   * @throws {AppError} If provider is invalid or configuration fails
   */
  getSocialService(provider, config) {
    const normalizedProvider = provider?.toLowerCase();

    if (!Object.values(IntegrationManager.#SERVICE_TYPES.SOCIAL).includes(normalizedProvider)) {
      throw new AppError(
        'Invalid social provider',
        400,
        ERROR_CODES.INVALID_INPUT,
        { 
          provider, 
          validProviders: Object.values(IntegrationManager.#SERVICE_TYPES.SOCIAL) 
        }
      );
    }

    // Return existing instance if available
    if (this.#services.social[normalizedProvider]) {
      return this.#services.social[normalizedProvider];
    }

    // Create new instance
    const serviceConfig = {
      ...this.#config.social?.[normalizedProvider],
      ...config
    };

    try {
      let service;

      switch (normalizedProvider) {
        case IntegrationManager.#SERVICE_TYPES.SOCIAL.LINKEDIN:
          service = new LinkedInAPI(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService,
            this.#dependencies.apiService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.SOCIAL.GITHUB:
          service = new GitHubAPI(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService,
            this.#dependencies.webhookService
          );
          break;

        case IntegrationManager.#SERVICE_TYPES.SOCIAL.GOOGLE:
          service = new GoogleAPI(
            serviceConfig,
            this.#dependencies.cacheService,
            this.#dependencies.encryptionService
          );
          break;
      }

      this.#services.social[normalizedProvider] = service;

      logger.info(`Social service initialized: ${normalizedProvider}`);
      return service;

    } catch (error) {
      logger.error(`Failed to initialize social service: ${normalizedProvider}`, error);
      throw error;
    }
  }

  /**
   * Gets all initialized services
   * @returns {Object} All initialized services by category
   */
  getAllServices() {
    return {
      email: { ...this.#services.email },
      payment: { ...this.#services.payment },
      storage: { ...this.#services.storage },
      social: { ...this.#services.social }
    };
  }

  /**
   * Checks health status of all initialized services
   * @returns {Promise<Object>} Health status of all services
   */
  async checkHealth() {
    const healthChecks = {};

    // Check email services
    for (const [provider, service] of Object.entries(this.#services.email)) {
      try {
        healthChecks[`email.${provider}`] = await service.getHealthStatus();
      } catch (error) {
        healthChecks[`email.${provider}`] = {
          healthy: false,
          error: error.message
        };
      }
    }

    // Check payment services
    for (const [provider, service] of Object.entries(this.#services.payment)) {
      if (provider !== 'processor') {
        try {
          healthChecks[`payment.${provider}`] = await service.getHealthStatus();
        } catch (error) {
          healthChecks[`payment.${provider}`] = {
            healthy: false,
            error: error.message
          };
        }
      }
    }

    // Check storage services
    for (const [provider, service] of Object.entries(this.#services.storage)) {
      try {
        healthChecks[`storage.${provider}`] = await service.getHealthStatus();
      } catch (error) {
        healthChecks[`storage.${provider}`] = {
          healthy: false,
          error: error.message
        };
      }
    }

    // Check social services
    for (const [provider, service] of Object.entries(this.#services.social)) {
      try {
        healthChecks[`social.${provider}`] = await service.getHealthStatus();
      } catch (error) {
        healthChecks[`social.${provider}`] = {
          healthy: false,
          error: error.message
        };
      }
    }

    const allHealthy = Object.values(healthChecks).every(check => check.healthy);

    return {
      healthy: allHealthy,
      services: healthChecks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clears all service instances
   * Useful for testing or reconfiguration
   */
  clearServices() {
    this.#services = {
      email: {},
      payment: {},
      storage: {},
      social: {}
    };
    logger.info('All integration services cleared');
  }

  /**
   * Updates configuration for all or specific services
   * @param {Object} newConfig - New configuration
   * @param {boolean} [clearExisting=false] - Clear existing services
   */
  updateConfiguration(newConfig, clearExisting = false) {
    this.#config = {
      ...this.#config,
      ...newConfig
    };

    if (clearExisting) {
      this.clearServices();
    }

    logger.info('Integration configuration updated', {
      clearExisting
    });
  }
}

// Export service classes for direct usage
module.exports = {
  // Manager
  IntegrationManager,

  // Email Services
  SendGridService,
  MailgunService,
  SESService,

  // Payment Services
  StripeService,
  PayPalService,
  PaymentProcessor,

  // Storage Services
  S3Service,
  AzureBlobService,
  GCPStorageService,

  // Social APIs
  LinkedInAPI,
  GitHubAPI,
  GoogleAPI,

  // Service Types
  SERVICE_TYPES: {
    EMAIL: {
      SENDGRID: 'sendgrid',
      MAILGUN: 'mailgun',
      SES: 'ses'
    },
    PAYMENT: {
      STRIPE: 'stripe',
      PAYPAL: 'paypal'
    },
    STORAGE: {
      S3: 's3',
      AZURE: 'azure',
      GCP: 'gcp'
    },
    SOCIAL: {
      LINKEDIN: 'linkedin',
      GITHUB: 'github',
      GOOGLE: 'google'
    }
  },

  // Factory function for quick initialization
  createIntegrationManager: (config, dependencies) => {
    return IntegrationManager.getInstance(config, dependencies);
  }
};