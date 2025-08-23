'use strict';

/**
 * @fileoverview Enterprise subscription management routes with comprehensive billing API endpoints
 * @module servers/admin-server/modules/organization-management/routes/subscription-management-routes
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/controllers/subscription-management-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/security/rate-limit
 * @requires module:shared/lib/middleware/cors-middleware
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 */

const express = require('express');
const router = express.Router();
const SubscriptionManagementController = require('../controllers/subscription-management-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/security/rate-limit');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');

// Initialize controller
const subscriptionController = new SubscriptionManagementController();

// Initialize controller on module load
(async () => {
  try {
    await subscriptionController.initialize();
  } catch (error) {
    console.error('Failed to initialize SubscriptionManagementController:', error);
    process.exit(1);
  }
})();

/**
 * Apply global middleware to all subscription routes
 */
router.use(corsMiddleware());
router.use(authenticate);
router.use(auditLogger('subscription-management'));

/**
 * @route GET /api/admin/subscriptions
 * @description List all subscriptions with filtering and pagination
 * @access Platform Admin, Billing Admin
 * @queryParams {Number} page - Page number for pagination
 * @queryParams {Number} limit - Number of items per page
 * @queryParams {String} status - Filter by subscription status
 * @queryParams {String} planType - Filter by plan type
 * @queryParams {String} sortBy - Field to sort by
 * @queryParams {String} sortOrder - Sort order (asc/desc)
 */
router.get(
  '/',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'SUBSCRIPTION_VIEWER']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateQuery({
    page: { type: 'number', min: 1 },
    limit: { type: 'number', min: 1, max: 100 },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'TRIAL'] },
    planType: { type: 'string' },
    sortBy: { type: 'string' },
    sortOrder: { type: 'string', enum: ['asc', 'desc'] }
  }),
  asyncErrorHandler(subscriptionController.listSubscriptions)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId
 * @description Get detailed information about a specific subscription
 * @access Platform Admin, Billing Admin, Organization Admin
 * @params {String} subscriptionId - Subscription identifier
 */
router.get(
  '/:subscriptionId',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.getSubscriptionDetails)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/health
 * @description Get subscription health metrics
 * @access Platform Admin, Billing Admin
 * @params {String} subscriptionId - Subscription identifier
 */
router.get(
  '/:subscriptionId/health',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.getSubscriptionHealth)
);

/**
 * @route GET /api/admin/organizations/:organizationId/billing-dashboard
 * @description Get billing dashboard data for an organization
 * @access Platform Admin, Billing Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @queryParams {String} period - Time period for metrics
 */
router.get(
  '/organizations/:organizationId/billing-dashboard',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    period: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] }
  }),
  asyncErrorHandler(subscriptionController.getBillingDashboard)
);

/**
 * @route POST /api/admin/subscriptions/workflow/:workflowType
 * @description Execute subscription workflow
 * @access Platform Admin, Billing Admin
 * @params {String} workflowType - Type of workflow to execute
 */
router.post(
  '/workflow/:workflowType',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    workflowType: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.executeSubscriptionWorkflow)
);

// ==================== Subscription Lifecycle Routes ====================

