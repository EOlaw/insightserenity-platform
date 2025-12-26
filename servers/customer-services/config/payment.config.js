/**
 * @fileoverview Payment Configuration - Secure Payment & Stripe Settings
 * @module config/payment
 * @description Centralized, secure configuration for payment processing with Stripe
 *
 * Security Best Practices:
 * - Never expose .env directly to application code
 * - Validate all configuration values
 * - Provide sensible defaults for non-sensitive values
 * - Fail fast if critical values are missing
 * - Support environment-specific overrides (development, staging, production)
 *
 * @author InsightSerenity Platform Team
 * @version 1.0.0
 */

const logger = require('../../../shared/lib/utils/logger');

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Current environment
 * @type {string}
 */
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Check if running in development mode
 * @type {boolean}
 */
const isDevelopment = NODE_ENV === 'development';

/**
 * Check if running in production mode
 * @type {boolean}
 */
const isProduction = NODE_ENV === 'production';

/**
 * Check if running in test mode
 * @type {boolean}
 */
const isTest = NODE_ENV === 'test';

/**
 * Check if running in staging mode
 * @type {boolean}
 */
const isStaging = NODE_ENV === 'staging';

// ============================================================================
// STRIPE CONFIGURATION
// ============================================================================

/**
 * Get Stripe secret key with validation
 * @returns {string} Stripe secret key
 * @throws {Error} If key is missing or invalid format
 */
function getStripeSecretKey() {
    const key = process.env.STRIPE_SECRET_KEY;

    if (!key) {
        if (isProduction) {
            throw new Error('CRITICAL: STRIPE_SECRET_KEY is required in production');
        }
        logger.warn('STRIPE_SECRET_KEY not configured - payment processing will fail');
        return null;
    }

    // Validate key format
    const validPrefixes = ['sk_test_', 'sk_live_'];
    const isValid = validPrefixes.some(prefix => key.startsWith(prefix));

    if (!isValid) {
        throw new Error(`Invalid STRIPE_SECRET_KEY format. Must start with ${validPrefixes.join(' or ')}`);
    }

    // Warn if using test key in production
    if (isProduction && key.startsWith('sk_test_')) {
        logger.error('WARNING: Using Stripe TEST key in PRODUCTION environment!');
        throw new Error('Cannot use Stripe test keys in production');
    }

    // Warn if using live key in development
    if (isDevelopment && key.startsWith('sk_live_')) {
        logger.warn('WARNING: Using Stripe LIVE key in DEVELOPMENT environment!');
    }

    return key;
}

/**
 * Get Stripe publishable key with validation
 * @returns {string} Stripe publishable key
 */
function getStripePublishableKey() {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;

    if (!key) {
        if (isProduction) {
            throw new Error('CRITICAL: STRIPE_PUBLISHABLE_KEY is required in production');
        }
        logger.warn('STRIPE_PUBLISHABLE_KEY not configured');
        return null;
    }

    // Validate key format
    const validPrefixes = ['pk_test_', 'pk_live_'];
    const isValid = validPrefixes.some(prefix => key.startsWith(prefix));

    if (!isValid) {
        throw new Error(`Invalid STRIPE_PUBLISHABLE_KEY format. Must start with ${validPrefixes.join(' or ')}`);
    }

    // Environment mismatch check
    if (isProduction && key.startsWith('pk_test_')) {
        throw new Error('Cannot use Stripe test publishable key in production');
    }

    return key;
}

/**
 * Get Stripe webhook secret
 * @returns {string|null} Webhook secret or null
 */
function getStripeWebhookSecret() {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
        logger.warn('STRIPE_WEBHOOK_SECRET not configured - webhook signature verification disabled');
        return null;
    }

    // Validate format
    if (!secret.startsWith('whsec_')) {
        throw new Error('Invalid STRIPE_WEBHOOK_SECRET format. Must start with whsec_');
    }

    return secret;
}

/**
 * Determine if mock payment mode should be used
 * @returns {boolean}
 */
function shouldUseMockPayment() {
    const useMock = process.env.USE_MOCK_PAYMENT === 'true';

    if (useMock && isProduction) {
        throw new Error('Cannot use mock payment in production');
    }

    return useMock;
}

// ============================================================================
// PAYMENT BUSINESS RULES
// ============================================================================

/**
 * Get platform fee percentage
 * @returns {number} Platform fee as percentage (0-100)
 */
function getPlatformFeePercentage() {
    const fee = parseInt(process.env.PLATFORM_FEE_PERCENTAGE, 10);

    if (isNaN(fee) || fee < 0 || fee > 100) {
        logger.warn(`Invalid PLATFORM_FEE_PERCENTAGE: ${process.env.PLATFORM_FEE_PERCENTAGE}, using default 15%`);
        return 15;
    }

    return fee;
}

