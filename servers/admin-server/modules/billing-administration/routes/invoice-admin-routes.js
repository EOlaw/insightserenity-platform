'use strict';

/**
 * @fileoverview Enterprise invoice administration routes configuration
 * @module servers/admin-server/modules/billing-administration/routes/invoice-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/billing-administration/controllers/invoice-admin-controller
 * @requires module:shared/lib/middleware/auth/authenticate
 * @requires module:shared/lib/middleware/auth/authorize
 * @requires module:shared/lib/middleware/rate-limiting
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const router = express.Router();
const InvoiceAdminController = require('../controllers/invoice-admin-controller');
const { authenticate } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { authorize } = require('../../../../../shared/lib/auth/middleware/authorize');
const { rateLimit } = require('../../../../../shared/lib/middleware/rate-limiting');
const { requestLogger } = require('../../../../../shared/lib/middleware/logging/request-logger');
const { errorHandler } = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const { securityHeaders } = require('../../../../../shared/lib/middleware/security/security-headers');

// Initialize controller
const invoiceController = new InvoiceAdminController();

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

// ==================== Invoice Generation Routes ====================

router.post('/generate',
  authenticate,
  authorize(['admin.billing', 'invoice.generate']),
  standardRateLimit,
  invoiceController.generateInvoice
);

router.post('/generate-proforma',
  authenticate,
  authorize(['admin.billing', 'invoice.generate']),
  standardRateLimit,
  invoiceController.generateProforma
);

router.post('/generate-recurring',
  authenticate,
  authorize(['admin.billing', 'invoice.generate']),
  standardRateLimit,
  invoiceController.generateRecurringInvoice
);

router.post('/generate-credit-note',
  authenticate,
  authorize(['admin.billing', 'invoice.credit']),
  standardRateLimit,
  invoiceController.generateCreditNote
);

router.post('/generate-debit-note',
  authenticate,
  authorize(['admin.billing', 'invoice.debit']),
  standardRateLimit,
  invoiceController.generateDebitNote
);

router.post('/:invoiceId/regenerate',
  authenticate,
  authorize(['admin.billing', 'invoice.regenerate']),
  standardRateLimit,
  invoiceController.regenerateInvoice
);

router.post('/:invoiceId/clone',
  authenticate,
  authorize(['admin.billing', 'invoice.clone']),
  standardRateLimit,
  invoiceController.cloneInvoice
);

router.post('/bulk-generate',
  authenticate,
  authorize(['admin.billing', 'invoice.bulk']),
  bulkRateLimit,
  invoiceController.bulkGenerateInvoices
);

// ==================== Invoice Management Routes ====================

router.get('/:invoiceId',
  authenticate,
  authorize(['admin.billing', 'invoice.read']),
  standardRateLimit,
  invoiceController.getInvoice
);

router.get('/',
  authenticate,
  authorize(['admin.billing', 'invoice.list']),
  standardRateLimit,
  invoiceController.listInvoices
);

router.put('/:invoiceId',
  authenticate,
  authorize(['admin.billing', 'invoice.update']),
  standardRateLimit,
  invoiceController.updateInvoice
);

router.post('/:invoiceId/approve',
  authenticate,
  authorize(['admin.billing', 'invoice.approve']),
  standardRateLimit,
  invoiceController.approveInvoice
);

router.post('/:invoiceId/send',
  authenticate,
  authorize(['admin.billing', 'invoice.send']),
  standardRateLimit,
  invoiceController.sendInvoice
);

router.post('/:invoiceId/resend',
  authenticate,
  authorize(['admin.billing', 'invoice.send']),
  standardRateLimit,
  invoiceController.resendInvoice
);

router.post('/:invoiceId/cancel',
  authenticate,
  authorize(['admin.billing', 'invoice.cancel']),
  strictRateLimit,
  invoiceController.cancelInvoice
);

router.post('/:invoiceId/void',
  authenticate,
  authorize(['admin.billing', 'invoice.void']),
  strictRateLimit,
  invoiceController.voidInvoice
);

// ==================== Payment Operations Routes ====================

router.post('/:invoiceId/payment',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.apply']),
  standardRateLimit,
  invoiceController.applyPayment
);

router.post('/:invoiceId/payment/partial',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.partial']),
  standardRateLimit,
  invoiceController.applyPartialPayment
);

router.post('/:invoiceId/credit',
  authenticate,
  authorize(['admin.billing', 'invoice.credit.apply']),
  standardRateLimit,
  invoiceController.applyCredit
);

router.post('/:invoiceId/refund',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.refund']),
  strictRateLimit,
  invoiceController.refundPayment
);

router.post('/:invoiceId/payment/reverse',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.reverse']),
  strictRateLimit,
  invoiceController.reversePayment
);

router.post('/payment/allocate',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.allocate']),
  standardRateLimit,
  invoiceController.allocatePayment
);

router.post('/payment/reconcile',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.reconcile']),
  standardRateLimit,
  invoiceController.reconcilePayment
);

router.post('/:invoiceId/mark-paid',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.mark']),
  standardRateLimit,
  invoiceController.markAsPaid
);

// ==================== Collections Operations Routes ====================

router.post('/:invoiceId/reminder',
  authenticate,
  authorize(['admin.billing', 'invoice.reminder.send']),
  standardRateLimit,
  invoiceController.sendReminder
);

router.post('/:invoiceId/overdue-notice',
  authenticate,
  authorize(['admin.billing', 'invoice.overdue.send']),
  standardRateLimit,
  invoiceController.sendOverdueNotice
);

router.post('/:invoiceId/collection/escalate',
  authenticate,
  authorize(['admin.billing', 'invoice.collection.escalate']),
  strictRateLimit,
  invoiceController.escalateCollection
);

router.post('/:invoiceId/payment-plan',
  authenticate,
  authorize(['admin.billing', 'invoice.payment.plan']),
  standardRateLimit,
  invoiceController.createPaymentPlan
);

router.post('/:invoiceId/collections',
  authenticate,
  authorize(['admin.billing', 'invoice.collection.send']),
  strictRateLimit,
  invoiceController.sendToCollections
);

router.post('/:invoiceId/write-off',
  authenticate,
  authorize(['admin.billing', 'invoice.writeoff']),
  strictRateLimit,
  invoiceController.writeOffInvoice
);

router.post('/:invoiceId/recover',
  authenticate,
  authorize(['admin.billing', 'invoice.recover']),
  standardRateLimit,
  invoiceController.recoverWrittenOff
);

router.post('/:invoiceId/dunning',
  authenticate,
  authorize(['admin.billing', 'invoice.dunning']),
  standardRateLimit,
  invoiceController.generateDunningLetter
);

// ==================== Document Operations Routes ====================

router.get('/:invoiceId/pdf',
  authenticate,
  authorize(['admin.billing', 'invoice.document.generate']),
  standardRateLimit,
  invoiceController.generatePDF
);

router.get('/:invoiceId/html',
  authenticate,
  authorize(['admin.billing', 'invoice.document.generate']),
  standardRateLimit,
  invoiceController.generateHTML
);

router.get('/:invoiceId/csv',
  authenticate,
  authorize(['admin.billing', 'invoice.document.generate']),
  standardRateLimit,
  invoiceController.generateCSV
);

router.post('/:invoiceId/attachment',
  authenticate,
  authorize(['admin.billing', 'invoice.document.attach']),
  standardRateLimit,
  invoiceController.attachDocument
);

router.delete('/:invoiceId/attachment/:attachmentId',
  authenticate,
  authorize(['admin.billing', 'invoice.document.remove']),
  standardRateLimit,
  invoiceController.removeAttachment
);

router.post('/:invoiceId/sign',
  authenticate,
  authorize(['admin.billing', 'invoice.document.sign']),
  standardRateLimit,
  invoiceController.signInvoice
);

router.post('/:invoiceId/signature-request',
  authenticate,
  authorize(['admin.billing', 'invoice.document.sign']),
  standardRateLimit,
  invoiceController.requestSignature
);

router.get('/:invoiceId/download',
  authenticate,
  authorize(['admin.billing', 'invoice.document.download']),
  standardRateLimit,
  invoiceController.downloadInvoice
);

// ==================== Tax Operations Routes ====================

router.post('/:invoiceId/tax/calculate',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.calculate']),
  standardRateLimit,
  invoiceController.calculateTax
);

router.post('/:invoiceId/tax/recalculate',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.recalculate']),
  standardRateLimit,
  invoiceController.recalculateTax
);

router.post('/:invoiceId/tax/exemption',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.exemption']),
  standardRateLimit,
  invoiceController.applyTaxExemption
);

router.delete('/:invoiceId/tax/exemption',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.exemption']),
  standardRateLimit,
  invoiceController.removeTaxExemption
);

router.put('/:invoiceId/tax',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.update']),
  standardRateLimit,
  invoiceController.updateTaxDetails
);

router.post('/tax/validate',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.validate']),
  standardRateLimit,
  invoiceController.validateTaxNumber
);

router.post('/:invoiceId/tax-invoice',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.generate']),
  standardRateLimit,
  invoiceController.generateTaxInvoice
);

router.post('/:invoiceId/tax-authority',
  authenticate,
  authorize(['admin.billing', 'invoice.tax.submit']),
  strictRateLimit,
  invoiceController.submitToTaxAuthority
);

// ==================== Dispute Operations Routes ====================

router.post('/:invoiceId/dispute',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.create']),
  standardRateLimit,
  invoiceController.createDispute
);

router.put('/dispute/:disputeId',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.update']),
  standardRateLimit,
  invoiceController.updateDispute
);

router.post('/dispute/:disputeId/resolve',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.resolve']),
  standardRateLimit,
  invoiceController.resolveDispute
);

router.post('/dispute/:disputeId/escalate',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.escalate']),
  strictRateLimit,
  invoiceController.escalateDispute
);

router.post('/dispute/:disputeId/close',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.close']),
  standardRateLimit,
  invoiceController.closeDispute
);

router.post('/dispute/:disputeId/resolution',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.apply']),
  standardRateLimit,
  invoiceController.applyDisputeResolution
);

router.get('/dispute/report',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.report']),
  standardRateLimit,
  invoiceController.generateDisputeReport
);

router.post('/dispute/:disputeId/evidence',
  authenticate,
  authorize(['admin.billing', 'invoice.dispute.evidence']),
  standardRateLimit,
  invoiceController.submitDisputeEvidence
);

// ==================== Reporting Operations Routes ====================

router.get('/statement',
  authenticate,
  authorize(['admin.billing', 'invoice.report.statement']),
  standardRateLimit,
  invoiceController.generateStatement
);

router.get('/reports/aging',
  authenticate,
  authorize(['admin.billing', 'invoice.report.aging']),
  standardRateLimit,
  invoiceController.generateAgingReport
);

router.get('/reports/collection',
  authenticate,
  authorize(['admin.billing', 'invoice.report.collection']),
  standardRateLimit,
  invoiceController.generateCollectionReport
);

router.get('/reports/tax',
  authenticate,
  authorize(['admin.billing', 'invoice.report.tax']),
  standardRateLimit,
  invoiceController.generateTaxReport
);

router.get('/reports/revenue',
  authenticate,
  authorize(['admin.billing', 'invoice.report.revenue']),
  standardRateLimit,
  invoiceController.generateRevenueReport
);

router.post('/export',
  authenticate,
  authorize(['admin.billing', 'invoice.export']),
  standardRateLimit,
  invoiceController.exportInvoices
);

router.get('/audit-trail',
  authenticate,
  authorize(['admin.billing', 'invoice.audit']),
  strictRateLimit,
  invoiceController.generateAuditTrail
);

router.get('/reports/compliance',
  authenticate,
  authorize(['admin.billing', 'invoice.report.compliance']),
  strictRateLimit,
  invoiceController.generateComplianceReport
);

// ==================== Analytics Operations Routes ====================

router.get('/analytics/aging',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.aging']),
  standardRateLimit,
  invoiceController.analyzeAging
);

router.get('/analytics/dso',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.dso']),
  standardRateLimit,
  invoiceController.analyzeDSO
);

router.get('/analytics/collection-effectiveness',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.collection']),
  standardRateLimit,
  invoiceController.analyzeCollectionEffectiveness
);

router.get('/analytics/payment-patterns',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.payment']),
  standardRateLimit,
  invoiceController.analyzePaymentPatterns
);

router.get('/analytics/accuracy',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.accuracy']),
  standardRateLimit,
  invoiceController.analyzeInvoiceAccuracy
);

router.get('/analytics/dispute-trends',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.dispute']),
  standardRateLimit,
  invoiceController.analyzeDisputeTrends
);

router.post('/analytics/forecast',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.forecast']),
  standardRateLimit,
  invoiceController.forecastCollections
);

router.get('/analytics/customer-behavior',
  authenticate,
  authorize(['admin.billing', 'invoice.analytics.customer']),
  standardRateLimit,
  invoiceController.analyzeCustomerBehavior
);

// Generic invoice request handler for action-based routing
router.post('/action/:action',
  authenticate,
  authorize(['admin.billing']),
  standardRateLimit,
  invoiceController.handleInvoiceRequest
);

// Apply error handler
router.use(errorHandler);

module.exports = router;