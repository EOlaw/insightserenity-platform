'use strict';

/**
 * @fileoverview Enterprise subscription administration routes configuration
 * @module servers/admin-server/modules/billing-administration/routes/subscription-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/billing-administration/controllers/subscription-admin-controller
 * @requires module:shared/lib/middleware/auth/authenticate
 * @requires module:shared/lib/middleware/auth/authorize
 * @requires module:shared/lib/middleware/rate-limiting
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const router = express.Router();
const SubscriptionAdminController = require('../controllers/subscription-admin-controller');
const { authenticate } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { authorize } = require('../../../../../shared/lib/auth/middleware/authorize');
const { rateLimit } = require('../../../../../shared/lib/middleware/rate-limiting');
const { requestLogger } = require('../../../../../shared/lib/middleware/logging/request-logger');
const { errorHandler } = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const { securityHeaders } = require('../../../../../shared/lib/middleware/security/security-headers');

// Initialize controller
const subscriptionController = new SubscriptionAdminController();

// Apply global middleware
router.use(requestLogger);
router.use(securityHeaders);

// Rate limiting configuration
const standardRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});

const strictRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});

const bulkRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});

// ==================== Subscription Lifecycle Routes ====================

router.post('/',
  authenticate,
  authorize(['admin.subscription', 'subscription.create']),
  standardRateLimit,
  subscriptionController.createSubscription
);

router.post('/:subscriptionId/activate',
  authenticate,
  authorize(['admin.subscription', 'subscription.activate']),
  standardRateLimit,
  subscriptionController.activateSubscription
);

router.post('/:subscriptionId/pause',
  authenticate,
  authorize(['admin.subscription', 'subscription.pause']),
  standardRateLimit,
  subscriptionController.pauseSubscription
);

router.post('/:subscriptionId/resume',
  authenticate,
  authorize(['admin.subscription', 'subscription.resume']),
  standardRateLimit,
  subscriptionController.resumeSubscription
);

router.delete('/:subscriptionId',
  authenticate,
  authorize(['admin.subscription', 'subscription.cancel']),
  strictRateLimit,
  subscriptionController.cancelSubscription
);

router.post('/:subscriptionId/reactivate',
  authenticate,
  authorize(['admin.subscription', 'subscription.reactivate']),
  standardRateLimit,
  subscriptionController.reactivateSubscription
);

router.post('/:subscriptionId/expire',
  authenticate,
  authorize(['admin.subscription', 'subscription.expire']),
  strictRateLimit,
  subscriptionController.expireSubscription
);

router.post('/:subscriptionId/terminate',
  authenticate,
  authorize(['admin.subscription', 'subscription.terminate']),
  strictRateLimit,
  subscriptionController.terminateSubscription
);

// ==================== Subscription Management Routes ====================

router.get('/:subscriptionId',
  authenticate,
  authorize(['admin.subscription', 'subscription.read']),
  standardRateLimit,
  subscriptionController.getSubscription
);

router.get('/',
  authenticate,
  authorize(['admin.subscription', 'subscription.list']),
  standardRateLimit,
  subscriptionController.listSubscriptions
);

router.put('/:subscriptionId',
  authenticate,
  authorize(['admin.subscription', 'subscription.update']),
  standardRateLimit,
  subscriptionController.updateSubscription
);

router.post('/search',
  authenticate,
  authorize(['admin.subscription', 'subscription.search']),
  standardRateLimit,
  subscriptionController.searchSubscriptions
);

router.get('/:subscriptionId/history',
  authenticate,
  authorize(['admin.subscription', 'subscription.history']),
  standardRateLimit,
  subscriptionController.getSubscriptionHistory
);

router.get('/:subscriptionId/timeline',
  authenticate,
  authorize(['admin.subscription', 'subscription.timeline']),
  standardRateLimit,
  subscriptionController.getSubscriptionTimeline
);

router.get('/:subscriptionId/details',
  authenticate,
  authorize(['admin.subscription', 'subscription.details']),
  standardRateLimit,
  subscriptionController.getSubscriptionDetails
);

router.post('/bulk-update',
  authenticate,
  authorize(['admin.subscription', 'subscription.bulk']),
  bulkRateLimit,
  subscriptionController.bulkUpdateSubscriptions
);

// ==================== Plan Management Routes ====================

router.post('/:subscriptionId/upgrade',
  authenticate,
  authorize(['admin.subscription', 'subscription.upgrade']),
  standardRateLimit,
  subscriptionController.upgradePlan
);

router.post('/:subscriptionId/downgrade',
  authenticate,
  authorize(['admin.subscription', 'subscription.downgrade']),
  standardRateLimit,
  subscriptionController.downgradePlan
);

router.post('/:subscriptionId/change-plan',
  authenticate,
  authorize(['admin.subscription', 'subscription.change']),
  standardRateLimit,
  subscriptionController.changePlan
);

router.post('/:subscriptionId/preview-change',
  authenticate,
  authorize(['admin.subscription', 'subscription.preview']),
  standardRateLimit,
  subscriptionController.previewPlanChange
);

router.post('/:subscriptionId/addons',
  authenticate,
  authorize(['admin.subscription', 'subscription.addon.add']),
  standardRateLimit,
  subscriptionController.addAddon
);

router.delete('/:subscriptionId/addons/:addonId',
  authenticate,
  authorize(['admin.subscription', 'subscription.addon.remove']),
  standardRateLimit,
  subscriptionController.removeAddon
);

router.put('/:subscriptionId/addons/:addonId',
  authenticate,
  authorize(['admin.subscription', 'subscription.addon.update']),
  standardRateLimit,
  subscriptionController.updateAddon
);

router.get('/:subscriptionId/addons',
  authenticate,
  authorize(['admin.subscription', 'subscription.addon.list']),
  standardRateLimit,
  subscriptionController.listAddons
);

// ==================== Trial Management Routes ====================

router.post('/trial/start',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.start']),
  standardRateLimit,
  subscriptionController.startTrial
);

router.post('/:subscriptionId/trial/extend',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.extend']),
  standardRateLimit,
  subscriptionController.extendTrial
);

router.post('/:subscriptionId/trial/end',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.end']),
  standardRateLimit,
  subscriptionController.endTrial
);

router.post('/:subscriptionId/trial/convert',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.convert']),
  standardRateLimit,
  subscriptionController.convertTrial
);

router.delete('/:subscriptionId/trial',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.cancel']),
  standardRateLimit,
  subscriptionController.cancelTrial
);

router.get('/:subscriptionId/trial/status',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.status']),
  standardRateLimit,
  subscriptionController.getTrialStatus
);

router.get('/trial/analytics',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.analytics']),
  standardRateLimit,
  subscriptionController.getTrialAnalytics
);

router.post('/trial/optimize',
  authenticate,
  authorize(['admin.subscription', 'subscription.trial.optimize']),
  standardRateLimit,
  subscriptionController.optimizeTrialDuration
);

// ==================== Renewal Operations Routes ====================

router.post('/:subscriptionId/renew',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.process']),
  standardRateLimit,
  subscriptionController.processRenewal
);

router.post('/:subscriptionId/renewal/schedule',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.schedule']),
  standardRateLimit,
  subscriptionController.scheduleRenewal
);

router.get('/:subscriptionId/renewal/preview',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.preview']),
  standardRateLimit,
  subscriptionController.previewRenewal
);

router.put('/:subscriptionId/renewal/settings',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.settings']),
  standardRateLimit,
  subscriptionController.updateRenewalSettings
);

router.post('/:subscriptionId/renewal/disable',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.disable']),
  standardRateLimit,
  subscriptionController.disableAutoRenewal
);

router.post('/:subscriptionId/renewal/enable',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.enable']),
  standardRateLimit,
  subscriptionController.enableAutoRenewal
);

router.post('/:subscriptionId/renewal/discount',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.discount']),
  standardRateLimit,
  subscriptionController.applyRenewalDiscount
);

router.post('/renewals/batch',
  authenticate,
  authorize(['admin.subscription', 'subscription.renewal.batch']),
  bulkRateLimit,
  subscriptionController.processBatchRenewals
);

// ==================== Usage Tracking Routes ====================

router.post('/:subscriptionId/usage',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.track']),
  standardRateLimit,
  subscriptionController.trackUsage
);

router.get('/:subscriptionId/usage',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.read']),
  standardRateLimit,
  subscriptionController.getUsage
);

router.put('/:subscriptionId/usage/limits',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.limits']),
  standardRateLimit,
  subscriptionController.updateUsageLimits
);

router.get('/:subscriptionId/usage/overage',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.overage']),
  standardRateLimit,
  subscriptionController.calculateOverage
);

router.post('/:subscriptionId/usage/overage/apply',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.charge']),
  standardRateLimit,
  subscriptionController.applyOverageCharges
);

router.post('/:subscriptionId/usage/reset',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.reset']),
  strictRateLimit,
  subscriptionController.resetUsage
);

router.get('/:subscriptionId/usage/report',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.report']),
  standardRateLimit,
  subscriptionController.generateUsageReport
);

router.get('/:subscriptionId/usage/trends',
  authenticate,
  authorize(['admin.subscription', 'subscription.usage.trends']),
  standardRateLimit,
  subscriptionController.analyzeUsageTrends
);

// ==================== Billing Cycle Operations Routes ====================

router.put('/:subscriptionId/billing-cycle',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.cycle']),
  standardRateLimit,
  subscriptionController.updateBillingCycle
);

router.post('/:subscriptionId/proration/calculate',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.proration']),
  standardRateLimit,
  subscriptionController.calculateProration
);

router.post('/:subscriptionId/proration/apply',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.proration']),
  standardRateLimit,
  subscriptionController.applyProration
);

router.post('/billing/sync-dates',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.sync']),
  standardRateLimit,
  subscriptionController.syncBillingDates
);

router.get('/:subscriptionId/billing/preview',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.preview']),
  standardRateLimit,
  subscriptionController.previewBilling
);

router.post('/:subscriptionId/billing/process',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.process']),
  standardRateLimit,
  subscriptionController.processBillingCycle
);

router.post('/:subscriptionId/billing/skip',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.skip']),
  strictRateLimit,
  subscriptionController.skipBillingCycle
);

router.get('/:subscriptionId/billing/schedule',
  authenticate,
  authorize(['admin.subscription', 'subscription.billing.schedule']),
  standardRateLimit,
  subscriptionController.getBillingSchedule
);

// ==================== Revenue Metrics Routes ====================

router.get('/metrics/mrr',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.mrr']),
  standardRateLimit,
  subscriptionController.calculateMRR
);

router.get('/metrics/arr',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.arr']),
  standardRateLimit,
  subscriptionController.calculateARR
);

router.get('/metrics/ltv',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.ltv']),
  standardRateLimit,
  subscriptionController.calculateLTV
);

router.get('/metrics/churn',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.churn']),
  standardRateLimit,
  subscriptionController.calculateChurn
);

router.post('/metrics/forecast',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.forecast']),
  standardRateLimit,
  subscriptionController.forecastRevenue
);

router.post('/metrics/revenue-recognition',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.recognize']),
  standardRateLimit,
  subscriptionController.recognizeRevenue
);

router.get('/metrics/deferred-revenue',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.deferred']),
  standardRateLimit,
  subscriptionController.calculateDeferredRevenue
);

router.get('/metrics/expansion-revenue',
  authenticate,
  authorize(['admin.subscription', 'subscription.metrics.expansion']),
  standardRateLimit,
  subscriptionController.analyzeExpansionRevenue
);

// ==================== Customer Retention Routes ====================

router.get('/retention/churn-risk',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.risk']),
  standardRateLimit,
  subscriptionController.identifyChurnRisk
);

router.post('/retention/prevent-churn',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.prevent']),
  standardRateLimit,
  subscriptionController.preventChurn
);

router.post('/retention/win-back',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.winback']),
  standardRateLimit,
  subscriptionController.winBackCustomer
);

router.post('/:subscriptionId/retention/offer',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.offer']),
  standardRateLimit,
  subscriptionController.createRetentionOffer
);

router.get('/retention/cancellation-analysis',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.analysis']),
  standardRateLimit,
  subscriptionController.analyzeCancellationReasons
);

router.get('/retention/metrics',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.metrics']),
  standardRateLimit,
  subscriptionController.getRetentionMetrics
);

router.post('/retention/segment',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.segment']),
  standardRateLimit,
  subscriptionController.segmentCustomers
);

router.post('/retention/personalize',
  authenticate,
  authorize(['admin.subscription', 'subscription.retention.personalize']),
  standardRateLimit,
  subscriptionController.personalizeRetentionStrategy
);

// ==================== Analytics & Reporting Routes ====================

router.get('/analytics',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.read']),
  standardRateLimit,
  subscriptionController.getSubscriptionAnalytics
);

router.get('/analytics/growth',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.growth']),
  standardRateLimit,
  subscriptionController.getGrowthMetrics
);

router.get('/analytics/cohort',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.cohort']),
  standardRateLimit,
  subscriptionController.performCohortAnalysis
);

router.get('/analytics/plan-performance',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.plan']),
  standardRateLimit,
  subscriptionController.analyzePlanPerformance
);

router.get('/reports/subscription',
  authenticate,
  authorize(['admin.subscription', 'subscription.reports.generate']),
  standardRateLimit,
  subscriptionController.generateSubscriptionReport
);

router.post('/export',
  authenticate,
  authorize(['admin.subscription', 'subscription.export']),
  standardRateLimit,
  subscriptionController.exportSubscriptions
);

router.get('/analytics/benchmark',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.benchmark']),
  standardRateLimit,
  subscriptionController.benchmarkMetrics
);

router.get('/analytics/predictive',
  authenticate,
  authorize(['admin.subscription', 'subscription.analytics.predict']),
  standardRateLimit,
  subscriptionController.getPredictiveAnalytics
);

// Generic subscription request handler for action-based routing
router.post('/action/:action',
  authenticate,
  authorize(['admin.subscription']),
  standardRateLimit,
  subscriptionController.handleSubscriptionRequest
);

// Apply error handler
router.use(errorHandler);

module.exports = router;