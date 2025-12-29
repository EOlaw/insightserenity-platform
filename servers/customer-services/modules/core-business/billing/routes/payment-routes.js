const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../../../../../../shared/lib/auth/middleware/authenticate');
const PaymentService = require('../services/payment-service');
const { body, validationResult } = require('express-validator');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'payment-routes'
});

/**
 * Payment Routes - Professional B2B Payment Processing
 * Handles package purchases, subscriptions, and Stripe webhooks
 */

/**
 * @route   POST /api/payments/process
 * @desc    Process one-time package purchase
 * @access  Private (Client only)
 */
router.post('/process',
  authenticate,
  requireRoles(['client']),
  [
    body('packageId').notEmpty().withMessage('Package ID is required'),
    body('paymentMethodId').notEmpty().withMessage('Payment method is required'),
    body('billingDetails.name').optional().isString(),
    body('billingDetails.email').optional().isEmail()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      logger.info(`[PaymentRoutes] Processing package purchase for client: ${req.user.clientId}`);

      const result = await PaymentService.processPackagePurchase({
        clientId: req.user.clientId,
        packageId: req.body.packageId,
        paymentMethodId: req.body.paymentMethodId,
        billingDetails: req.body.billingDetails,
        metadata: {
          userId: req.user._id.toString(),
          userEmail: req.user.email,
          ...req.body.metadata
        }
      });

      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: result
      });
    } catch (error) {
      logger.error('[PaymentRoutes] Payment processing failed:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/payments/subscribe
 * @desc    Create subscription for recurring packages
 * @access  Private (Client only)
 */
router.post('/subscribe',
  authenticate,
  requireRoles(['client']),
  [
    body('packageId').notEmpty().withMessage('Package ID is required'),
    body('paymentMethodId').notEmpty().withMessage('Payment method is required')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      logger.info(`[PaymentRoutes] Creating subscription for client: ${req.user.clientId}`);

      const result = await PaymentService.createSubscription(
        req.user.clientId,
        req.body.packageId,
        req.body.paymentMethodId,
        req.body.billingDetails
      );

      res.json({
        success: true,
        message: 'Subscription created successfully',
        data: result
      });
    } catch (error) {
      logger.error('[PaymentRoutes] Subscription creation failed:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/payments/subscriptions/:id/cancel
 * @desc    Cancel a subscription
 * @access  Private (Client only)
 */
router.post('/subscriptions/:id/cancel',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      logger.info(`[PaymentRoutes] Canceling subscription: ${req.params.id}`);

      const result = await PaymentService.cancelSubscription(
        req.user.clientId,
        req.params.id,
        req.body.cancelImmediately || false
      );

      res.json({
        success: true,
        message: 'Subscription canceled successfully',
        data: result
      });
    } catch (error) {
      logger.error('[PaymentRoutes] Subscription cancellation failed:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/payments/webhooks/stripe
 * @desc    Handle Stripe webhook events
 * @access  Public (Stripe only - verified via signature)
 */
router.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      const sig = req.headers['stripe-signature'];

      if (!sig) {
        logger.warn('[PaymentRoutes] Webhook received without signature');
        return res.status(400).send('Missing signature');
      }

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        logger.error('[PaymentRoutes] Webhook signature verification failed:', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      logger.info(`[PaymentRoutes] Webhook received: ${event.type}`);

      // Handle the event
      await PaymentService.handleWebhook(event);

      res.json({ received: true });
    } catch (error) {
      logger.error('[PaymentRoutes] Webhook processing failed:', error);
      next(error);
    }
  }
);

/**
 * @route   GET /api/payments/methods
 * @desc    Get client's saved payment methods
 * @access  Private (Client only)
 */
router.get('/methods',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      const Client = require('../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
      const client = await Client.findById(req.user.clientId);

      if (!client || !client.billing?.stripeCustomerId) {
        return res.json({
          success: true,
          data: { paymentMethods: [] }
        });
      }

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentMethods = await stripe.paymentMethods.list({
        customer: client.billing.stripeCustomerId,
        type: 'card'
      });

      res.json({
        success: true,
        data: {
          paymentMethods: paymentMethods.data.map(pm => ({
            id: pm.id,
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year
          }))
        }
      });
    } catch (error) {
      logger.error('[PaymentRoutes] Failed to fetch payment methods:', error);
      next(error);
    }
  }
);

module.exports = router;