/**
 * @route POST /api/admin/subscriptions/action/create
 * @description Create a new subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/action/create',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateBody({
    organizationId: { type: 'string', required: true },
    plan: { type: 'object', required: true },
    billingDetails: { type: 'object', required: true },
    paymentMethod: { type: 'object', required: true },
    startDate: { type: 'date' },
    trialDays: { type: 'number', min: 0, max: 90 }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/activate
 * @description Activate a subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/activate',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/suspend
 * @description Suspend a subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/suspend',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    suspensionType: { type: 'string', enum: ['PAYMENT_FAILED', 'POLICY_VIOLATION', 'REQUESTED'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/cancel
 * @description Cancel a subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/cancel',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    immediateCancel: { type: 'boolean' },
    refundRemaining: { type: 'boolean' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/reactivate
 * @description Reactivate a suspended or cancelled subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/reactivate',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/renew
 * @description Renew a subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/renew',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    renewalPeriod: { type: 'string', enum: ['MONTHLY', 'QUARTERLY', 'ANNUALLY'] },
    autoRenew: { type: 'boolean' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/expire
 * @description Mark subscription as expired
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/expire',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/terminate
 * @description Terminate a subscription permanently
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/terminate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    deleteData: { type: 'boolean' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Plan Management Routes ====================

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/upgrade-plan
 * @description Upgrade subscription plan
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/upgrade-plan',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    newPlan: { type: 'object', required: true },
    effectiveDate: { type: 'date' },
    prorationBehavior: { type: 'string', enum: ['CREATE_PRORATIONS', 'NONE', 'ALWAYS_INVOICE'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/downgrade-plan
 * @description Downgrade subscription plan
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/downgrade-plan',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    newPlan: { type: 'object', required: true },
    effectiveDate: { type: 'date' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/change-plan
 * @description Change subscription plan
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/change-plan',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    newPlan: { type: 'object', required: true },
    changeType: { type: 'string', enum: ['IMMEDIATE', 'END_OF_BILLING_PERIOD'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/add-addon
 * @description Add addon to subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/add-addon',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    addonId: { type: 'string', required: true },
    quantity: { type: 'number', min: 1 },
    pricing: { type: 'object' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/remove-addon
 * @description Remove addon from subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/remove-addon',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    addonId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/customize-plan
 * @description Customize subscription plan
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/customize-plan',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    customizations: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/apply-discount
 * @description Apply discount to subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/apply-discount',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    discountType: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'], required: true },
    value: { type: 'number', required: true },
    duration: { type: 'string', enum: ['ONCE', 'REPEATING', 'FOREVER'] },
    durationInMonths: { type: 'number' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/remove-discount
 * @description Remove discount from subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/remove-discount',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    discountId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Trial Management Routes ====================

/**
 * @route POST /api/admin/subscriptions/action/start-trial
 * @description Start a trial subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/action/start-trial',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateBody({
    organizationId: { type: 'string', required: true },
    trialDays: { type: 'number', min: 1, max: 90 },
    plan: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/extend-trial
 * @description Extend trial period
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/extend-trial',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    additionalDays: { type: 'number', min: 1, max: 30, required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/convert-trial
 * @description Convert trial to paid subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/convert-trial',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    paymentMethod: { type: 'object', required: true },
    billingCycle: { type: 'string', enum: ['MONTHLY', 'QUARTERLY', 'ANNUALLY'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/end-trial
 * @description End trial period
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/end-trial',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/cancel-trial
 * @description Cancel trial subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/cancel-trial',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Billing Routes ====================

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/process-payment
 * @description Process subscription payment
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/process-payment',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    amount: { type: 'number' },
    period: { type: 'string' },
    processImmediately: { type: 'boolean' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/retry-payment
 * @description Retry failed payment
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/retry-payment',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    paymentId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/refund-payment
 * @description Refund payment
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/refund-payment',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    paymentId: { type: 'string', required: true },
    amount: { type: 'number' },
    reason: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/update-payment-method
 * @description Update payment method
 * @access Platform Admin, Billing Admin, Organization Admin
 */
