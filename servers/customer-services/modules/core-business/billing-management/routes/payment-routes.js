/**
 * @fileoverview Payment Routes
 * @module servers/customer-services/modules/core-business/billing-management/routes/payment-routes
 * @description Express routes for payment and billing operations
 */

const express = require('express');
const router = express.Router();
const { PaymentController, validationRules } = require('../controllers/payment-controller');
const { authenticate, authorize } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * Stripe webhook endpoint (must be public)
 * POST /api/billing/webhooks/stripe
 */
router.post(
    '/webhooks/stripe',
    express.raw({ type: 'application/json' }), // Stripe requires raw body
    PaymentController.handleStripeWebhook
);

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply authentication to all routes below
router.use(authenticate);

/**
 * Get available consultation packages for purchase
 * GET /api/billing/packages
 */
router.get(
    '/packages',
    rateLimiter({ max: 100, windowMs: 60000 }), // 100 requests per minute
    PaymentController.getAvailablePackages
);

/**
 * Get client's credit balance and subscription status
 * GET /api/billing/credits/balance
 */
router.get(
    '/credits/balance',
    rateLimiter({ max: 100, windowMs: 60000 }),
    PaymentController.getCreditBalance
);

/**
 * Create payment intent for package purchase
 * POST /api/billing/payments/intent
 */
router.post(
    '/payments/intent',
    rateLimiter({ max: 20, windowMs: 60000 }), // 20 payment intents per minute
    validationRules.createPaymentIntent,
    PaymentController.createPaymentIntent
);

/**
 * Confirm payment after client completes Stripe payment
 * POST /api/billing/payments/:paymentIntentId/confirm
 */
router.post(
    '/payments/:paymentIntentId/confirm',
    rateLimiter({ max: 20, windowMs: 60000 }),
    validationRules.confirmPayment,
    PaymentController.confirmPayment
);

/**
 * Get payment/transaction status
 * GET /api/billing/payments/:transactionId
 */
router.get(
    '/payments/:transactionId',
    rateLimiter({ max: 100, windowMs: 60000 }),
    validationRules.getPaymentStatus,
    PaymentController.getPaymentStatus
);

/**
 * Get client payment history
 * GET /api/billing/payments/client/:clientId/history
 */
router.get(
    '/payments/client/:clientId/history',
    rateLimiter({ max: 50, windowMs: 60000 }),
    validationRules.getClientPaymentHistory,
    PaymentController.getClientPaymentHistory
);

// ============================================================================
// ADMIN-ONLY ROUTES
// ============================================================================

/**
 * Process refund for a transaction (admin only)
 * POST /api/billing/payments/:transactionId/refund
 */
router.post(
    '/payments/:transactionId/refund',
    authorize(['admin', 'finance_manager']),
    rateLimiter({ max: 10, windowMs: 60000 }), // 10 refunds per minute
    validationRules.processRefund,
    PaymentController.processRefund
);

// ============================================================================
// ROUTE DOCUMENTATION
// ============================================================================

/**
 * Routes Summary:
 *
 * PUBLIC:
 * POST   /api/billing/webhooks/stripe              - Stripe webhook handler
 *
 * AUTHENTICATED:
 * GET    /api/billing/packages                     - Get available packages
 * GET    /api/billing/credits/balance              - Get credit balance
 * POST   /api/billing/payments/intent              - Create payment intent
 * POST   /api/billing/payments/:id/confirm         - Confirm payment
 * GET    /api/billing/payments/:transactionId      - Get payment status
 * GET    /api/billing/payments/client/:id/history  - Get payment history
 *
 * ADMIN ONLY:
 * POST   /api/billing/payments/:id/refund          - Process refund
 */

module.exports = router;
