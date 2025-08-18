'use strict';

/**
 * @fileoverview Enterprise billing administration routes configuration
 * @module servers/admin-server/modules/billing-administration/routes/billing-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/billing-administration/controllers/billing-admin-controller
 * @requires module:shared/lib/middleware/auth/authenticate
 * @requires module:shared/lib/middleware/auth/authorize
 * @requires module:shared/lib/middleware/rate-limiting
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/compression-config
 * @requires module:shared/lib/middleware/cors-middleware
 */

const express = require('express');
const router = express.Router();
const BillingAdminController = require('../controllers/billing-admin-controller');
const { authenticate } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { authorize } = require('../../../../../shared/lib/auth/middleware/authorize');
const { rateLimit } = require('../../../../../shared/lib/middleware/rate-limiting');
const { requestLogger } = require('../../../../../shared/lib/middleware/logging/request-logger');
const { errorHandler } = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const { securityHeaders } = require('../../../../../shared/lib/middleware/security/security-headers');
const { compression } = require('../../../../../shared/lib/middleware/compression-config');
const { corsMiddleware } = require('../../../../../shared/lib/middleware/cors-middleware');

// Initialize controller
const billingController = new BillingAdminController();

// Apply global middleware
router.use(requestLogger);
router.use(securityHeaders);
router.use(compression);
router.use(corsMiddleware);

// Rate limiting configuration
const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

const strictRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20 // 20 requests per minute for sensitive operations
});

const bulkRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10 // 10 requests per minute for bulk operations
});

// ==================== Billing Account Management Routes ====================

router.post('/accounts',
  authenticate,
  authorize(['admin.billing', 'billing.account.create']),
  standardRateLimit,
  billingController.createBillingAccount
);

router.get('/accounts/:billingAccountId',
  authenticate,
  authorize(['admin.billing', 'billing.account.read']),
  standardRateLimit,
  billingController.getBillingAccount
);

router.put('/accounts/:billingAccountId',
  authenticate,
  authorize(['admin.billing', 'billing.account.update']),
  standardRateLimit,
  billingController.updateBillingAccount
);

router.get('/accounts',
  authenticate,
  authorize(['admin.billing', 'billing.account.list']),
  standardRateLimit,
  billingController.listBillingAccounts
);

router.post('/accounts/:billingAccountId/suspend',
  authenticate,
  authorize(['admin.billing', 'billing.account.suspend']),
  strictRateLimit,
  billingController.suspendBillingAccount
);

router.post('/accounts/:billingAccountId/reactivate',
  authenticate,
  authorize(['admin.billing', 'billing.account.reactivate']),
  strictRateLimit,
  billingController.reactivateBillingAccount
);

router.delete('/accounts/:billingAccountId',
  authenticate,
  authorize(['admin.billing', 'billing.account.close']),
  strictRateLimit,
  billingController.closeBillingAccount
);

router.post('/accounts/merge',
  authenticate,
  authorize(['admin.billing', 'billing.account.merge']),
  strictRateLimit,
  billingController.mergeBillingAccounts
);

// ==================== Revenue Management Routes ====================

router.get('/metrics/mrr',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.calculateMRR
);

router.get('/metrics/arr',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.calculateARR
);

router.get('/metrics/ltv',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.calculateLTV
);

router.get('/metrics/churn',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.analyzeChurn
);

router.post('/metrics/forecast',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.forecast']),
  standardRateLimit,
  billingController.forecastRevenue
);

router.get('/metrics/cohort',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.generateCohortAnalysis
);

router.get('/metrics/cac',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.calculateCAC
);

router.get('/metrics/retention',
  authenticate,
  authorize(['admin.billing', 'billing.metrics.read']),
  standardRateLimit,
  billingController.analyzeRevenueRetention
);

// ==================== Pricing Management Routes ====================

router.post('/pricing/plans',
  authenticate,
  authorize(['admin.billing', 'billing.pricing.create']),
  standardRateLimit,
  billingController.createPricingPlan
);

router.put('/pricing/plans/:planId',
  authenticate,
  authorize(['admin.billing', 'billing.pricing.update']),
  standardRateLimit,
  billingController.updatePricingPlan
);

router.delete('/pricing/plans/:planId',
  authenticate,
  authorize(['admin.billing', 'billing.pricing.archive']),
  strictRateLimit,
  billingController.archivePricingPlan
);

router.get('/pricing/plans',
  authenticate,
  authorize(['admin.billing', 'billing.pricing.read']),
  standardRateLimit,
  billingController.listPricingPlans
);

