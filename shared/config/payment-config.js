'use strict';

/**
 * @fileoverview Payment configuration for various payment providers
 * @module shared/config/payment-config
 */

const { parseBoolean, parseNumber, parseArray, parseJSON } = require('./base-config').helpers;

// Payment configuration object
const paymentConfig = {
  // Payment service configuration
  enabled: parseBoolean(process.env.PAYMENT_ENABLED, true),
  provider: process.env.PAYMENT_PROVIDER || 'stripe', // stripe, paypal, square
  currency: process.env.PAYMENT_CURRENCY || 'USD',
  supportedCurrencies: parseArray(process.env.PAYMENT_SUPPORTED_CURRENCIES, ['USD', 'EUR', 'GBP']),
  
  // Provider configurations
  providers: {
    stripe: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
      maxNetworkRetries: parseNumber(process.env.STRIPE_MAX_RETRIES, 3),
      timeout: parseNumber(process.env.STRIPE_TIMEOUT, 80000),
      telemetry: parseBoolean(process.env.STRIPE_TELEMETRY, true),
      appInfo: {
        name: 'InsightSerenity Platform',
        version: process.env.APP_VERSION || '1.0.0',
        url: 'https://insightserenity.com'
      },
      // Stripe-specific features
      paymentMethods: parseArray(process.env.STRIPE_PAYMENT_METHODS, [
        'card',
        'sepa_debit',
        'ach_credit_transfer',
        'ideal',
        'bancontact'
      ]),
      statementDescriptor: process.env.STRIPE_STATEMENT_DESCRIPTOR || 'INSIGHTSERENITY',
      captureMethod: process.env.STRIPE_CAPTURE_METHOD || 'automatic', // automatic, manual
      confirmationMethod: process.env.STRIPE_CONFIRMATION_METHOD || 'automatic',
      setupFutureUsage: process.env.STRIPE_SETUP_FUTURE_USAGE || 'off_session'
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      mode: process.env.PAYPAL_MODE || 'sandbox', // sandbox, live
      webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
      apiUrl: process.env.PAYPAL_API_URL || 'https://api.sandbox.paypal.com',
      returnUrl: process.env.PAYPAL_RETURN_URL || '/payment/paypal/success',
      cancelUrl: process.env.PAYPAL_CANCEL_URL || '/payment/paypal/cancel',
      brandName: process.env.PAYPAL_BRAND_NAME || 'InsightSerenity',
      landingPage: process.env.PAYPAL_LANDING_PAGE || 'LOGIN', // LOGIN, BILLING, NO_PREFERENCE
      shippingPreference: process.env.PAYPAL_SHIPPING_PREFERENCE || 'NO_SHIPPING',
      userAction: process.env.PAYPAL_USER_ACTION || 'PAY_NOW' // PAY_NOW, CONTINUE
    },
    square: {
      accessToken: process.env.SQUARE_ACCESS_TOKEN || '',
      applicationId: process.env.SQUARE_APPLICATION_ID || '',
      locationId: process.env.SQUARE_LOCATION_ID || '',
      environment: process.env.SQUARE_ENVIRONMENT || 'sandbox', // sandbox, production
      webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE || ''
    }
  },

  // Subscription configuration
  subscriptions: {
    enabled: parseBoolean(process.env.SUBSCRIPTIONS_ENABLED, true),
    trialPeriodDays: parseNumber(process.env.TRIAL_PERIOD_DAYS, 14),
    allowTrialExtension: parseBoolean(process.env.ALLOW_TRIAL_EXTENSION, false),
    gracePeriodDays: parseNumber(process.env.GRACE_PERIOD_DAYS, 7),
    autoCharge: parseBoolean(process.env.AUTO_CHARGE_SUBSCRIPTIONS, true),
    prorateUpgrades: parseBoolean(process.env.PRORATE_UPGRADES, true),
    prorateDowngrades: parseBoolean(process.env.PRORATE_DOWNGRADES, false),
    cancelAtPeriodEnd: parseBoolean(process.env.CANCEL_AT_PERIOD_END, true),
    allowPause: parseBoolean(process.env.ALLOW_SUBSCRIPTION_PAUSE, true),
    maxPauseDays: parseNumber(process.env.MAX_PAUSE_DAYS, 90)
  },

  // Pricing plans
  plans: {
    default: process.env.DEFAULT_PLAN || 'starter',
    allowCustomPlans: parseBoolean(process.env.ALLOW_CUSTOM_PLANS, true),
    types: parseJSON(process.env.PLAN_TYPES, {
      starter: {
        name: 'Starter',
        price: 49,
        interval: 'month',
        features: ['basic_features', 'email_support'],
        limits: {
          users: 5,
          projects: 10,
          storage: '10GB'
        }
      },
      professional: {
        name: 'Professional',
        price: 149,
        interval: 'month',
        features: ['all_features', 'priority_support', 'api_access'],
        limits: {
          users: 25,
          projects: 50,
          storage: '100GB'
        }
      },
      enterprise: {
        name: 'Enterprise',
        price: 499,
        interval: 'month',
        features: ['all_features', 'dedicated_support', 'custom_integrations', 'sla'],
        limits: {
          users: -1, // unlimited
          projects: -1,
          storage: '1TB'
        }
      }
    })
  },

  // Invoice configuration
  invoices: {
    enabled: parseBoolean(process.env.INVOICES_ENABLED, true),
    autoGenerate: parseBoolean(process.env.AUTO_GENERATE_INVOICES, true),
    prefix: process.env.INVOICE_PREFIX || 'INV',
    startingNumber: parseNumber(process.env.INVOICE_STARTING_NUMBER, 1000),
    dueDays: parseNumber(process.env.INVOICE_DUE_DAYS, 30),
    logo: process.env.INVOICE_LOGO || '/assets/logo.png',
    footer: process.env.INVOICE_FOOTER || 'Thank you for your business!',
    notes: process.env.INVOICE_NOTES || '',
    termsAndConditions: process.env.INVOICE_TERMS || '',
    companyDetails: parseJSON(process.env.INVOICE_COMPANY_DETAILS, {
      name: 'InsightSerenity Inc.',
      address: '123 Business St, Suite 100',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'USA',
      taxId: 'XX-XXXXXXX'
    })
  },

  // Tax configuration
  tax: {
    enabled: parseBoolean(process.env.TAX_ENABLED, true),
    autoCalculate: parseBoolean(process.env.TAX_AUTO_CALCULATE, true),
    inclusive: parseBoolean(process.env.TAX_INCLUSIVE, false),
    defaultRate: parseNumber(process.env.TAX_DEFAULT_RATE, 0),
    vatEnabled: parseBoolean(process.env.VAT_ENABLED, false),
    vatRate: parseNumber(process.env.VAT_RATE, 20),
    vatNumberRequired: parseBoolean(process.env.VAT_NUMBER_REQUIRED, false),
    taxIdRequired: parseBoolean(process.env.TAX_ID_REQUIRED, false),
    provider: process.env.TAX_PROVIDER || 'internal', // internal, taxjar, avalara
    exemptCategories: parseArray(process.env.TAX_EXEMPT_CATEGORIES, ['nonprofit', 'government'])
  },

  // Payment methods configuration
  paymentMethods: {
    card: {
      enabled: parseBoolean(process.env.PAYMENT_CARD_ENABLED, true),
      saveByDefault: parseBoolean(process.env.CARD_SAVE_BY_DEFAULT, true),
      requireCvc: parseBoolean(process.env.CARD_REQUIRE_CVC, true),
      allowedBrands: parseArray(process.env.CARD_ALLOWED_BRANDS, [
        'visa',
        'mastercard',
        'amex',
        'discover'
      ])
    },
    bankTransfer: {
      enabled: parseBoolean(process.env.PAYMENT_BANK_ENABLED, false),
      verificationRequired: parseBoolean(process.env.BANK_VERIFICATION_REQUIRED, true),
      microDeposits: parseBoolean(process.env.BANK_MICRO_DEPOSITS, true)
    },
    wallet: {
      enabled: parseBoolean(process.env.PAYMENT_WALLET_ENABLED, true),
      applePay: parseBoolean(process.env.WALLET_APPLE_PAY, true),
      googlePay: parseBoolean(process.env.WALLET_GOOGLE_PAY, true),
      paypal: parseBoolean(process.env.WALLET_PAYPAL, true)
    }
  },

  // Webhook configuration
  webhooks: {
    enabled: parseBoolean(process.env.PAYMENT_WEBHOOKS_ENABLED, true),
    endpoint: process.env.PAYMENT_WEBHOOK_ENDPOINT || '/webhooks/payment',
    timeout: parseNumber(process.env.PAYMENT_WEBHOOK_TIMEOUT, 30000),
    retries: parseNumber(process.env.PAYMENT_WEBHOOK_RETRIES, 3),
    events: parseArray(process.env.PAYMENT_WEBHOOK_EVENTS, [
      'payment_intent.succeeded',
      'payment_intent.failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed'
    ])
  },

  // Security and compliance
  security: {
    pciCompliant: parseBoolean(process.env.PCI_COMPLIANT, true),
    tokenization: parseBoolean(process.env.PAYMENT_TOKENIZATION, true),
    encryption: parseBoolean(process.env.PAYMENT_ENCRYPTION, true),
    fraudDetection: parseBoolean(process.env.FRAUD_DETECTION, true),
    threeDSecure: parseBoolean(process.env.THREE_D_SECURE, true),
    requireBillingAddress: parseBoolean(process.env.REQUIRE_BILLING_ADDRESS, true),
    ipWhitelist: parseArray(process.env.PAYMENT_IP_WHITELIST, []),
    testCardsAllowed: parseBoolean(process.env.TEST_CARDS_ALLOWED, process.env.NODE_ENV !== 'production')
  },

  // Refund configuration
  refunds: {
    enabled: parseBoolean(process.env.REFUNDS_ENABLED, true),
    autoApprove: parseBoolean(process.env.REFUNDS_AUTO_APPROVE, false),
    maxDays: parseNumber(process.env.REFUND_MAX_DAYS, 30),
    reasons: parseArray(process.env.REFUND_REASONS, [
      'duplicate',
      'fraudulent',
      'requested_by_customer',
      'product_not_received',
      'product_unacceptable',
      'other'
    ]),
    requireReason: parseBoolean(process.env.REFUND_REQUIRE_REASON, true),
    partialAllowed: parseBoolean(process.env.PARTIAL_REFUNDS_ALLOWED, true)
  },

  // Retry configuration
  retry: {
    enabled: parseBoolean(process.env.PAYMENT_RETRY_ENABLED, true),
    maxAttempts: parseNumber(process.env.PAYMENT_RETRY_MAX_ATTEMPTS, 4),
    intervals: parseArray(process.env.PAYMENT_RETRY_INTERVALS, [1, 3, 5, 7]), // days
    smartRetry: parseBoolean(process.env.PAYMENT_SMART_RETRY, true),
    notifyCustomer: parseBoolean(process.env.PAYMENT_RETRY_NOTIFY, true)
  },

  // Multi-tenant payment configuration
  multiTenant: {
    enabled: parseBoolean(process.env.PAYMENT_MULTI_TENANT_ENABLED, true),
    separateAccounts: parseBoolean(process.env.PAYMENT_SEPARATE_ACCOUNTS, false),
    platformFee: parseNumber(process.env.PLATFORM_FEE_PERCENTAGE, 2.5),
    allowCustomProviders: parseBoolean(process.env.ALLOW_CUSTOM_PAYMENT_PROVIDERS, false),
    reconciliation: parseBoolean(process.env.PAYMENT_RECONCILIATION, true)
  },

  // Reporting and analytics
  reporting: {
    enabled: parseBoolean(process.env.PAYMENT_REPORTING_ENABLED, true),
    realtimeMetrics: parseBoolean(process.env.PAYMENT_REALTIME_METRICS, true),
    exportEnabled: parseBoolean(process.env.PAYMENT_EXPORT_ENABLED, true),
    exportFormats: parseArray(process.env.PAYMENT_EXPORT_FORMATS, ['csv', 'xlsx', 'pdf']),
    retentionDays: parseNumber(process.env.PAYMENT_DATA_RETENTION_DAYS, 2555) // 7 years
  }
};