router.post(
  '/:subscriptionId/action/update-payment-method',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    paymentMethod: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/generate-invoice
 * @description Generate invoice
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/generate-invoice',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    period: { type: 'string' },
    items: { type: 'array' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/send-invoice
 * @description Send invoice to customer
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/send-invoice',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    invoiceId: { type: 'string', required: true },
    recipients: { type: 'array' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/apply-credit
 * @description Apply credit to subscription
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/apply-credit',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    amount: { type: 'number', required: true },
    description: { type: 'string' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/calculate-charges
 * @description Calculate subscription charges
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/calculate-charges',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    period: { type: 'string' },
    includeUsage: { type: 'boolean' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Usage Tracking Routes ====================

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/track-usage
 * @description Track usage metrics
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/track-usage',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    metric: { type: 'string', required: true },
    value: { type: 'number', required: true },
    timestamp: { type: 'date' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/calculate-overage
 * @description Calculate usage overage
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/calculate-overage',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/reset-usage
 * @description Reset usage counters
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/reset-usage',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    metrics: { type: 'array' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/update-quotas
 * @description Update usage quotas
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/update-quotas',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    quotas: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/check-limits
 * @description Check usage limits
 * @access Platform Admin, Billing Admin, Organization Admin
 */
router.get(
  '/:subscriptionId/action/check-limits',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/enforce-limits
 * @description Enforce usage limits
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/enforce-limits',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    enforcementLevel: { type: 'string', enum: ['SOFT', 'HARD'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/usage-alert
 * @description Send usage alert
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/usage-alert',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    alertType: { type: 'string', required: true },
    threshold: { type: 'number' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/usage-report
 * @description Generate usage report
 * @access Platform Admin, Billing Admin, Organization Admin
 */
router.get(
  '/:subscriptionId/action/usage-report',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    startDate: { type: 'date' },
    endDate: { type: 'date' },
    metrics: { type: 'array' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Revenue Analytics Routes ====================

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/calculate-mrr
 * @description Calculate Monthly Recurring Revenue
 * @access Platform Admin, Billing Admin
 */
router.get(
  '/:subscriptionId/action/calculate-mrr',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/calculate-arr
 * @description Calculate Annual Recurring Revenue
 * @access Platform Admin, Billing Admin
 */
router.get(
  '/:subscriptionId/action/calculate-arr',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/calculate-ltv
 * @description Calculate Customer Lifetime Value
 * @access Platform Admin, Billing Admin
 */
router.get(
  '/:subscriptionId/action/calculate-ltv',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/analyze-churn
 * @description Analyze churn risk
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/analyze-churn',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/action/forecast-revenue
 * @description Forecast revenue
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/action/forecast-revenue',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    period: { type: 'string', required: true },
    model: { type: 'string', enum: ['LINEAR', 'EXPONENTIAL', 'SEASONAL'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/action/revenue-report
 * @description Generate revenue report
 * @access Platform Admin, Billing Admin
 */
router.get(
  '/action/revenue-report',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateQuery({
    startDate: { type: 'date', required: true },
    endDate: { type: 'date', required: true },
    groupBy: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/action/cohort-analysis
 * @description Perform cohort analysis
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/action/cohort-analysis',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    cohortPeriod: { type: 'string', required: true },
    metrics: { type: 'array', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/track-expansion
 * @description Track revenue expansion
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/track-expansion',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

// ==================== Contract Management Routes ====================

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/create-contract
 * @description Create subscription contract
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/create-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractTerms: { type: 'object', required: true },
    startDate: { type: 'date', required: true },
    endDate: { type: 'date', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/update-contract
 * @description Update contract terms
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/update-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true },
    updates: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/sign-contract
 * @description Sign contract
 * @access Platform Admin, Billing Admin, Organization Admin
 */
router.post(
  '/:subscriptionId/action/sign-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true },
    signatureData: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/amend-contract
 * @description Amend contract
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/amend-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true },
    amendments: { type: 'object', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/renew-contract
 * @description Renew contract
 * @access Platform Admin, Billing Admin
 */
router.post(
  '/:subscriptionId/action/renew-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true },
    renewalTerms: { type: 'object' }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/terminate-contract
 * @description Terminate contract
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/terminate-contract',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true },
    reason: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route GET /api/admin/subscriptions/:subscriptionId/action/export-contract
 * @description Export contract document
 * @access Platform Admin, Billing Admin, Organization Admin
 */
router.get(
  '/:subscriptionId/action/export-contract',
  authorize(['PLATFORM_ADMIN', 'BILLING_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    contractId: { type: 'string', required: true },
    format: { type: 'string', enum: ['PDF', 'DOCX', 'HTML'] }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

/**
 * @route POST /api/admin/subscriptions/:subscriptionId/action/archive-contract
 * @description Archive contract
 * @access Platform Admin
 */
router.post(
  '/:subscriptionId/action/archive-contract',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    subscriptionId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    contractId: { type: 'string', required: true }
  }),
  asyncErrorHandler(subscriptionController.handleSubscriptionRequest)
);

module.exports = router;