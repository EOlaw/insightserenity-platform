/**
 * @fileoverview Payment Service - Stripe integration and payment processing
 * @module servers/customer-services/modules/core-business/billing-management/services/payment-service
 * @description Handles all payment processing, Stripe integration, free trial logic,
 * consultation credits, and consultant payouts
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'payment-service'
});
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Stripe SDK
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Payment Service
 * Manages all payment operations including Stripe integration
 * @class PaymentService
 */
class PaymentService {
    constructor() {
        this._dbService = null;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            currency: process.env.DEFAULT_CURRENCY || 'USD',
            platformFeePercentage: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE) || 15, // 15% platform fee
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
            stripeSecretKey: process.env.STRIPE_SECRET_KEY,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

            // Free trial configuration
            freeTrialDuration: parseInt(process.env.FREE_TRIAL_DURATION_MINUTES, 10) || 15,
            freeTrialExpiryDays: parseInt(process.env.FREE_TRIAL_EXPIRY_DAYS, 10) || 30,

            // Consultant payout configuration
            payoutSchedule: process.env.CONSULTANT_PAYOUT_SCHEDULE || 'weekly', // weekly, biweekly, monthly
            minimumPayoutAmount: parseFloat(process.env.MINIMUM_PAYOUT_AMOUNT) || 50,
        };
    }

    /**
     * Get database service instance
     * @private
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    // ============= FREE TRIAL MANAGEMENT =============

    /**
     * Check if client is eligible for free trial consultation
     * @param {string} clientId - Client ID
     * @param {Object} options - Options
     * @returns {Promise<Object>} Eligibility status
     */
    async checkFreeTrialEligibility(clientId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findById(clientId);

            if (!client) {
                throw AppError.notFound('Client not found');
            }

            const eligible = client.consultationCredits?.freeTrial?.eligible &&
                           !client.consultationCredits?.freeTrial?.used;

            const expiryDate = client.consultationCredits?.freeTrial?.expiresAt;
            const expired = expiryDate && expiryDate < new Date();

            return {
                eligible: eligible && !expired,
                used: client.consultationCredits?.freeTrial?.used || false,
                expired,
                expiresAt: expiryDate,
                durationMinutes: this.config.freeTrialDuration
            };

        } catch (error) {
            logger.error('Error checking free trial eligibility', { clientId, error: error.message });
            throw error;
        }
    }

    /**
     * Mark free trial as used
     * @param {string} clientId - Client ID
     * @param {string} consultationId - Consultation ID
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated client
     */
    async markFreeTrialUsed(clientId, consultationId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findById(clientId);

            if (!client) {
                throw AppError.notFound('Client not found');
            }

            if (!client.consultationCredits) {
                client.consultationCredits = {};
            }

            if (!client.consultationCredits.freeTrial) {
                client.consultationCredits.freeTrial = {};
            }

            client.consultationCredits.freeTrial.used = true;
            client.consultationCredits.freeTrial.eligible = false;
            client.consultationCredits.freeTrial.consultationId = consultationId;
            client.consultationCredits.freeTrial.usedAt = new Date();

            await client.save();

            logger.info('Free trial marked as used', { clientId, consultationId });

            return client;

        } catch (error) {
            logger.error('Error marking free trial used', { clientId, consultationId, error: error.message });
            throw error;
        }
    }

    // ============= STRIPE CUSTOMER MANAGEMENT =============

    /**
     * Create or retrieve Stripe customer
     * @param {Object} client - Client document
     * @returns {Promise<Object>} Stripe customer
     */
    async ensureStripeCustomer(client) {
        try {
            // Check if client already has Stripe customer ID
            if (client.consultationCredits?.stripeCustomerId) {
                try {
                    const customer = await stripe.customers.retrieve(
                        client.consultationCredits.stripeCustomerId
                    );
                    return customer;
                } catch (error) {
                    // Customer ID invalid, create new one
                    logger.warn('Invalid Stripe customer ID, creating new', {
                        clientId: client._id,
                        oldStripeId: client.consultationCredits.stripeCustomerId
                    });
                }
            }

            // Create new Stripe customer
            const customer = await stripe.customers.create({
                email: client.contacts?.primary?.email,
                name: client.companyName,
                metadata: {
                    clientId: client._id.toString(),
                    clientCode: client.clientCode,
                    tenantId: client.tenantId.toString()
                },
                address: client.addresses?.headquarters ? {
                    line1: client.addresses.headquarters.street1,
                    line2: client.addresses.headquarters.street2,
                    city: client.addresses.headquarters.city,
                    state: client.addresses.headquarters.state,
                    postal_code: client.addresses.headquarters.postalCode,
                    country: client.addresses.headquarters.country
                } : undefined
            });

            // Save Stripe customer ID to client
            if (!client.consultationCredits) {
                client.consultationCredits = {};
            }
            client.consultationCredits.stripeCustomerId = customer.id;
            await client.save();

            logger.info('Stripe customer created', {
                clientId: client._id,
                stripeCustomerId: customer.id
            });

            return customer;

        } catch (error) {
            logger.error('Error ensuring Stripe customer', { clientId: client._id, error: error.message });
            throw error;
        }
    }

    // ============= PAYMENT PROCESSING =============

    /**
     * Create payment intent for consultation
     * @param {Object} data - Payment data
     * @param {string} data.clientId - Client ID
     * @param {string} data.consultationId - Consultation ID (optional)
     * @param {string} data.packageId - Package ID (optional)
     * @param {number} data.amount - Amount in cents
     * @param {Object} options - Options
     * @returns {Promise<Object>} Payment intent
     */
    async createPaymentIntent(data, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');
            const Billing = dbService.getModel('Billing', 'customer');

            // Get client
            const client = await Client.findById(data.clientId);
            if (!client) {
                throw AppError.notFound('Client not found');
            }

            // Ensure Stripe customer exists
            const stripeCustomer = await this.ensureStripeCustomer(client);

            // Calculate fees
            const grossAmount = data.amount;
            const platformFee = Math.round(grossAmount * (this.config.platformFeePercentage / 100));
            const processingFee = Math.round(grossAmount * 0.029 + 30); // Stripe standard: 2.9% + $0.30
            const netAmount = grossAmount - platformFee - processingFee;

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: grossAmount,
                currency: this.config.currency.toLowerCase(),
                customer: stripeCustomer.id,
                metadata: {
                    clientId: data.clientId,
                    consultationId: data.consultationId || '',
                    packageId: data.packageId || '',
                    tenantId: client.tenantId.toString()
                },
                description: data.description || 'Consultation payment',
                statement_descriptor: 'INSIGHTSERENITY',
                automatic_payment_methods: {
                    enabled: true
                }
            });

            // Generate transaction ID
            const transactionId = await Billing.generateTransactionId(client.tenantId);

            // Create billing record
            const billing = new Billing({
                transactionId,
                tenantId: client.tenantId,
                organizationId: client.organizationId,
                clientId: data.clientId,
                consultantId: data.consultantId,
                consultationId: data.consultationId,
                packageId: data.packageId,

                details: {
                    type: data.packageId ? 'package_purchase' : 'consultation_payment',
                    description: data.description || 'Consultation payment'
                },

                amount: {
                    gross: grossAmount,
                    platformFee,
                    processingFee,
                    tax: 0,
                    discount: 0,
                    net: netAmount,
                    currency: this.config.currency
                },

                stripe: {
                    paymentIntentId: paymentIntent.id,
                    customerId: stripeCustomer.id,
                    statementDescriptor: 'INSIGHTSERENITY'
                },

                paymentMethod: {
                    type: 'credit_card'
                },

                status: {
                    current: 'pending'
                },

                dates: {
                    initiated: new Date()
                },

                metadata: {
                    source: 'web',
                    createdBy: options.userId
                }
            });

            await billing.save();

            logger.info('Payment intent created', {
                transactionId,
                paymentIntentId: paymentIntent.id,
                amount: grossAmount
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                transactionId,
                amount: grossAmount,
                currency: this.config.currency
            };

        } catch (error) {
            logger.error('Error creating payment intent', { error: error.message });
            throw error;
        }
    }

    /**
     * Confirm payment and create consultation credits
     * @param {string} paymentIntentId - Stripe payment intent ID
     * @param {Object} options - Options
     * @returns {Promise<Object>} Confirmation result
     */
    async confirmPayment(paymentIntentId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');
            const Client = dbService.getModel('Client', 'customer');

            // Retrieve payment intent from Stripe
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.status !== 'succeeded') {
                throw AppError.validation('Payment has not succeeded yet');
            }

            // Find billing record
            const billing = await Billing.findOne({
                'stripe.paymentIntentId': paymentIntentId
            });

            if (!billing) {
                throw AppError.notFound('Billing record not found');
            }

            // Mark as succeeded
            await billing.markAsSucceeded({
                stripePaymentIntentId: paymentIntent.id,
                stripeChargeId: paymentIntent.latest_charge,
                receiptUrl: paymentIntent.charges?.data[0]?.receipt_url
            });

            // If this was a package purchase, add credits to client
            if (billing.packageId) {
                const ConsultationPackage = dbService.getModel('ConsultationPackage', 'customer');
                const consultationPackage = await ConsultationPackage.findById(billing.packageId);

                if (consultationPackage) {
                    const client = await Client.findById(billing.clientId);

                    if (!client.consultationCredits) {
                        client.consultationCredits = {};
                    }

                    // Add credits
                    const currentCredits = client.consultationCredits.availableCredits || 0;
                    client.consultationCredits.availableCredits = currentCredits + consultationPackage.credits.total;

                    // Add to credits history
                    if (!client.consultationCredits.credits) {
                        client.consultationCredits.credits = [];
                    }

                    const expiryDate = consultationPackage.credits.expiresAfterDays
                        ? new Date(Date.now() + consultationPackage.credits.expiresAfterDays * 24 * 60 * 60 * 1000)
                        : null;

                    client.consultationCredits.credits.push({
                        packageId: consultationPackage._id,
                        packageName: consultationPackage.details.name,
                        creditsAdded: consultationPackage.credits.total,
                        creditsUsed: 0,
                        creditsRemaining: consultationPackage.credits.total,
                        purchaseDate: new Date(),
                        expiryDate,
                        billingId: billing._id,
                        status: 'active'
                    });

                    // Update lifetime stats
                    if (!client.consultationCredits.lifetime) {
                        client.consultationCredits.lifetime = {};
                    }
                    client.consultationCredits.lifetime.totalCreditsPurchased =
                        (client.consultationCredits.lifetime.totalCreditsPurchased || 0) + consultationPackage.credits.total;
                    client.consultationCredits.lifetime.totalSpent =
                        (client.consultationCredits.lifetime.totalSpent || 0) + billing.amount.net;

                    await client.save();

                    // Update package statistics
                    await consultationPackage.purchase();

                    logger.info('Credits added to client', {
                        clientId: client._id,
                        packageId: consultationPackage._id,
                        credits: consultationPackage.credits.total
                    });
                }
            }

            logger.info('Payment confirmed', {
                paymentIntentId,
                transactionId: billing.transactionId
            });

            return {
                success: true,
                transactionId: billing.transactionId,
                billing
            };

        } catch (error) {
            logger.error('Error confirming payment', { paymentIntentId, error: error.message });
            throw error;
        }
    }

    /**
     * Validate client has sufficient credits or payment for consultation
     * @param {string} clientId - Client ID
     * @param {number} durationMinutes - Consultation duration
     * @param {Object} options - Options
     * @returns {Promise<Object>} Validation result
     */
    async validateConsultationPayment(clientId, durationMinutes, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findById(clientId);
            if (!client) {
                throw AppError.notFound('Client not found');
            }

            // Check free trial eligibility
            const freeTrialEligibility = await this.checkFreeTrialEligibility(clientId, options);

            if (freeTrialEligibility.eligible && durationMinutes <= this.config.freeTrialDuration) {
                return {
                    valid: true,
                    paymentRequired: false,
                    method: 'free_trial',
                    message: 'Free trial consultation'
                };
            }

            // Check if client has sufficient credits
            const availableCredits = client.consultationCredits?.availableCredits || 0;

            if (availableCredits >= 1) {
                return {
                    valid: true,
                    paymentRequired: false,
                    method: 'credits',
                    creditsAvailable: availableCredits,
                    message: 'Payment using consultation credits'
                };
            }

            // Payment required
            return {
                valid: false,
                paymentRequired: true,
                method: 'payment',
                message: 'Payment required - insufficient credits',
                creditsAvailable: availableCredits
            };

        } catch (error) {
            logger.error('Error validating consultation payment', { clientId, error: error.message });
            throw error;
        }
    }

    /**
     * Deduct consultation credit after session
     * @param {string} clientId - Client ID
     * @param {string} consultationId - Consultation ID
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated client
     */
    async deductConsultationCredit(clientId, consultationId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findById(clientId);
            if (!client) {
                throw AppError.notFound('Client not found');
            }

            const availableCredits = client.consultationCredits?.availableCredits || 0;

            if (availableCredits < 1) {
                throw AppError.validation('Insufficient consultation credits');
            }

            // Deduct credit
            client.consultationCredits.availableCredits -= 1;

            // Find and update the active credit package
            const activeCredit = client.consultationCredits.credits?.find(c =>
                c.status === 'active' && c.creditsRemaining > 0
            );

            if (activeCredit) {
                activeCredit.creditsUsed += 1;
                activeCredit.creditsRemaining -= 1;

                if (activeCredit.creditsRemaining === 0) {
                    activeCredit.status = 'depleted';
                }
            }

            // Update lifetime stats
            if (!client.consultationCredits.lifetime) {
                client.consultationCredits.lifetime = {};
            }
            client.consultationCredits.lifetime.totalConsultations =
                (client.consultationCredits.lifetime.totalConsultations || 0) + 1;
            client.consultationCredits.lifetime.totalCreditsUsed =
                (client.consultationCredits.lifetime.totalCreditsUsed || 0) + 1;
            client.consultationCredits.lifetime.lastConsultationDate = new Date();

            await client.save();

            logger.info('Consultation credit deducted', {
                clientId,
                consultationId,
                remainingCredits: client.consultationCredits.availableCredits
            });

            return client;

        } catch (error) {
            logger.error('Error deducting consultation credit', { clientId, consultationId, error: error.message });
            throw error;
        }
    }

    // ============= REFUND MANAGEMENT =============

    /**
     * Process refund for consultation
     * @param {string} transactionId - Transaction ID
     * @param {number} amount - Refund amount (null for full refund)
     * @param {string} reason - Refund reason
     * @param {Object} options - Options
     * @returns {Promise<Object>} Refund result
     */
    async processRefund(transactionId, amount, reason, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');

            const billing = await Billing.findOne({ transactionId });

            if (!billing) {
                throw AppError.notFound('Transaction not found');
            }

            if (!billing.isRefundable) {
                throw AppError.validation('Transaction is not refundable');
            }

            // Calculate refund amount
            const refundAmount = amount || billing.amount.net;

            // Process refund with Stripe
            const refund = await stripe.refunds.create({
                payment_intent: billing.stripe.paymentIntentId,
                amount: refundAmount,
                reason: reason === 'client_requested' ? 'requested_by_customer' : 'duplicate',
                metadata: {
                    transactionId,
                    originalAmount: billing.amount.net
                }
            });

            // Update billing record
            await billing.processRefund(refundAmount, reason, options.userId);
            billing.refund.stripeRefundId = refund.id;
            billing.refund.refundStatus = 'succeeded';
            await billing.save();

            // If this was a credit purchase, deduct credits from client
            if (billing.packageId) {
                const Client = dbService.getModel('Client', 'customer');
                const client = await Client.findById(billing.clientId);
                const ConsultationPackage = dbService.getModel('ConsultationPackage', 'customer');
                const consultationPackage = await ConsultationPackage.findById(billing.packageId);

                if (client && consultationPackage) {
                    // Deduct credits
                    client.consultationCredits.availableCredits = Math.max(
                        0,
                        (client.consultationCredits.availableCredits || 0) - consultationPackage.credits.total
                    );

                    // Update credit record status
                    const creditRecord = client.consultationCredits.credits?.find(c =>
                        c.billingId?.toString() === billing._id.toString()
                    );
                    if (creditRecord) {
                        creditRecord.status = 'refunded';
                    }

                    await client.save();
                }
            }

            logger.info('Refund processed', {
                transactionId,
                refundId: refund.id,
                amount: refundAmount
            });

            return {
                success: true,
                refundId: refund.id,
                amount: refundAmount
            };

        } catch (error) {
            logger.error('Error processing refund', { transactionId, error: error.message });
            throw error;
        }
    }

    // ============= CONSULTANT PAYOUT =============

    /**
     * Calculate consultant payout for completed consultation
     * @param {string} transactionId - Transaction ID
     * @returns {Promise<Object>} Payout calculation
     */
    async calculateConsultantPayout(transactionId) {
        try {
            const dbService = this._getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');

            const billing = await Billing.findOne({ transactionId });

            if (!billing) {
                throw AppError.notFound('Transaction not found');
            }

            // Consultant gets: Net amount - Platform fee - Processing fee
            const consultantEarnings = billing.consultantEarnings;

            return {
                transactionId,
                grossAmount: billing.amount.gross,
                netAmount: billing.amount.net,
                platformFee: billing.amount.platformFee,
                processingFee: billing.amount.processingFee,
                consultantEarnings,
                currency: billing.amount.currency
            };

        } catch (error) {
            logger.error('Error calculating consultant payout', { transactionId, error: error.message });
            throw error;
        }
    }

    /**
     * Schedule consultant payout
     * @param {string} consultantId - Consultant ID
     * @param {Date} payoutDate - Payout date
     * @param {Object} options - Options
     * @returns {Promise<Object>} Payout schedule result
     */
    async scheduleConsultantPayouts(consultantId, payoutDate, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');

            const pendingPayouts = await Billing.getPendingPayouts(
                options.tenantId || this.config.companyTenantId,
                consultantId
            );

            const totalPayout = pendingPayouts.reduce((sum, billing) =>
                sum + billing.consultantEarnings, 0
            );

            if (totalPayout < this.config.minimumPayoutAmount) {
                logger.info('Payout amount below minimum', {
                    consultantId,
                    amount: totalPayout,
                    minimum: this.config.minimumPayoutAmount
                });
                return {
                    scheduled: false,
                    reason: 'below_minimum',
                    amount: totalPayout,
                    minimum: this.config.minimumPayoutAmount
                };
            }

            // Schedule payouts
            for (const billing of pendingPayouts) {
                await billing.scheduleConsultantPayout(payoutDate, 'stripe_connect');
            }

            logger.info('Consultant payouts scheduled', {
                consultantId,
                count: pendingPayouts.length,
                totalAmount: totalPayout,
                payoutDate
            });

            return {
                scheduled: true,
                count: pendingPayouts.length,
                totalAmount: totalPayout,
                payoutDate
            };

        } catch (error) {
            logger.error('Error scheduling consultant payouts', { consultantId, error: error.message });
            throw error;
        }
    }
}

// Export the class
module.exports = PaymentService;
