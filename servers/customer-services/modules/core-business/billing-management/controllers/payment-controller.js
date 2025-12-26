/**
 * @fileoverview Payment Controller
 * @module servers/customer-services/modules/core-business/billing-management/controllers/payment-controller
 * @description HTTP request handlers for payment and billing operations
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'payment-controller'
});
const PaymentService = require('../services/payment-service');
const { validationResult, body, param, query } = require('express-validator');

const paymentService = new PaymentService();

/**
 * Payment Controller
 * Handles all payment-related HTTP requests
 */
class PaymentController {
    /**
     * Create payment intent for consultation package purchase
     * POST /api/billing/payments/intent
     */
    static async createPaymentIntent(req, res, next) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw AppError.validation('Validation failed', errors.array());
            }

            const {
                packageId,
                amount,
                currency = 'USD',
                quantity = 1,
                paymentMethodId,
                savePaymentMethod = false
            } = req.body;

            const clientId = req.user.clientId || req.user.id;
            const tenantId = req.user.tenantId;

            logger.info('Creating payment intent', {
                clientId,
                packageId,
                amount,
                quantity
            });

            const result = await paymentService.createPaymentIntent({
                clientId,
                packageId,
                amount,
                currency,
                quantity,
                paymentMethodId,
                savePaymentMethod
            }, {
                tenantId,
                userId: req.user.id
            });

            res.status(201).json({
                success: true,
                message: 'Payment intent created successfully',
                data: {
                    clientSecret: result.clientSecret,
                    paymentIntentId: result.paymentIntentId,
                    transactionId: result.billing.transactionId,
                    amount: result.billing.amount,
                    requiresAction: result.requiresAction
                }
            });

        } catch (error) {
            logger.error('Error creating payment intent', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Confirm payment after client completes payment
     * POST /api/billing/payments/:paymentIntentId/confirm
     */
    static async confirmPayment(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw AppError.validation('Validation failed', errors.array());
            }

            const { paymentIntentId } = req.params;
            const tenantId = req.user.tenantId;

            logger.info('Confirming payment', { paymentIntentId });

            const result = await paymentService.confirmPayment(paymentIntentId, {
                tenantId,
                userId: req.user.id
            });

            res.status(200).json({
                success: true,
                message: 'Payment confirmed successfully',
                data: {
                    transactionId: result.billing.transactionId,
                    status: result.billing.status.current,
                    creditsAdded: result.creditsAdded,
                    client: {
                        availableCredits: result.client.consultationCredits.availableCredits,
                        totalSpent: result.client.consultationCredits.lifetime.totalSpent
                    }
                }
            });

        } catch (error) {
            logger.error('Error confirming payment', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get payment/transaction status
     * GET /api/billing/payments/:transactionId
     */
    static async getPaymentStatus(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw AppError.validation('Validation failed', errors.array());
            }

            const { transactionId } = req.params;
            const tenantId = req.user.tenantId;

            const dbService = require('../../../../../../shared/lib/database').getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');

            const billing = await Billing.findOne({
                transactionId,
                tenantId
            }).populate('client', 'profile.firstName profile.lastName email')
              .populate('package', 'details.name pricing.amount');

            if (!billing) {
                throw AppError.notFound('Transaction not found');
            }

            // Authorization check - only allow client to view their own transactions or admin
            if (billing.client._id.toString() !== req.user.clientId &&
                !req.user.roles.includes('admin')) {
                throw AppError.forbidden('Access denied');
            }

            res.status(200).json({
                success: true,
                data: billing
            });

        } catch (error) {
            logger.error('Error getting payment status', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get client payment history
     * GET /api/billing/payments/client/:clientId/history
     */
    static async getClientPaymentHistory(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw AppError.validation('Validation failed', errors.array());
            }

            const { clientId } = req.params;
            const tenantId = req.user.tenantId;
            const {
                page = 1,
                limit = 20,
                status,
                startDate,
                endDate
            } = req.query;

            // Authorization check
            if (clientId !== req.user.clientId && !req.user.roles.includes('admin')) {
                throw AppError.forbidden('Access denied');
            }

            const dbService = require('../../../../../../shared/lib/database').getDatabaseService();
            const Billing = dbService.getModel('Billing', 'customer');

            const query = {
                client: clientId,
                tenantId,
                isDeleted: false
            };

            if (status) {
                query['status.current'] = status;
            }

            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }

            const skip = (page - 1) * limit;

            const [transactions, total] = await Promise.all([
                Billing.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .populate('package', 'details.name pricing.amount credits.total'),
                Billing.countDocuments(query)
            ]);

            res.status(200).json({
                success: true,
                data: {
                    transactions,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(total / limit),
                        totalItems: total,
                        itemsPerPage: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            logger.error('Error getting payment history', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Process refund for a transaction
     * POST /api/billing/payments/:transactionId/refund
     */
    static async processRefund(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw AppError.validation('Validation failed', errors.array());
            }

            const { transactionId } = req.params;
            const { amount, reason } = req.body;
            const tenantId = req.user.tenantId;

            logger.info('Processing refund', {
                transactionId,
                amount,
                reason,
                userId: req.user.id
            });

            const result = await paymentService.processRefund(
                transactionId,
                amount,
                reason,
                {
                    tenantId,
                    userId: req.user.id
                }
            );

            res.status(200).json({
                success: true,
                message: 'Refund processed successfully',
                data: {
                    transactionId: result.transactionId,
                    refundAmount: result.refund.refundAmount,
                    refundStatus: result.refund.refundStatus,
                    stripeRefundId: result.stripe.refundId
                }
            });

        } catch (error) {
            logger.error('Error processing refund', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get client's available credits and subscription status
     * GET /api/billing/credits/balance
     */
    static async getCreditBalance(req, res, next) {
        try {
            logger.info('Credit balance request received', {
                hasUser: !!req.user,
                userId: req.user?.id,
                email: req.user?.email,
                clientId: req.user?.clientId,
                roles: req.user?.roles
            });

            // CRITICAL FIX: Check if req.user exists
            if (!req.user) {
                logger.error('No user found in request - authentication may have failed');
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // CRITICAL FIX: Only use clientId if it exists
            const clientId = req.user.clientId;

            if (!clientId) {
                logger.warn('Client ID not found in user token', {
                    userId: req.user.id,
                    email: req.user.email,
                    userType: req.user.userType,
                    roles: req.user.roles
                });

                // Return zero balance instead of error for better UX
                return res.status(200).json({
                    success: true,
                    data: {
                        availableCredits: 0,
                        freeTrial: {
                            eligible: false,
                            used: false,
                            expiresAt: null
                        },
                        activeCredits: [],
                        activeSubscriptions: [],
                        lifetime: {
                            totalCredits: 0,
                            totalSpent: 0
                        },
                        warning: 'Client profile not found. Please complete your profile setup.'
                    }
                });
            }

            const tenantId = req.user.tenantId;

            const dbService = require('../../../../../../shared/lib/database').getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findOne({
                _id: clientId,
                tenantId
            }).select('consultationCredits');

            if (!client) {
                logger.error('Client record not found despite having clientId', {
                    userId: req.user.id,
                    clientId: clientId,
                    tenantId: tenantId
                });
                throw AppError.notFound('Client profile not found. Please contact support.');
            }

            // Check free trial eligibility
            const freeTrialEligibility = await paymentService.checkFreeTrialEligibility(
                clientId,
                { tenantId }
            );

            res.status(200).json({
                success: true,
                data: {
                    availableCredits: client.consultationCredits.availableCredits || 0,
                    freeTrial: {
                        eligible: freeTrialEligibility.eligible,
                        used: client.consultationCredits.freeTrial.used,
                        expiresAt: client.consultationCredits.freeTrial.expiresAt
                    },
                    activeCredits: client.consultationCredits.credits.filter(c =>
                        c.status === 'active' && c.creditsRemaining > 0
                    ),
                    activeSubscriptions: client.consultationCredits.activeSubscriptions || [],
                    lifetime: client.consultationCredits.lifetime
                }
            });

        } catch (error) {
            logger.error('Error getting credit balance', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get available consultation packages for purchase
     * GET /api/billing/packages
     */
    static async getAvailablePackages(req, res, next) {
        try {
            const tenantId = req.user.tenantId;
            const { type, category, featured } = req.query;

            logger.info('Getting available packages', {
                tenantId,
                type,
                category,
                featured
            });

            const dbService = require('../../../../../../shared/lib/database').getDatabaseService();
            const ConsultationPackage = dbService.getModel('ConsultationPackage', 'customer');

            const options = {};
            if (type) options.type = type;
            if (category) options.category = category;
            if (featured === 'true') options.featured = true;

            logger.info('Calling findActivePackages', { tenantId, options });
            const packages = await ConsultationPackage.findActivePackages(tenantId, options);
            logger.info('Packages found', { count: packages.length });

            res.status(200).json({
                success: true,
                data: packages
            });

        } catch (error) {
            logger.error('Error getting available packages', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Webhook handler for Stripe events
     * POST /api/billing/webhooks/stripe
     */
    static async handleStripeWebhook(req, res, next) {
        try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const sig = req.headers['stripe-signature'];
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            let event;

            try {
                event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } catch (err) {
                logger.error('Webhook signature verification failed', { error: err.message });
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }

            logger.info('Received Stripe webhook event', { type: event.type });

            // Handle different event types
            switch (event.type) {
                case 'payment_intent.succeeded':
                    await paymentService.confirmPayment(event.data.object.id);
                    break;

                case 'payment_intent.payment_failed':
                    // Handle failed payment
                    const paymentIntent = event.data.object;
                    logger.error('Payment failed', {
                        paymentIntentId: paymentIntent.id,
                        error: paymentIntent.last_payment_error
                    });
                    break;

                case 'charge.refunded':
                    // Handle refund
                    logger.info('Charge refunded', {
                        chargeId: event.data.object.id
                    });
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted':
                    // Handle subscription events
                    logger.info('Subscription event', {
                        subscriptionId: event.data.object.id,
                        status: event.data.object.status
                    });
                    break;

                default:
                    logger.warn('Unhandled webhook event type', { type: event.type });
            }

            res.status(200).json({ received: true });

        } catch (error) {
            logger.error('Error handling Stripe webhook', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

/**
 * Validation rules for payment controller routes
 */
const validationRules = {
    createPaymentIntent: [
        body('packageId').optional().isMongoId().withMessage('Invalid package ID'),
        body('amount').isNumeric().withMessage('Amount must be a number'),
        body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('Invalid currency code'),
        body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
        body('paymentMethodId').optional().isString().withMessage('Invalid payment method ID'),
        body('savePaymentMethod').optional().isBoolean().withMessage('savePaymentMethod must be boolean')
    ],

    confirmPayment: [
        param('paymentIntentId').isString().notEmpty().withMessage('Payment intent ID is required')
    ],

    getPaymentStatus: [
        param('transactionId').isString().notEmpty().withMessage('Transaction ID is required')
    ],

    getClientPaymentHistory: [
        param('clientId').isMongoId().withMessage('Invalid client ID'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('status').optional().isString().withMessage('Invalid status'),
        query('startDate').optional().isISO8601().withMessage('Invalid start date'),
        query('endDate').optional().isISO8601().withMessage('Invalid end date')
    ],

    processRefund: [
        param('transactionId').isString().notEmpty().withMessage('Transaction ID is required'),
        body('amount').optional().isNumeric().withMessage('Amount must be a number'),
        body('reason').isString().notEmpty().withMessage('Reason is required')
    ]
};

module.exports = {
    PaymentController,
    validationRules
};