router.post('/pricing/discount',
  authenticate,
  authorize(['admin.billing', 'billing.discount.apply']),
  standardRateLimit,
  billingController.applyDiscount
);

router.delete('/pricing/discount/:discountId',
  authenticate,
  authorize(['admin.billing', 'billing.discount.remove']),
  standardRateLimit,
  billingController.removeDiscount
);

router.post('/pricing/promotion',
  authenticate,
  authorize(['admin.billing', 'billing.promotion.create']),
  standardRateLimit,
  billingController.createPromotion
);

router.post('/pricing/calculate',
  authenticate,
  authorize(['admin.billing', 'billing.pricing.calculate']),
  standardRateLimit,
  billingController.calculatePricing
);

// ==================== Tax Management Routes ====================

router.post('/tax/calculate',
  authenticate,
  authorize(['admin.billing', 'billing.tax.calculate']),
  standardRateLimit,
  billingController.calculateTax
);

router.put('/tax/configuration',
  authenticate,
  authorize(['admin.billing', 'billing.tax.configure']),
  strictRateLimit,
  billingController.updateTaxConfiguration
);

router.post('/tax/file-return',
  authenticate,
  authorize(['admin.billing', 'billing.tax.file']),
  strictRateLimit,
  billingController.fileTaxReturn
);

router.get('/tax/report',
  authenticate,
  authorize(['admin.billing', 'billing.tax.report']),
  standardRateLimit,
  billingController.generateTaxReport
);

router.put('/tax/exemption',
  authenticate,
  authorize(['admin.billing', 'billing.tax.exemption']),
  standardRateLimit,
  billingController.updateTaxExemption
);

router.post('/tax/sync-rates',
  authenticate,
  authorize(['admin.billing', 'billing.tax.sync']),
  standardRateLimit,
  billingController.syncTaxRates
);

router.post('/tax/validate',
  authenticate,
  authorize(['admin.billing', 'billing.tax.validate']),
  standardRateLimit,
  billingController.validateTaxNumber
);

router.post('/tax/nexus',
  authenticate,
  authorize(['admin.billing', 'billing.tax.nexus']),
  standardRateLimit,
  billingController.calculateNexus
);

// ==================== Financial Reporting Routes ====================

router.get('/reports/revenue',
  authenticate,
  authorize(['admin.billing', 'billing.reports.read']),
  standardRateLimit,
  billingController.generateRevenueReport
);

router.get('/reports/billing',
  authenticate,
  authorize(['admin.billing', 'billing.reports.read']),
  standardRateLimit,
  billingController.generateBillingReport
);

router.get('/reports/financial-summary',
  authenticate,
  authorize(['admin.billing', 'billing.reports.read']),
  standardRateLimit,
  billingController.generateFinancialSummary
);

router.get('/reports/audit',
  authenticate,
  authorize(['admin.billing', 'billing.reports.audit']),
  strictRateLimit,
  billingController.generateAuditReport
);

router.get('/reports/compliance',
  authenticate,
  authorize(['admin.billing', 'billing.reports.compliance']),
  strictRateLimit,
  billingController.generateComplianceReport
);

router.get('/reports/sox',
  authenticate,
  authorize(['admin.billing', 'billing.reports.sox']),
  strictRateLimit,
  billingController.generateSOXReport
);

router.post('/reports/reconcile',
  authenticate,
  authorize(['admin.billing', 'billing.reports.reconcile']),
  strictRateLimit,
  billingController.reconcileAccounts
);

router.post('/reports/export',
  authenticate,
  authorize(['admin.billing', 'billing.reports.export']),
  standardRateLimit,
  billingController.exportFinancialData
);

// ==================== Collections Management Routes ====================

router.post('/collections/initiate',
  authenticate,
  authorize(['admin.billing', 'billing.collections.initiate']),
  standardRateLimit,
  billingController.initiateCollection
);

router.post('/collections/reminder',
  authenticate,
  authorize(['admin.billing', 'billing.collections.reminder']),
  standardRateLimit,
  billingController.sendPaymentReminder
);

router.post('/collections/escalate',
  authenticate,
  authorize(['admin.billing', 'billing.collections.escalate']),
  strictRateLimit,
  billingController.escalateCollection
);

router.post('/collections/write-off',
  authenticate,
  authorize(['admin.billing', 'billing.collections.writeoff']),
  strictRateLimit,
  billingController.writeOffDebt
);

router.post('/collections/payment-plan',
  authenticate,
  authorize(['admin.billing', 'billing.collections.negotiate']),
  standardRateLimit,
  billingController.negotiatePaymentPlan
);

