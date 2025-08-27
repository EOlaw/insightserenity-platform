'use strict';

/**
 * @fileoverview Enterprise invoice administration model for comprehensive invoice management
 * @module servers/admin-server/modules/billing-administration/models/invoice-admin-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/formatters/currency-formatter
 * @requires module:shared/lib/utils/formatters/number-formatter
 * @requires module:shared/lib/services/pdf-service
 * @requires module:shared/lib/services/email-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const EncryptionService = require('../../../../../security/encryption/encryption-service');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const currencyFormatter = require('../../../../../utils/formatters/currency-formatter');
const numberFormatter = require('../../../../../utils/formatters/number-formatter');
const PDFService = require('../../../../../services/pdf-service');
const EmailService = require('../../../../../services/email-service');

/**
 * @class InvoiceAdminSchema
 * @description Comprehensive invoice administration schema for enterprise invoice management
 * @extends mongoose.Schema
 */
const invoiceAdminSchema = new mongoose.Schema({
  // ==================== Core Invoice Identification ====================
  invoiceAdminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `INV-ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for invoice administration record'
  },

  invoiceReference: {
    billingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingAdmin',
      required: true,
      index: true,
      description: 'Reference to billing account'
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization'
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      sparse: true,
      description: 'Reference to subscription if applicable'
    },
    contractId: {
      type: String,
      sparse: true,
      description: 'Reference to contract'
    },
    projectId: {
      type: String,
      sparse: true,
      description: 'Reference to project for project-based billing'
    },
    parentInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InvoiceAdmin',
      sparse: true,
      description: 'Parent invoice for credit notes or adjustments'
    }
  },

  // ==================== Invoice Details ====================
  invoiceDetails: {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      description: 'Unique invoice number'
    },
    invoiceType: {
      type: String,
      enum: ['STANDARD', 'PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE', 'RECURRING', 'FINAL', 'DEPOSIT', 'INTERIM'],
      default: 'STANDARD',
      required: true,
      index: true
    },
    invoiceStatus: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED', 'WRITTEN_OFF'],
      default: 'DRAFT',
      required: true,
      index: true
    },
    issueDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    billingPeriod: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      periodType: {
        type: String,
        enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM', 'ONE_TIME']
      }
    },
    paymentTerms: {
      netDays: {
        type: Number,
        default: 30
      },
      earlyPaymentDiscount: {
        percentage: Number,
        discountDays: Number,
        discountAmount: Number
      },
      lateFee: {
        percentage: Number,
        fixedAmount: Number,
        gracePeriodDays: Number
      },
      description: String
    },
    currency: {
      code: {
        type: String,
        default: 'USD',
        required: true
      },
      symbol: String,
      exchangeRate: {
        type: Number,
        default: 1
      },
      baseCurrency: {
        type: String,
        default: 'USD'
      }
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ko']
    },
    template: {
      templateId: String,
      templateName: {
        type: String,
        default: 'DEFAULT'
      },
      customization: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Customer Information ====================
  customerInfo: {
    customerId: {
      type: String,
      required: true,
      index: true
    },
    customerName: {
      type: String,
      required: true
    },
    customerType: {
      type: String,
      enum: ['INDIVIDUAL', 'BUSINESS', 'GOVERNMENT', 'NON_PROFIT', 'EDUCATIONAL'],
      default: 'BUSINESS'
    },
    billingAddress: {
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      postalCode: String,
      country: {
        type: String,
        required: true
      }
    },
    shippingAddress: {
      sameAsBilling: {
        type: Boolean,
        default: true
      },
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    contactInfo: {
      primaryContact: {
        name: String,
        email: {
          type: String,
          required: true
        },
        phone: String,
        title: String
      },
      billingContact: {
        name: String,
        email: String,
        phone: String
      },
      accountsPayable: {
        email: String,
        phone: String,
        department: String
      }
    },
    taxInfo: {
      taxId: String,
      vatNumber: String,
      taxExempt: {
        type: Boolean,
        default: false
      },
      exemptionCertificate: String,
      taxJurisdiction: String
    },
    purchaseOrder: {
      required: Boolean,
      poNumber: String,
      poDate: Date,
      poAmount: Number
    }
  },

  // ==================== Line Items ====================
  lineItems: [{
    itemId: {
      type: String,
      default: function() {
        return `ITEM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
    },
    itemType: {
      type: String,
      enum: ['SUBSCRIPTION', 'ADDON', 'USAGE', 'SERVICE', 'PRODUCT', 'DISCOUNT', 'TAX', 'ADJUSTMENT', 'CREDIT'],
      required: true
    },
    productCode: String,
    sku: String,
    description: {
      type: String,
      required: true
    },
    detailedDescription: String,
    category: String,
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    unitOfMeasure: {
      type: String,
      default: 'UNIT'
    },
    unitPrice: {
      type: Number,
      required: true
    },
    listPrice: Number,
    discountPercentage: Number,
    discountAmount: Number,
    amount: {
      type: Number,
      required: true
    },
    taxable: {
      type: Boolean,
      default: true
    },
    taxRate: Number,
    taxAmount: Number,
    totalAmount: Number,
    accounting: {
      revenueAccount: String,
      costCenter: String,
      department: String,
      project: String,
      glCode: String
    },
    metadata: mongoose.Schema.Types.Mixed,
    recurringDetails: {
      isRecurring: Boolean,
      frequency: String,
      startDate: Date,
      endDate: Date
    },
    usageDetails: {
      startReading: Number,
      endReading: Number,
      consumption: Number,
      rate: Number,
      tier: String
    }
  }],

  // ==================== Financial Calculations ====================
  financialSummary: {
    subtotal: {
      type: Number,
      required: true,
      default: 0
    },
    discounts: {
      lineItemDiscounts: Number,
      volumeDiscount: Number,
      promotionalDiscount: Number,
      earlyPaymentDiscount: Number,
      totalDiscounts: Number
    },
    adjustments: {
      creditAdjustment: Number,
      debitAdjustment: Number,
      priceAdjustment: Number,
      totalAdjustments: Number
    },
    taxDetails: [{
      taxType: {
        type: String,
        enum: ['SALES_TAX', 'VAT', 'GST', 'PST', 'HST', 'SERVICE_TAX', 'CUSTOM']
      },
      jurisdiction: String,
      rate: Number,
      taxableAmount: Number,
      taxAmount: Number,
      inclusive: Boolean
    }],
    totalTax: {
      type: Number,
      default: 0
    },
    shipping: {
      shippingAmount: Number,
      handlingAmount: Number,
      insuranceAmount: Number,
      totalShipping: Number
    },
    grandTotal: {
      type: Number,
      required: true,
      default: 0
    },
    amountDue: {
      type: Number,
      required: true,
      default: 0
    },
    balanceForward: Number,
    previousBalance: Number,
    creditBalance: Number
  },

  // ==================== Payment Information ====================
  paymentInfo: {
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PENDING', 'PROCESSING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED', 'DISPUTED'],
      default: 'UNPAID',
      required: true,
      index: true
    },
    paymentMethod: {
      type: String,
      enum: ['CREDIT_CARD', 'ACH', 'WIRE_TRANSFER', 'CHECK', 'CASH', 'PAYPAL', 'CRYPTO', 'CREDIT_BALANCE', 'OTHER']
    },
    paymentInstructions: String,
    bankDetails: {
      bankName: String,
      accountName: String,
      accountNumber: String,
      routingNumber: String,
      swiftCode: String,
      iban: String,
      reference: String
    },
    onlinePaymentLink: String,
    paymentPortalUrl: String,
    acceptedPaymentMethods: [{
      method: String,
      enabled: Boolean,
      processingFee: Number
    }]
  },

  // ==================== Payment Transactions ====================
  paymentTransactions: [{
    transactionId: {
      type: String,
      required: true
    },
    transactionDate: {
      type: Date,
      required: true
    },
    transactionType: {
      type: String,
      enum: ['PAYMENT', 'REFUND', 'PARTIAL_PAYMENT', 'OVERPAYMENT', 'CREDIT_APPLICATION', 'ADJUSTMENT'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: String,
    paymentMethod: String,
    referenceNumber: String,
    gatewayTransactionId: String,
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'],
      default: 'PENDING'
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    notes: String,
    reconciled: {
      type: Boolean,
      default: false
    },
    reconciledDate: Date,
    bankDeposit: {
      depositId: String,
      depositDate: Date,
      depositAmount: Number
    }
  }],

  // ==================== Credit Notes & Adjustments ====================
  creditAdjustments: {
    creditNotes: [{
      creditNoteId: String,
      creditNoteNumber: String,
      issueDate: Date,
      amount: Number,
      reason: String,
      appliedAmount: Number,
      remainingCredit: Number,
      status: {
        type: String,
        enum: ['DRAFT', 'ISSUED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED']
      },
      relatedInvoiceId: String,
      appliedTo: [{
        invoiceId: String,
        amount: Number,
        appliedDate: Date
      }]
    }],
    writeOffs: [{
      writeOffId: String,
      amount: Number,
      reason: String,
      authorizedBy: mongoose.Schema.Types.ObjectId,
      writeOffDate: Date,
      category: String,
      recovered: Boolean,
      recoveryAmount: Number
    }],
    disputes: [{
      disputeId: String,
      disputeDate: Date,
      disputedAmount: Number,
      reason: String,
      status: {
        type: String,
        enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED', 'CLOSED']
      },
      resolution: String,
      resolvedDate: Date,
      resolvedBy: mongoose.Schema.Types.ObjectId,
      adjustmentAmount: Number
    }]
  },

  // ==================== Automated Processing ====================
  automationSettings: {
    autoSend: {
      enabled: {
        type: Boolean,
        default: true
      },
      sendOnApproval: Boolean,
      sendDelay: Number,
      retryAttempts: Number,
      retryInterval: Number
    },
    autoReminders: {
      enabled: {
        type: Boolean,
        default: true
      },
      reminderSchedule: [{
        daysBefore: Number,
        reminderType: String,
        template: String
      }],
      overdueReminders: [{
        daysAfter: Number,
        reminderType: String,
        template: String,
        escalate: Boolean
      }],
      maxReminders: Number
    },
    autoPayment: {
      enabled: Boolean,
      paymentMethodId: String,
      retryOnFailure: Boolean,
      maxRetries: Number,
      retrySchedule: [Number]
    },
    autoReconciliation: {
      enabled: Boolean,
      matchingRules: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed,
        tolerance: Number
      }],
      autoApplyCredits: Boolean,
      requireApproval: Boolean
    },
    dunningProcess: {
      enabled: Boolean,
      stages: [{
        stageName: String,
        daysOverdue: Number,
        action: String,
        template: String,
        escalateTo: String
      }],
      suspendServices: Boolean,
      suspendAfterDays: Number
    }
  },

  // ==================== Document Management ====================
  documentManagement: {
    generatedDocuments: [{
      documentId: String,
      documentType: {
        type: String,
        enum: ['PDF', 'HTML', 'CSV', 'XML', 'JSON']
      },
      version: Number,
      generatedAt: Date,
      generatedBy: mongoose.Schema.Types.ObjectId,
      url: String,
      size: Number,
      checksum: String,
      expiresAt: Date
    }],
    attachments: [{
      attachmentId: String,
      fileName: String,
      fileType: String,
      fileSize: Number,
      uploadedAt: Date,
      uploadedBy: mongoose.Schema.Types.ObjectId,
      url: String,
      description: String,
      category: String
    }],
    signatures: {
      requiresSignature: Boolean,
      signatureStatus: {
        type: String,
        enum: ['NOT_REQUIRED', 'PENDING', 'SIGNED', 'DECLINED']
      },
      signedBy: String,
      signedAt: Date,
      signatureMethod: String,
      ipAddress: String,
      documentHash: String
    },
    deliveryTracking: [{
      deliveryMethod: {
        type: String,
        enum: ['EMAIL', 'POSTAL', 'FAX', 'API', 'PORTAL', 'MANUAL']
      },
      sentAt: Date,
      sentTo: String,
      sentBy: mongoose.Schema.Types.ObjectId,
      deliveryStatus: {
        type: String,
        enum: ['PENDING', 'SENT', 'DELIVERED', 'VIEWED', 'BOUNCED', 'FAILED']
      },
      viewedAt: Date,
      viewCount: Number,
      downloadCount: Number,
      trackingId: String,
      emailEvents: [{
        event: String,
        timestamp: Date,
        details: mongoose.Schema.Types.Mixed
      }]
    }]
  },

  // ==================== Approval Workflow ====================
  approvalWorkflow: {
    requiresApproval: {
      type: Boolean,
      default: false
    },
    approvalStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'],
      default: 'NOT_REQUIRED'
    },
    approvalChain: [{
      level: Number,
      approverRole: String,
      approverId: mongoose.Schema.Types.ObjectId,
      approverName: String,
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'SKIPPED']
      },
      approvedAt: Date,
      comments: String,
      conditions: mongoose.Schema.Types.Mixed
    }],
    currentApprovalLevel: Number,
    approvalDeadline: Date,
    escalationRules: [{
      triggerAfterHours: Number,
      escalateTo: String,
      notificationTemplate: String
    }],
    approvalHistory: [{
      action: String,
      performedBy: mongoose.Schema.Types.ObjectId,
      performedAt: Date,
      comments: String,
      fromStatus: String,
      toStatus: String
    }]
  },

  // ==================== Collections & Aging ====================
  collectionsInfo: {
    collectionStatus: {
      type: String,
      enum: ['CURRENT', 'REMINDER_SENT', 'OVERDUE', 'IN_COLLECTIONS', 'PAYMENT_PLAN', 'LEGAL_ACTION', 'WRITTEN_OFF'],
      default: 'CURRENT',
      index: true
    },
    agingBucket: {
      type: String,
      enum: ['CURRENT', '1-30', '31-60', '61-90', '91-120', 'OVER_120'],
      default: 'CURRENT',
      index: true
    },
    daysOverdue: {
      type: Number,
      default: 0,
      index: true
    },
    collectionActions: [{
      actionId: String,
      actionType: {
        type: String,
        enum: ['REMINDER', 'PHONE_CALL', 'DEMAND_LETTER', 'COLLECTION_AGENCY', 'LEGAL_ACTION']
      },
      actionDate: Date,
      performedBy: mongoose.Schema.Types.ObjectId,
      outcome: String,
      notes: String,
      nextAction: String,
      nextActionDate: Date
    }],
    paymentPlan: {
      planId: String,
      active: Boolean,
      totalAmount: Number,
      installments: [{
        installmentNumber: Number,
        dueDate: Date,
        amount: Number,
        status: String,
        paidDate: Date,
        paidAmount: Number
      }],
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      terms: String
    },
    collectionAgency: {
      agencyName: String,
      assignedDate: Date,
      accountNumber: String,
      commissionRate: Number,
      status: String,
      recoveredAmount: Number
    }
  },

  // ==================== Compliance & Regulatory ====================
  complianceInfo: {
    regulatoryCompliance: {
      invoiceCompliant: Boolean,
      complianceChecks: [{
        checkType: String,
        passed: Boolean,
        checkedAt: Date,
        details: mongoose.Schema.Types.Mixed
      }],
      requiredFields: [{
        fieldName: String,
        present: Boolean,
        value: mongoose.Schema.Types.Mixed
      }]
    },
    taxCompliance: {
      taxCalculationMethod: String,
      taxCalculationDate: Date,
      taxEngine: String,
      taxEngineVersion: String,
      auditTrail: [{
        calculation: mongoose.Schema.Types.Mixed,
        timestamp: Date
      }]
    },
    electronicInvoicing: {
      standard: {
        type: String,
        enum: ['NONE', 'PEPPOL', 'CIUS', 'FACTUR-X', 'ZATCA', 'CFDI']
      },
      validated: Boolean,
      validationErrors: [String],
      transmissionId: String,
      transmissionStatus: String,
      governmentPortalId: String
    },
    retention: {
      retentionPeriod: Number,
      retentionPolicy: String,
      archiveDate: Date,
      destructionDate: Date,
      legalHold: Boolean,
      legalHoldReason: String
    }
  },

  // ==================== Analytics & Reporting ====================
  analytics: {
    metrics: {
      timeToPayment: Number,
      paymentVelocity: Number,
      disputeRate: Number,
      writeOffRate: Number,
      collectionEfficiency: Number
    },
    customerBehavior: {
      averagePaymentDays: Number,
      paymentPattern: String,
      preferredPaymentMethod: String,
      communicationPreference: String
    },
    revenueRecognition: {
      recognizedAmount: Number,
      deferredAmount: Number,
      recognitionSchedule: [{
        period: Date,
        amount: Number,
        recognized: Boolean
      }]
    },
    profitability: {
      revenue: Number,
      cost: Number,
      margin: Number,
      marginPercentage: Number
    }
  },

  // ==================== Integration & Sync ====================
  integrationSync: {
    accountingSystem: {
      synced: Boolean,
      syncDate: Date,
      systemName: String,
      externalId: String,
      journalEntryId: String,
      lastError: String
    },
    erpSystem: {
      synced: Boolean,
      syncDate: Date,
      systemName: String,
      externalId: String,
      lastError: String
    },
    paymentGateway: {
      synced: Boolean,
      syncDate: Date,
      gatewayName: String,
      gatewayInvoiceId: String,
      lastError: String
    },
    customIntegrations: [{
      systemName: String,
      synced: Boolean,
      syncDate: Date,
      externalId: String,
      mapping: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Notes & Comments ====================
  notesAndComments: {
    internalNotes: [{
      noteId: String,
      note: String,
      category: String,
      addedBy: mongoose.Schema.Types.ObjectId,
      addedAt: Date,
      visibility: {
        type: String,
        enum: ['INTERNAL', 'CUSTOMER_VISIBLE', 'ACCOUNTING_ONLY']
      }
    }],
    customerMessages: [{
      messageId: String,
      message: String,
      sentBy: String,
      sentAt: Date,
      readBy: String,
      readAt: Date
    }],
    activityLog: [{
      activityId: String,
      activityType: String,
      description: String,
      performedBy: mongoose.Schema.Types.ObjectId,
      performedAt: Date,
      ipAddress: String,
      userAgent: String
    }]
  },

  // ==================== Metadata & Timestamps ====================
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    approvedAt: Date,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    sentAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    cancelledAt: Date,
    version: {
      type: Number,
      default: 1
    },
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['MANUAL', 'AUTOMATED', 'API', 'IMPORT', 'RECURRING']
    }
  }
}, {
  timestamps: true,
  collection: 'invoice_admin',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
invoiceAdminSchema.index({ 'invoiceDetails.invoiceNumber': 1 });
invoiceAdminSchema.index({ 'invoiceDetails.invoiceStatus': 1, 'invoiceDetails.dueDate': 1 });
invoiceAdminSchema.index({ 'customerInfo.customerId': 1, 'invoiceDetails.issueDate': -1 });
invoiceAdminSchema.index({ 'paymentInfo.paymentStatus': 1 });
invoiceAdminSchema.index({ 'collectionsInfo.collectionStatus': 1 });
invoiceAdminSchema.index({ 'collectionsInfo.agingBucket': 1 });
invoiceAdminSchema.index({ 'collectionsInfo.daysOverdue': 1 });
invoiceAdminSchema.index({ 'financialSummary.amountDue': -1 });
invoiceAdminSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
invoiceAdminSchema.virtual('isPaid').get(function() {
  return this.paymentInfo.paymentStatus === 'PAID';
});

invoiceAdminSchema.virtual('isOverdue').get(function() {
  return this.invoiceDetails.dueDate < new Date() && 
         this.paymentInfo.paymentStatus !== 'PAID' &&
         this.invoiceDetails.invoiceStatus !== 'CANCELLED';
});

invoiceAdminSchema.virtual('daysUntilDue').get(function() {
  const now = new Date();
  const dueDate = new Date(this.invoiceDetails.dueDate);
  const diffTime = dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

invoiceAdminSchema.virtual('paymentProgress').get(function() {
  if (this.financialSummary.grandTotal === 0) return 100;
  const paid = this.financialSummary.grandTotal - this.financialSummary.amountDue;
  return Math.round((paid / this.financialSummary.grandTotal) * 100);
});

// ==================== Instance Methods ====================

/**
 * Send invoice to customer
 * @async
 * @param {Object} sendOptions - Sending options
 * @returns {Promise<Object>} Send result
 */
invoiceAdminSchema.methods.sendInvoice = async function(sendOptions = {}) {
  try {
    if (this.invoiceDetails.invoiceStatus === 'DRAFT') {
      throw new AppError('Cannot send draft invoice', 400);
    }

    const emailService = new EmailService();
    const pdfService = new PDFService();

    // Generate PDF if not exists
    let pdfDocument = this.documentManagement.generatedDocuments.find(
      doc => doc.documentType === 'PDF' && doc.version === this.metadata.version
    );

    if (!pdfDocument) {
      const pdfResult = await this.generatePDF();
      pdfDocument = pdfResult.document;
    }

    // Prepare email data
    const emailData = {
      to: sendOptions.recipientEmail || this.customerInfo.contactInfo.primaryContact.email,
      cc: sendOptions.ccEmails,
      subject: sendOptions.subject || `Invoice ${this.invoiceDetails.invoiceNumber}`,
      template: sendOptions.template || 'invoice-standard',
      attachments: [{
        filename: `Invoice_${this.invoiceDetails.invoiceNumber}.pdf`,
        path: pdfDocument.url
      }],
      data: {
        invoiceNumber: this.invoiceDetails.invoiceNumber,
        customerName: this.customerInfo.customerName,
        amount: currencyFormatter.format(this.financialSummary.grandTotal, this.invoiceDetails.currency.code),
        dueDate: dateHelper.format(this.invoiceDetails.dueDate, 'MMMM DD, YYYY'),
        paymentLink: this.paymentInfo.onlinePaymentLink
      }
    };

    // Send email
    const sendResult = await emailService.sendEmail(emailData);

    // Update delivery tracking
    this.documentManagement.deliveryTracking.push({
      deliveryMethod: 'EMAIL',
      sentAt: new Date(),
      sentTo: emailData.to,
      sentBy: sendOptions.sentBy,
      deliveryStatus: 'SENT',
      trackingId: sendResult.messageId
    });

    // Update invoice status
    if (this.invoiceDetails.invoiceStatus === 'APPROVED') {
      this.invoiceDetails.invoiceStatus = 'SENT';
      this.metadata.sentAt = new Date();
      this.metadata.sentBy = sendOptions.sentBy;
    }

    await this.save();

    logger.info(`Invoice ${this.invoiceDetails.invoiceNumber} sent successfully`);
    return { success: true, messageId: sendResult.messageId };

  } catch (error) {
    logger.error(`Failed to send invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Generate PDF document for invoice
 * @async
 * @param {Object} options - PDF generation options
 * @returns {Promise<Object>} Generated PDF info
 */
invoiceAdminSchema.methods.generatePDF = async function(options = {}) {
  try {
    const pdfService = new PDFService();
    
    const pdfData = {
      template: options.template || this.invoiceDetails.template.templateName,
      data: {
        invoice: this.toObject(),
        branding: options.branding || {},
        customization: this.invoiceDetails.template.customization
      },
      options: {
        format: 'A4',
        margin: options.margin || { top: '1in', bottom: '1in', left: '0.75in', right: '0.75in' }
      }
    };

    const pdfResult = await pdfService.generatePDF(pdfData);

    const document = {
      documentId: `DOC-${Date.now()}`,
      documentType: 'PDF',
      version: this.metadata.version,
      generatedAt: new Date(),
      generatedBy: options.generatedBy,
      url: pdfResult.url,
      size: pdfResult.size,
      checksum: pdfResult.checksum,
      expiresAt: dateHelper.addDays(new Date(), 90)
    };

    this.documentManagement.generatedDocuments.push(document);
    await this.save();

    return { success: true, document };

  } catch (error) {
    logger.error(`Failed to generate PDF for invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Apply payment to invoice
 * @async
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} Payment application result
 */
invoiceAdminSchema.methods.applyPayment = async function(paymentData) {
  try {
    const payment = {
      transactionId: paymentData.transactionId || `PAY-${Date.now()}`,
      transactionDate: paymentData.transactionDate || new Date(),
      transactionType: 'PAYMENT',
      amount: paymentData.amount,
      currency: paymentData.currency || this.invoiceDetails.currency.code,
      paymentMethod: paymentData.paymentMethod,
      referenceNumber: paymentData.referenceNumber,
      gatewayTransactionId: paymentData.gatewayTransactionId,
      status: paymentData.status || 'COMPLETED',
      processedBy: paymentData.processedBy,
      notes: paymentData.notes
    };

    this.paymentTransactions.push(payment);

    // Update amount due
    this.financialSummary.amountDue = Math.max(0, this.financialSummary.amountDue - payment.amount);

    // Update payment status
    if (this.financialSummary.amountDue === 0) {
      this.paymentInfo.paymentStatus = 'PAID';
      this.invoiceDetails.invoiceStatus = 'PAID';
    } else if (this.financialSummary.amountDue < this.financialSummary.grandTotal) {
      this.paymentInfo.paymentStatus = 'PARTIALLY_PAID';
      this.invoiceDetails.invoiceStatus = 'PARTIALLY_PAID';
    }

    // Update collections info if applicable
    if (this.collectionsInfo.collectionStatus !== 'CURRENT') {
      this.collectionsInfo.collectionStatus = 'CURRENT';
      this.collectionsInfo.agingBucket = 'CURRENT';
      this.collectionsInfo.daysOverdue = 0;
    }

    await this.save();

    logger.info(`Payment applied to invoice ${this.invoiceDetails.invoiceNumber}: ${payment.transactionId}`);
    return { success: true, payment, remainingBalance: this.financialSummary.amountDue };

  } catch (error) {
    logger.error(`Failed to apply payment to invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Apply refund to invoice
 * @async
 * @param {Object} refundData - Refund information
 * @returns {Promise<Object>} Refund application result
 */
invoiceAdminSchema.methods.applyRefund = async function(refundData) {
  try {
    const refund = {
      transactionId: refundData.transactionId || `REF-${Date.now()}`,
      transactionDate: refundData.transactionDate || new Date(),
      transactionType: 'REFUND',
      amount: -Math.abs(refundData.amount),
      currency: refundData.currency || this.invoiceDetails.currency.code,
      paymentMethod: refundData.paymentMethod,
      referenceNumber: refundData.referenceNumber,
      gatewayTransactionId: refundData.gatewayTransactionId,
      status: refundData.status || 'COMPLETED',
      processedBy: refundData.processedBy,
      notes: refundData.notes
    };

    this.paymentTransactions.push(refund);

    // Update amount due
    this.financialSummary.amountDue = Math.min(
      this.financialSummary.grandTotal,
      this.financialSummary.amountDue + Math.abs(refund.amount)
    );

    // Update payment status
    if (Math.abs(refund.amount) >= this.financialSummary.grandTotal) {
      this.paymentInfo.paymentStatus = 'REFUNDED';
    } else {
      this.paymentInfo.paymentStatus = 'PARTIALLY_PAID';
    }

    await this.save();

    logger.info(`Refund applied to invoice ${this.invoiceDetails.invoiceNumber}: ${refund.transactionId}`);
    return { success: true, refund, newBalance: this.financialSummary.amountDue };

  } catch (error) {
    logger.error(`Failed to apply refund to invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Create credit note from invoice
 * @async
 * @param {Object} creditNoteData - Credit note information
 * @returns {Promise<Object>} Credit note creation result
 */
invoiceAdminSchema.methods.createCreditNote = async function(creditNoteData) {
  try {
    const creditNote = new InvoiceAdmin({
      invoiceReference: {
        ...this.invoiceReference,
        parentInvoiceId: this._id
      },
      invoiceDetails: {
        invoiceNumber: creditNoteData.creditNoteNumber || `CN-${this.invoiceDetails.invoiceNumber}`,
        invoiceType: 'CREDIT_NOTE',
        invoiceStatus: 'APPROVED',
        issueDate: new Date(),
        dueDate: new Date(),
        billingPeriod: this.invoiceDetails.billingPeriod,
        currency: this.invoiceDetails.currency,
        language: this.invoiceDetails.language
      },
      customerInfo: this.customerInfo,
      lineItems: creditNoteData.lineItems || this.lineItems.map(item => ({
        ...item.toObject(),
        amount: -Math.abs(item.amount)
      })),
      financialSummary: {
        subtotal: -Math.abs(creditNoteData.amount || this.financialSummary.grandTotal),
        grandTotal: -Math.abs(creditNoteData.amount || this.financialSummary.grandTotal),
        amountDue: 0
      },
      metadata: {
        createdBy: creditNoteData.createdBy,
        source: 'MANUAL'
      }
    });

    await creditNote.save();

    // Link credit note to original invoice
    this.creditAdjustments.creditNotes.push({
      creditNoteId: creditNote._id,
      creditNoteNumber: creditNote.invoiceDetails.invoiceNumber,
      issueDate: new Date(),
      amount: Math.abs(creditNote.financialSummary.grandTotal),
      reason: creditNoteData.reason,
      remainingCredit: Math.abs(creditNote.financialSummary.grandTotal),
      status: 'ISSUED'
    });

    await this.save();

    logger.info(`Credit note created for invoice ${this.invoiceDetails.invoiceNumber}: ${creditNote.invoiceDetails.invoiceNumber}`);
    return { success: true, creditNote };

  } catch (error) {
    logger.error(`Failed to create credit note for invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Cancel invoice
 * @async
 * @param {Object} cancellationData - Cancellation information
 * @returns {Promise<Object>} Cancellation result
 */
invoiceAdminSchema.methods.cancelInvoice = async function(cancellationData) {
  try {
    if (this.invoiceDetails.invoiceStatus === 'PAID') {
      throw new AppError('Cannot cancel paid invoice', 400);
    }

    if (this.invoiceDetails.invoiceStatus === 'CANCELLED') {
      throw new AppError('Invoice already cancelled', 400);
    }

    this.invoiceDetails.invoiceStatus = 'CANCELLED';
    this.paymentInfo.paymentStatus = 'UNPAID';
    this.metadata.cancelledBy = cancellationData.cancelledBy;
    this.metadata.cancelledAt = new Date();

    // Add cancellation note
    this.notesAndComments.internalNotes.push({
      noteId: `NOTE-${Date.now()}`,
      note: cancellationData.reason || 'Invoice cancelled',
      category: 'CANCELLATION',
      addedBy: cancellationData.cancelledBy,
      addedAt: new Date(),
      visibility: 'INTERNAL'
    });

    await this.save();

    logger.info(`Invoice ${this.invoiceDetails.invoiceNumber} cancelled`);
    return { success: true, invoice: this };

  } catch (error) {
    logger.error(`Failed to cancel invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

/**
 * Calculate aging for invoice
 * @returns {Object} Aging information
 */
invoiceAdminSchema.methods.calculateAging = function() {
  if (this.paymentInfo.paymentStatus === 'PAID') {
    return {
      daysOverdue: 0,
      agingBucket: 'CURRENT',
      status: 'PAID'
    };
  }

  const now = new Date();
  const dueDate = new Date(this.invoiceDetails.dueDate);
  const daysOverdue = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));

  let agingBucket = 'CURRENT';
  if (daysOverdue > 120) {
    agingBucket = 'OVER_120';
  } else if (daysOverdue > 90) {
    agingBucket = '91-120';
  } else if (daysOverdue > 60) {
    agingBucket = '61-90';
  } else if (daysOverdue > 30) {
    agingBucket = '31-60';
  } else if (daysOverdue > 0) {
    agingBucket = '1-30';
  }

  this.collectionsInfo.daysOverdue = daysOverdue;
  this.collectionsInfo.agingBucket = agingBucket;

  return {
    daysOverdue,
    agingBucket,
    status: daysOverdue > 0 ? 'OVERDUE' : 'CURRENT'
  };
};

/**
 * Send payment reminder
 * @async
 * @param {Object} reminderOptions - Reminder options
 * @returns {Promise<Object>} Reminder send result
 */
invoiceAdminSchema.methods.sendPaymentReminder = async function(reminderOptions = {}) {
  try {
    const emailService = new EmailService();
    
    const reminderData = {
      to: reminderOptions.recipientEmail || this.customerInfo.contactInfo.primaryContact.email,
      subject: reminderOptions.subject || `Payment Reminder: Invoice ${this.invoiceDetails.invoiceNumber}`,
      template: reminderOptions.template || 'payment-reminder',
      data: {
        invoiceNumber: this.invoiceDetails.invoiceNumber,
        customerName: this.customerInfo.customerName,
        amountDue: currencyFormatter.format(this.financialSummary.amountDue, this.invoiceDetails.currency.code),
        dueDate: dateHelper.format(this.invoiceDetails.dueDate, 'MMMM DD, YYYY'),
        daysOverdue: this.collectionsInfo.daysOverdue,
        paymentLink: this.paymentInfo.onlinePaymentLink
      }
    };

    const sendResult = await emailService.sendEmail(reminderData);

    // Track collection action
    this.collectionsInfo.collectionActions.push({
      actionId: `ACT-${Date.now()}`,
      actionType: 'REMINDER',
      actionDate: new Date(),
      performedBy: reminderOptions.sentBy,
      outcome: 'SENT',
      notes: reminderOptions.notes || 'Payment reminder sent'
    });

    if (this.collectionsInfo.collectionStatus === 'CURRENT' && this.collectionsInfo.daysOverdue > 0) {
      this.collectionsInfo.collectionStatus = 'REMINDER_SENT';
    }

    await this.save();

    logger.info(`Payment reminder sent for invoice ${this.invoiceDetails.invoiceNumber}`);
    return { success: true, messageId: sendResult.messageId };

  } catch (error) {
    logger.error(`Failed to send payment reminder for invoice ${this.invoiceDetails.invoiceNumber}:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================

/**
 * Find overdue invoices
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} Overdue invoices
 */
invoiceAdminSchema.statics.findOverdueInvoices = async function(filters = {}) {
  const query = {
    'invoiceDetails.dueDate': { $lt: new Date() },
    'paymentInfo.paymentStatus': { $nin: ['PAID', 'REFUNDED'] },
    'invoiceDetails.invoiceStatus': { $ne: 'CANCELLED' }
  };

  if (filters.customerId) {
    query['customerInfo.customerId'] = filters.customerId;
  }

  if (filters.minAmount) {
    query['financialSummary.amountDue'] = { $gte: filters.minAmount };
  }

  if (filters.agingBucket) {
    query['collectionsInfo.agingBucket'] = filters.agingBucket;
  }

  return this.find(query).sort({ 'invoiceDetails.dueDate': 1 });
};

/**
 * Calculate total outstanding balance
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Number>} Total outstanding amount
 */
invoiceAdminSchema.statics.calculateOutstandingBalance = async function(filters = {}) {
  const matchQuery = {
    'paymentInfo.paymentStatus': { $nin: ['PAID', 'REFUNDED'] },
    'invoiceDetails.invoiceStatus': { $ne: 'CANCELLED' }
  };

  if (filters.customerId) {
    matchQuery['customerInfo.customerId'] = filters.customerId;
  }

  const result = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$financialSummary.amountDue' }
      }
    }
  ]);

  return result[0]?.totalOutstanding || 0;
};

/**
 * Generate aging report
 * @static
 * @async
 * @returns {Promise<Object>} Aging report data
 */
invoiceAdminSchema.statics.generateAgingReport = async function() {
  const agingBuckets = ['CURRENT', '1-30', '31-60', '61-90', '91-120', 'OVER_120'];
  const report = {};

  for (const bucket of agingBuckets) {
    const result = await this.aggregate([
      {
        $match: {
          'collectionsInfo.agingBucket': bucket,
          'paymentInfo.paymentStatus': { $nin: ['PAID', 'REFUNDED'] },
          'invoiceDetails.invoiceStatus': { $ne: 'CANCELLED' }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$financialSummary.amountDue' }
        }
      }
    ]);

    report[bucket] = {
      count: result[0]?.count || 0,
      amount: result[0]?.totalAmount || 0
    };
  }

  return report;
};

/**
 * Find invoices requiring collection action
 * @static
 * @async
 * @returns {Promise<Array>} Invoices requiring collection
 */
invoiceAdminSchema.statics.findInvoicesForCollection = async function() {
  return this.find({
    'collectionsInfo.daysOverdue': { $gt: 30 },
    'collectionsInfo.collectionStatus': { $nin: ['IN_COLLECTIONS', 'PAYMENT_PLAN', 'LEGAL_ACTION', 'WRITTEN_OFF'] },
    'paymentInfo.paymentStatus': { $ne: 'PAID' },
    'invoiceDetails.invoiceStatus': { $ne: 'CANCELLED' }
  }).sort({ 'collectionsInfo.daysOverdue': -1 });
};

// ==================== Hooks ====================
invoiceAdminSchema.pre('save', async function(next) {
  // Calculate totals if line items changed
  if (this.isModified('lineItems')) {
    let subtotal = 0;
    let totalTax = 0;

    for (const item of this.lineItems) {
      if (item.itemType !== 'TAX' && item.itemType !== 'DISCOUNT') {
        subtotal += item.amount;
      }
      if (item.taxAmount) {
        totalTax += item.taxAmount;
      }
    }

    this.financialSummary.subtotal = subtotal;
    this.financialSummary.totalTax = totalTax;
    this.financialSummary.grandTotal = subtotal + totalTax;
    
    if (!this.isModified('financialSummary.amountDue')) {
      this.financialSummary.amountDue = this.financialSummary.grandTotal;
    }
  }

  // Update aging information
  if (this.invoiceDetails.dueDate && this.paymentInfo.paymentStatus !== 'PAID') {
    this.calculateAging();
  }

  // Update modification timestamp
  this.metadata.lastModifiedAt = new Date();

  next();
});

// ==================== Model Export ====================
const InvoiceAdmin = mongoose.model('InvoiceAdmin', invoiceAdminSchema);

module.exports = InvoiceAdmin;