// Validate payment configuration
const validatePaymentConfig = (config) => {
  const errors = [];

  if (!config.enabled) {
    return true; // Skip validation if payments are disabled
  }

  // Validate provider
  const validProviders = ['stripe', 'paypal', 'square'];
  if (!validProviders.includes(config.provider)) {
    errors.push(`Invalid payment provider: ${config.provider}`);
  }

  // Validate currency
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY'];
  if (!validCurrencies.includes(config.currency)) {
    errors.push(`Invalid default currency: ${config.currency}`);
  }

  // Provider-specific validations
  switch (config.provider) {
    case 'stripe':
      if (!config.providers.stripe.publishableKey || !config.providers.stripe.secretKey) {
        errors.push('Stripe publishable and secret keys are required');
      }
      if (config.webhooks.enabled && !config.providers.stripe.webhookSecret) {
        errors.push('Stripe webhook secret is required when webhooks are enabled');
      }
      break;
    case 'paypal':
      if (!config.providers.paypal.clientId || !config.providers.paypal.clientSecret) {
        errors.push('PayPal client ID and secret are required');
      }
      const validModes = ['sandbox', 'live'];
      if (!validModes.includes(config.providers.paypal.mode)) {
        errors.push(`Invalid PayPal mode: ${config.providers.paypal.mode}`);
      }
      break;
    case 'square':
      if (!config.providers.square.accessToken || !config.providers.square.applicationId) {
        errors.push('Square access token and application ID are required');
      }
      break;
  }

  // Validate subscription settings
  if (config.subscriptions.enabled) {
    if (config.subscriptions.gracePeriodDays > 30) {
      errors.push('Grace period should not exceed 30 days');
    }
    if (config.subscriptions.maxPauseDays > 365) {
      errors.push('Maximum pause duration should not exceed 365 days');
    }
  }

  // Validate tax settings
  if (config.tax.enabled && config.tax.defaultRate > 100) {
    errors.push('Tax rate cannot exceed 100%');
  }

  // Validate retry intervals
  if (config.retry.enabled && config.retry.intervals.length !== config.retry.maxAttempts) {
    errors.push('Number of retry intervals must match max attempts');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (config.security.testCardsAllowed) {
      errors.push('Test cards should be disabled in production');
    }
    if (config.provider === 'paypal' && config.providers.paypal.mode !== 'live') {
      errors.push('PayPal must be in live mode for production');
    }
    if (config.provider === 'square' && config.providers.square.environment !== 'production') {
      errors.push('Square must be in production environment');
    }
    if (!config.security.pciCompliant) {
      errors.push('PCI compliance must be enabled in production');
    }
    if (!config.security.fraudDetection) {
      errors.push('Fraud detection should be enabled in production');
    }
  }

  // if (errors.length > 0) {
  //   throw new Error('Payment configuration validation failed:\n' + errors.join('\n'));
  // }

  return true;
};

// Validate the configuration
validatePaymentConfig(paymentConfig);

// Export configuration
module.exports = paymentConfig;