router.put('/collections/status',
  authenticate,
  authorize(['admin.billing', 'billing.collections.update']),
  standardRateLimit,
  billingController.updateCollectionStatus
);

router.post('/collections/dunning',
  authenticate,
  authorize(['admin.billing', 'billing.collections.dunning']),
  standardRateLimit,
  billingController.generateDunningLetter
);

router.post('/collections/late-fees',
  authenticate,
  authorize(['admin.billing', 'billing.collections.fees']),
  standardRateLimit,
  billingController.calculateLateFees
);

// ==================== Integration Management Routes ====================

router.post('/integrations/sync-accounting',
  authenticate,
  authorize(['admin.billing', 'billing.integration.sync']),
  standardRateLimit,
  billingController.syncWithAccounting
);

router.post('/integrations/export-erp',
  authenticate,
  authorize(['admin.billing', 'billing.integration.export']),
  standardRateLimit,
  billingController.exportToERP
);

router.post('/integrations/chart-accounts',
  authenticate,
  authorize(['admin.billing', 'billing.integration.configure']),
  strictRateLimit,
  billingController.mapChartOfAccounts
);

router.post('/integrations/webhook',
  authenticate,
  authorize(['admin.billing', 'billing.integration.webhook']),
  standardRateLimit,
  billingController.setupWebhook
);

router.post('/integrations/webhook-event',
  // Note: Webhook endpoints may not require authentication
  billingController.processWebhookEvent
);

router.post('/integrations/migrate',
  authenticate,
  authorize(['admin.billing', 'billing.integration.migrate']),
  bulkRateLimit,
  billingController.migrateBillingData
);

router.post('/integrations/import',
  authenticate,
  authorize(['admin.billing', 'billing.integration.import']),
  bulkRateLimit,
  billingController.importBillingData
);

router.post('/integrations/sync-customers',
  authenticate,
  authorize(['admin.billing', 'billing.integration.sync']),
  standardRateLimit,
  billingController.syncCustomerData
);

// ==================== Compliance & Risk Management Routes ====================

router.post('/compliance/check',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.check']),
  standardRateLimit,
  billingController.runComplianceCheck
);

router.put('/compliance/controls',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.controls']),
  strictRateLimit,
  billingController.updateFinancialControls
);

router.post('/compliance/risk-assessment',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.risk']),
  standardRateLimit,
  billingController.performRiskAssessment
);

router.post('/compliance/pci',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.pci']),
  strictRateLimit,
  billingController.verifyPCICompliance
);

router.post('/compliance/certificate',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.certificate']),
  standardRateLimit,
  billingController.generateComplianceCertificate
);

router.post('/compliance/audit-transactions',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.audit']),
  strictRateLimit,
  billingController.auditFinancialTransactions
);

router.get('/compliance/suspicious-activity',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.review']),
  standardRateLimit,
  billingController.reviewSuspiciousActivity
);

router.put('/compliance/risk-policies',
  authenticate,
  authorize(['admin.billing', 'billing.compliance.policies']),
  strictRateLimit,
  billingController.updateRiskPolicies
);

// ==================== Analytics & Insights Routes ====================

router.get('/analytics/metrics',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.read']),
  standardRateLimit,
  billingController.analyzeBillingMetrics
);

router.get('/analytics/dashboard',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.dashboard']),
  standardRateLimit,
  billingController.generateDashboardData
);

router.get('/analytics/payment-performance',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.payment']),
  standardRateLimit,
  billingController.analyzePaymentPerformance
);

router.get('/analytics/pricing-optimization',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.pricing']),
  standardRateLimit,
  billingController.analyzePricingOptimization
);

router.get('/analytics/customer-segments',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.segments']),
  standardRateLimit,
  billingController.analyzeCustomerSegments
);

router.post('/analytics/churn-prediction',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.predict']),
  standardRateLimit,
  billingController.predictChurnRisk
);

router.get('/analytics/revenue-trends',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.trends']),
  standardRateLimit,
  billingController.analyzeRevenueTrends
);

router.get('/analytics/benchmark',
  authenticate,
  authorize(['admin.billing', 'billing.analytics.benchmark']),
  standardRateLimit,
  billingController.benchmarkPerformance
);

// Generic billing request handler for action-based routing
router.post('/action/:action',
  authenticate,
  authorize(['admin.billing']),
  standardRateLimit,
  billingController.handleBillingRequest
);

// Apply error handler
router.use(errorHandler);

module.exports = router;