/**
 * Get default currency
 * @returns {string} ISO 4217 currency code
 */
function getDefaultCurrency() {
    const currency = (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase();

    // Validate currency code (basic check for 3-letter code)
    if (!/^[A-Z]{3}$/.test(currency)) {
        logger.warn(`Invalid DEFAULT_CURRENCY: ${currency}, using USD`);
        return 'USD';
    }

    return currency;
}

/**
 * Get free trial duration in minutes
 * @returns {number}
 */
function getFreeTrialDuration() {
    const duration = parseInt(process.env.FREE_TRIAL_DURATION_MINUTES, 10);

    if (isNaN(duration) || duration <= 0) {
        return 15; // Default 15 minutes
    }

    return duration;
}

/**
 * Get free trial expiry days
 * @returns {number}
 */
function getFreeTrialExpiry() {
    const days = parseInt(process.env.FREE_TRIAL_EXPIRY_DAYS, 10);

    if (isNaN(days) || days <= 0) {
        return 30; // Default 30 days
    }

    return days;
}

/**
 * Get consultant payout schedule
 * @returns {string} 'daily' | 'weekly' | 'monthly'
 */
function getPayoutSchedule() {
    const schedule = (process.env.CONSULTANT_PAYOUT_SCHEDULE || 'weekly').toLowerCase();
    const validSchedules = ['daily', 'weekly', 'monthly'];

    if (!validSchedules.includes(schedule)) {
        logger.warn(`Invalid CONSULTANT_PAYOUT_SCHEDULE: ${schedule}, using weekly`);
        return 'weekly';
    }

    return schedule;
}

/**
 * Get minimum payout amount in cents
 * @returns {number}
 */
function getMinimumPayoutAmount() {
    const amount = parseInt(process.env.MINIMUM_PAYOUT_AMOUNT, 10);

    if (isNaN(amount) || amount < 0) {
        return 50; // Default $50
    }

    return amount;
}

// ============================================================================
// CONFIGURATION OBJECT BUILDER
// ============================================================================

/**
 * Build complete payment configuration
 * @returns {object} Payment configuration object
 */
function buildPaymentConfig() {
    const config = {
        // Environment
        environment: NODE_ENV,
        isDevelopment,
        isProduction,
        isStaging,
        isTest,

        // Stripe Configuration
        stripe: {
            secretKey: getStripeSecretKey(),
            publishableKey: getStripePublishableKey(),
            webhookSecret: getStripeWebhookSecret(),
            apiVersion: '2023-10-16', // Stripe API version

            // Stripe connection options
            options: {
                apiVersion: '2023-10-16',
                maxNetworkRetries: 3,
                timeout: 30000, // 30 seconds
                telemetry: !isProduction // Disable telemetry in production
            }
        },

        // Mock Mode
        mock: {
            enabled: shouldUseMockPayment(),
            simulateFailures: isDevelopment && process.env.SIMULATE_PAYMENT_FAILURES === 'true'
        },

        // Platform Fees
        fees: {
            platform: {
                percentage: getPlatformFeePercentage(),
                type: 'percentage' // or 'fixed'
            },
            stripe: {
                percentage: 2.9,
                fixed: 30 // cents
            }
        },

        // Currency
        currency: {
            default: getDefaultCurrency(),
            supported: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] // Add more as needed
        },

        // Free Trial
        freeTrial: {
            enabled: true,
            durationMinutes: getFreeTrialDuration(),
            expiryDays: getFreeTrialExpiry(),
            oneTimeOnly: true
        },

        // Payouts
        payouts: {
            schedule: getPayoutSchedule(),
            minimumAmount: getMinimumPayoutAmount(),
            currency: getDefaultCurrency()
        },

        // Consultation Session
        consultation: {
            defaultDurationMinutes: parseInt(process.env.DEFAULT_SESSION_DURATION_MINUTES, 10) || 60,
            cancellationWindowHours: parseInt(process.env.CANCELLATION_WINDOW_HOURS, 10) || 24,
            maxAttendeesPerSession: parseInt(process.env.MAX_ATTENDEES_PER_SESSION, 10) || 20
        },

        // Payment Intent Settings
        paymentIntent: {
            captureMethod: 'automatic', // or 'manual'
            confirmationMethod: 'automatic', // or 'manual'

            // Metadata that will be attached to all payment intents
            defaultMetadata: {
                platform: 'insightserenity',
                environment: NODE_ENV
            }
        },

        // Refund Policy
        refunds: {
            enabled: true,
            partialRefundsAllowed: true,

            // Refund eligibility window (hours before scheduled consultation)
            eligibilityWindow: {
                full: 48, // Full refund if cancelled 48+ hours before
                partial: 24, // 50% refund if cancelled 24-48 hours before
                none: 0 // No refund if cancelled <24 hours before
            },

            // Refund percentages
            percentages: {
                full: 100,
                partial: 50,
                none: 0
            }
        },

        // Credit System
        credits: {
            enabled: true,
            rolloverAllowed: true,
            expirationEnabled: true,
            defaultExpiryDays: 90
        },

        // Notifications
        notifications: {
            sendConfirmation: process.env.SEND_CONSULTATION_CONFIRMATION === 'true',
            sendReminder: process.env.SEND_CONSULTATION_REMINDER === 'true',
            reminderMinutes: parseInt(process.env.CONSULTATION_REMINDER_MINUTES, 10) || 1440 // 24 hours
        },

        // Security
        security: {
            webhookSignatureVerification: !!getStripeWebhookSecret(),
            idempotencyEnabled: true,
            rateLimiting: {
                enabled: true,
                maxRequestsPerMinute: 100
            }
        },

        // Logging
        logging: {
            enabled: true,
            logPaymentDetails: !isProduction, // Don't log sensitive details in production
            logLevel: isProduction ? 'error' : 'debug'
        }
    };

    return config;
}

