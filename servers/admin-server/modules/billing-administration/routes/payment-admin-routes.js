'use strict';

/**
 * @fileoverview Enterprise payment administration routes configuration
 * @module servers/admin-server/modules/billing-administration/routes/payment-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/billing-administration/controllers/payment-admin-controller
 * @requires module:shared/lib/middleware/auth/authenticate
 * @requires module:shared/lib/middleware/auth/authorize
 * @requires module:shared/lib/middleware/rate-limiting
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const router = express.Router();
const PaymentAdminController = require('../controllers/payment-admin-controller');
const { authenticate } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { authorize } = require('../../../../../shared/lib/auth/middleware/authorize');
const { rateLimit } = require('../../../../../shared/lib/middleware/rate-limiting');
const { requestLogger } = require('../../../../../shared/lib/middleware/logging/request-logger');
const { errorHandler } = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const { securityHeaders } = require('../../../../../shared/lib/middleware/security/security-headers');

// Initialize controller
const paymentController = new PaymentAdminController();

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

const transactionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 50
});

// ==================== Payment Processing Routes ====================

router.post('/process',
  authenticate,
  authorize(['admin.payment', 'payment.process']),
  transactionRateLimit,
  paymentController.processPayment
);

router.post('/authorize',
  authenticate,
  authorize(['admin.payment', 'payment.authorize']),
  transactionRateLimit,
  paymentController.authorizePayment
);

router.post('/capture',
  authenticate,
  authorize(['admin.payment', 'payment.capture']),
  transactionRateLimit,
  paymentController.capturePayment
);

router.post('/void',
  authenticate,
  authorize(['admin.payment', 'payment.void']),
  strictRateLimit,
  paymentController.voidPayment
);

router.post('/refund',
  authenticate,
  authorize(['admin.payment', 'payment.refund']),
  strictRateLimit,
  paymentController.refundPayment
);

router.post('/refund/partial',
  authenticate,
  authorize(['admin.payment', 'payment.refund.partial']),
  strictRateLimit,
  paymentController.processPartialRefund
);

router.post('/retry',
  authenticate,
  authorize(['admin.payment', 'payment.retry']),
  transactionRateLimit,
  paymentController.retryFailedPayment
);

router.post('/batch',
  authenticate,
  authorize(['admin.payment', 'payment.batch']),
  strictRateLimit,
  paymentController.batchProcessPayments
);

// ==================== Transaction Management Routes ====================

router.get('/transactions/:transactionId',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.read']),
  standardRateLimit,
  paymentController.getTransaction
);

router.get('/transactions',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.list']),
  standardRateLimit,
  paymentController.listTransactions
);

router.post('/transactions/search',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.search']),
  standardRateLimit,
  paymentController.searchTransactions
);

router.get('/transactions/:transactionId/details',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.details']),
  standardRateLimit,
  paymentController.getTransactionDetails
);

router.get('/transactions/:transactionId/history',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.history']),
  standardRateLimit,
  paymentController.getTransactionHistory
);

router.post('/transactions/export',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.export']),
  standardRateLimit,
  paymentController.exportTransactions
);

router.post('/transactions/reconcile',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.reconcile']),
  strictRateLimit,
  paymentController.reconcileTransactions
);

router.post('/transactions/:transactionId/dispute',
  authenticate,
  authorize(['admin.payment', 'payment.transaction.dispute']),
  standardRateLimit,
  paymentController.disputeTransaction
);

// ==================== Payment Method Routes ====================

router.post('/methods',
  authenticate,
  authorize(['admin.payment', 'payment.method.add']),
  standardRateLimit,
  paymentController.addPaymentMethod
);

router.put('/methods/:methodId',
  authenticate,
  authorize(['admin.payment', 'payment.method.update']),
  standardRateLimit,
  paymentController.updatePaymentMethod
);

router.delete('/methods/:methodId',
  authenticate,
  authorize(['admin.payment', 'payment.method.remove']),
  strictRateLimit,
  paymentController.removePaymentMethod
);

router.get('/methods',
  authenticate,
  authorize(['admin.payment', 'payment.method.list']),
  standardRateLimit,
  paymentController.listPaymentMethods
);

router.post('/methods/:methodId/default',
  authenticate,
  authorize(['admin.payment', 'payment.method.default']),
  standardRateLimit,
  paymentController.setDefaultPaymentMethod
);

router.post('/methods/:methodId/verify',
  authenticate,
  authorize(['admin.payment', 'payment.method.verify']),
  standardRateLimit,
  paymentController.verifyPaymentMethod
);

router.post('/methods/tokenize',
  authenticate,
  authorize(['admin.payment', 'payment.method.tokenize']),
  standardRateLimit,
  paymentController.tokenizeCard
);

router.post('/methods/validate-bank',
  authenticate,
  authorize(['admin.payment', 'payment.method.validate']),
  standardRateLimit,
  paymentController.validateBankAccount
);

// ==================== Subscription Payment Routes ====================

router.post('/subscriptions',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.create']),
  standardRateLimit,
  paymentController.createSubscription
);

router.put('/subscriptions/:subscriptionId',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.update']),
  standardRateLimit,
  paymentController.updateSubscription
);

router.delete('/subscriptions/:subscriptionId',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.cancel']),
  strictRateLimit,
  paymentController.cancelSubscription
);

router.post('/subscriptions/:subscriptionId/pause',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.pause']),
  standardRateLimit,
  paymentController.pauseSubscription
);

router.post('/subscriptions/:subscriptionId/resume',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.resume']),
  standardRateLimit,
  paymentController.resumeSubscription
);

router.get('/subscriptions',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.list']),
  standardRateLimit,
  paymentController.listSubscriptions
);

router.get('/subscriptions/:subscriptionId',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.read']),
  standardRateLimit,
  paymentController.getSubscriptionDetails
);

router.post('/subscriptions/:subscriptionId/retry',
  authenticate,
  authorize(['admin.payment', 'payment.subscription.retry']),
  transactionRateLimit,
  paymentController.retrySubscriptionPayment
);

// ==================== Gateway Management Routes ====================

router.post('/gateway/configure',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.configure']),
  strictRateLimit,
  paymentController.configureGateway
);

router.post('/gateway/test',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.test']),
  standardRateLimit,
  paymentController.testGatewayConnection
);

router.post('/gateway/switch',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.switch']),
  strictRateLimit,
  paymentController.switchGateway
);

router.get('/gateway/status',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.status']),
  standardRateLimit,
  paymentController.getGatewayStatus
);

router.put('/gateway/settings',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.settings']),
  strictRateLimit,
  paymentController.updateGatewaySettings
);

router.post('/gateway/webhooks',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.webhooks']),
  standardRateLimit,
  paymentController.configureWebhooks
);

router.post('/gateway/limits',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.limits']),
  strictRateLimit,
  paymentController.setGatewayLimits
);

router.get('/gateway/metrics',
  authenticate,
  authorize(['admin.payment', 'payment.gateway.metrics']),
  standardRateLimit,
  paymentController.getGatewayMetrics
);

// ==================== Settlement Routes ====================

router.get('/settlements',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.list']),
  standardRateLimit,
  paymentController.listSettlements
);

router.get('/settlements/:settlementId',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.read']),
  standardRateLimit,
  paymentController.getSettlementDetails
);

router.post('/settlements/:settlementId/reconcile',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.reconcile']),
  strictRateLimit,
  paymentController.reconcileSettlement
);

router.get('/settlements/report',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.report']),
  standardRateLimit,
  paymentController.generateSettlementReport
);

router.get('/settlements/payout-schedule',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.schedule']),
  standardRateLimit,
  paymentController.getPayoutSchedule
);

router.put('/settlements/bank-details',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.bank']),
  strictRateLimit,
  paymentController.updateBankDetails
);

router.get('/settlements/discrepancies',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.discrepancy']),
  standardRateLimit,
  paymentController.getSettlementDiscrepancies
);

router.post('/settlements/discrepancies/:discrepancyId/resolve',
  authenticate,
  authorize(['admin.payment', 'payment.settlement.resolve']),
  standardRateLimit,
  paymentController.resolveDiscrepancy
);

// ==================== Risk Management Routes ====================

router.post('/risk/assessment',
  authenticate,
  authorize(['admin.payment', 'payment.risk.assess']),
  standardRateLimit,
  paymentController.performRiskAssessment
);

router.put('/risk/rules',
  authenticate,
  authorize(['admin.payment', 'payment.risk.rules']),
  strictRateLimit,
  paymentController.updateRiskRules
);

router.post('/risk/fraud-check',
  authenticate,
  authorize(['admin.payment', 'payment.risk.fraud']),
  standardRateLimit,
  paymentController.checkFraudDetection
);

router.post('/risk/blacklist',
  authenticate,
  authorize(['admin.payment', 'payment.risk.blacklist']),
  strictRateLimit,
  paymentController.manageBlacklist
);

router.post('/risk/velocity-limits',
  authenticate,
  authorize(['admin.payment', 'payment.risk.velocity']),
  strictRateLimit,
  paymentController.setVelocityLimits
);

router.get('/risk/suspicious-activity',
  authenticate,
  authorize(['admin.payment', 'payment.risk.suspicious']),
  standardRateLimit,
  paymentController.getSuspiciousActivity
);

router.post('/risk/review/:transactionId',
  authenticate,
  authorize(['admin.payment', 'payment.risk.review']),
  standardRateLimit,
  paymentController.reviewTransaction
);

router.get('/risk/metrics',
  authenticate,
  authorize(['admin.payment', 'payment.risk.metrics']),
  standardRateLimit,
  paymentController.getRiskMetrics
);

// ==================== Compliance Routes ====================

router.post('/compliance/pci',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.pci']),
  strictRateLimit,
  paymentController.checkPCICompliance
);

router.put('/compliance/settings',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.settings']),
  strictRateLimit,
  paymentController.updateComplianceSettings
);

router.post('/compliance/kyc',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.kyc']),
  standardRateLimit,
  paymentController.performKYCVerification
);

router.post('/compliance/aml',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.aml']),
  standardRateLimit,
  paymentController.performAMLScreening
);

router.get('/compliance/report',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.report']),
  standardRateLimit,
  paymentController.generateComplianceReport
);

router.get('/compliance/audit-log',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.audit']),
  strictRateLimit,
  paymentController.getAuditLog
);

router.post('/compliance/data-retention',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.retention']),
  strictRateLimit,
  paymentController.manageDataRetention
);

router.post('/compliance/regulatory-report',
  authenticate,
  authorize(['admin.payment', 'payment.compliance.regulatory']),
  strictRateLimit,
  paymentController.generateRegulatoryReport
);

// ==================== Analytics Routes ====================

router.get('/analytics',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.read']),
  standardRateLimit,
  paymentController.getPaymentAnalytics
);

router.get('/analytics/revenue',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.revenue']),
  standardRateLimit,
  paymentController.getRevenueMetrics
);

router.get('/analytics/success-rates',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.success']),
  standardRateLimit,
  paymentController.getSuccessRates
);

router.get('/analytics/declines',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.decline']),
  standardRateLimit,
  paymentController.analyzeDeclines
);

router.get('/analytics/chargebacks',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.chargeback']),
  standardRateLimit,
  paymentController.analyzeChargebacks
);

router.get('/analytics/customer-insights',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.customer']),
  standardRateLimit,
  paymentController.getCustomerInsights
);

router.get('/analytics/trends',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.trends']),
  standardRateLimit,
  paymentController.analyzeTrends
);

router.post('/analytics/forecast',
  authenticate,
  authorize(['admin.payment', 'payment.analytics.forecast']),
  standardRateLimit,
  paymentController.forecastRevenue
);

// Generic payment request handler for action-based routing
router.post('/action/:action',
  authenticate,
  authorize(['admin.payment']),
  standardRateLimit,
  paymentController.handlePaymentRequest
);

// Apply error handler
router.use(errorHandler);

module.exports = router;