// ============================================================================
// VALIDATION & INITIALIZATION
// ============================================================================

/**
 * Validate payment configuration
 * @param {object} config Payment configuration
 * @throws {Error} If configuration is invalid
 */
function validatePaymentConfig(config) {
    const errors = [];

    // Critical validations for production
    if (config.isProduction) {
        if (!config.stripe.secretKey) {
            errors.push('Stripe secret key is required in production');
        }
        if (!config.stripe.publishableKey) {
            errors.push('Stripe publishable key is required in production');
        }
        if (config.mock.enabled) {
            errors.push('Mock payment mode cannot be enabled in production');
        }
        if (!config.stripe.webhookSecret) {
            logger.warn('Stripe webhook secret not configured - webhook verification disabled');
        }
    }

    // Business logic validations
    if (config.fees.platform.percentage < 0 || config.fees.platform.percentage > 100) {
        errors.push('Platform fee percentage must be between 0 and 100');
    }

    if (config.freeTrial.durationMinutes <= 0) {
        errors.push('Free trial duration must be greater than 0');
    }

    if (errors.length > 0) {
        throw new Error(`Payment configuration validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Log configuration status (safe - no sensitive data)
 * @param {object} config Payment configuration
 */
function logConfigurationStatus(config) {
    logger.info('Payment Configuration Loaded', {
        environment: config.environment,
        stripeConfigured: !!config.stripe.secretKey,
        stripeMode: config.stripe.secretKey ? (config.stripe.secretKey.startsWith('sk_test_') ? 'TEST' : 'LIVE') : 'NONE',
        webhookVerification: config.security.webhookSignatureVerification,
        mockMode: config.mock.enabled,
        platformFee: `${config.fees.platform.percentage}%`,
        currency: config.currency.default,
        freeTrialDuration: `${config.freeTrial.durationMinutes} minutes`
    });
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

/**
 * Initialize and export payment configuration
 */
let paymentConfig;

try {
    paymentConfig = buildPaymentConfig();
    validatePaymentConfig(paymentConfig);
    logConfigurationStatus(paymentConfig);
} catch (error) {
    logger.error('Failed to initialize payment configuration', { error: error.message });

    // In production, fail fast
    if (isProduction) {
        throw error;
    }

    // In development, use a minimal config to allow server to start
    logger.warn('Using minimal payment configuration - payment features will be disabled');
    paymentConfig = {
        environment: NODE_ENV,
        isDevelopment: true,
        isProduction: false,
        stripe: { secretKey: null, publishableKey: null, webhookSecret: null },
        mock: { enabled: true }
    };
}

/**
 * Payment configuration object
 * @type {object}
 */
module.exports = paymentConfig;

/**
 * Helper function to get Stripe instance (lazy initialization)
 * @returns {object} Stripe instance
 */
module.exports.getStripeInstance = function() {
    if (!paymentConfig.stripe.secretKey) {
        throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }

    const stripe = require('stripe')(paymentConfig.stripe.secretKey, paymentConfig.stripe.options);
    return stripe;
};

/**
 * Helper to check if payment processing is available
 * @returns {boolean}
 */
module.exports.isPaymentAvailable = function() {
    return !!(paymentConfig.stripe.secretKey || paymentConfig.mock.enabled);
};

/**
 * Helper to get safe config for client (no secrets)
 * @returns {object} Client-safe configuration
 */
module.exports.getClientConfig = function() {
    return {
        publishableKey: paymentConfig.stripe.publishableKey,
        currency: paymentConfig.currency.default,
        freeTrial: {
            enabled: paymentConfig.freeTrial.enabled,
            durationMinutes: paymentConfig.freeTrial.durationMinutes
        },
        fees: {
            platform: paymentConfig.fees.platform.percentage
        }
    };
};
