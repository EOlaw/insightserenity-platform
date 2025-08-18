'use strict';

/**
 * @fileoverview Enterprise billing administration model for comprehensive financial management
 * @module servers/admin-server/modules/billing-administration/models/billing-admin-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/formatters/currency-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const currencyFormatter = require('../../../../../shared/lib/utils/formatters/currency-formatter');
const { STATUS_CODES } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * @class BillingAdminSchema
 * @description Comprehensive billing administration schema for enterprise financial management
 * @extends mongoose.Schema
 */
const billingAdminSchema = new mongoose.Schema({
  // ==================== Core Billing Identification ====================
  billingAdminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `BILL-ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for billing administration record'
  },

  billingReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization entity'
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      index: true,
      description: 'Reference to billing account'
    },
    customerId: {
      type: String,
      unique: true,
      sparse: true,
      description: 'Customer identifier in payment system'
    },
    externalBillingId: {
      type: String,
      sparse: true,
      description: 'External billing system identifier'
    },
    parentBillingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingAdmin',
      sparse: true,
      description: 'Parent billing record for hierarchical billing'
    }
  },

  // ==================== Billing Configuration ====================
  billingConfiguration: {
    billingType: {
      type: String,
      enum: ['SUBSCRIPTION', 'USAGE_BASED', 'HYBRID', 'ONE_TIME', 'PROJECT_BASED', 'RETAINER', 'MILESTONE'],
      required: true,
      index: true
    },
    
    billingCycle: {
      frequency: {
        type: String,
        enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'BIENNIAL', 'CUSTOM'],
        required: true
      },
      startDate: {
        type: Date,
        required: true
      },
      endDate: Date,
      customInterval: {
        value: Number,
        unit: {
          type: String,
          enum: ['DAYS', 'WEEKS', 'MONTHS', 'YEARS']
        }
      },
      anniversaryDate: Number,
      timezone: {
        type: String,
        default: 'UTC'
      }
    },
    
    paymentTerms: {
      netTerms: {
        type: Number,
        default: 30
      },
      earlyPaymentDiscount: {
        percentage: Number,
        daysWithin: Number
      },
      latePaymentPenalty: {
        percentage: Number,
        gracePertiod: Number,
        maxPenalty: Number
      },
      paymentMethods: [{
        type: String,
        enum: ['CREDIT_CARD', 'ACH', 'WIRE_TRANSFER', 'CHECK', 'PAYPAL', 'CRYPTO', 'INVOICE']
      }],
      preferredPaymentMethod: String,
      autoPayEnabled: {
        type: Boolean,
        default: false
      }
    },
    
    currency: {
      primary: {
        type: String,
        default: 'USD',
        required: true
      },
      supported: [String],
      exchangeRates: [{
        currency: String,
        rate: Number,
        lastUpdated: Date
      }],
      multiCurrencyEnabled: {
        type: Boolean,
        default: false
      }
    },
    
    invoiceSettings: {
      autoGenerate: {
        type: Boolean,
        default: true
      },
      template: {
        type: String,
        default: 'DEFAULT'
      },
      numbering: {
        prefix: String,
        suffix: String,
        nextNumber: Number,
        format: String
      },
      dueDaysAfterIssue: {
        type: Number,
        default: 30
      },
      includeTaxDetails: {
        type: Boolean,
        default: true
      },
      customFields: [{
        fieldName: String,
        fieldValue: mongoose.Schema.Types.Mixed,
        includeOnInvoice: Boolean
      }]
    },
    
    contractDetails: {
      contractId: String,
      contractStartDate: Date,
      contractEndDate: Date,
      contractValue: Number,
      contractType: {
        type: String,
        enum: ['FIXED_PRICE', 'TIME_MATERIALS', 'RETAINER', 'SUBSCRIPTION', 'MILESTONE']
      },
      autoRenewal: {
        enabled: Boolean,
        renewalPeriod: Number,
        renewalNotice: Number
      },
      terms: mongoose.Schema.Types.Mixed,
      attachments: [{
        documentId: String,
        documentName: String,
        documentUrl: String,
        uploadedAt: Date
      }]
    }
  },

  // ==================== Subscription Management ====================
  subscriptionManagement: {
    currentSubscription: {
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
      },
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PricingPlan'
      },
      planName: String,
      tier: {
        type: String,
        enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE', 'CUSTOM']
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING', 'TRIAL'],
        index: true
      },
      startDate: Date,
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
      trialEndDate: Date,
      cancellationDate: Date,
      mrr: Number,
      arr: Number
    },
    
    subscriptionHistory: [{
      subscriptionId: String,
      planName: String,
      tier: String,
      startDate: Date,
      endDate: Date,
      mrr: Number,
      reason: String,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    addons: [{
      addonId: String,
      addonName: String,
      addonType: {
        type: String,
        enum: ['FEATURE', 'RESOURCE', 'SERVICE', 'SUPPORT']
      },
      quantity: Number,
      unitPrice: Number,
      totalPrice: Number,
      billingCycle: String,
      startDate: Date,
      endDate: Date,
      autoRenew: Boolean,
      status: String
    }],
    
    usage: {
      limits: {
        users: Number,
        storage: Number,
        apiCalls: Number,
        projects: Number,
        customLimits: mongoose.Schema.Types.Mixed
      },
      current: {
        users: Number,
        storage: Number,
        apiCalls: Number,
        projects: Number,
        customUsage: mongoose.Schema.Types.Mixed,
        lastUpdated: Date
      },
      overage: {
        allowed: Boolean,
        charges: [{
          metric: String,
          overage: Number,
          rate: Number,
          amount: Number,
          period: Date
        }]
      }
    },
    
    upgradePath: {
      availableUpgrades: [{
        planId: String,
        planName: String,
        tier: String,
        price: Number,
        features: [String],
        limitations: mongoose.Schema.Types.Mixed
      }],
      recommendedUpgrade: {
        planId: String,
        reason: String,
        potentialSavings: Number
      },
      upgradeHistory: [{
        fromPlan: String,
        toPlan: String,
        upgradeDate: Date,
        reason: String,
        upgradedBy: mongoose.Schema.Types.ObjectId
      }]
    }
  },

  // ==================== Payment Processing ====================
  paymentProcessing: {
    paymentGateway: {
      provider: {
        type: String,
        enum: ['STRIPE', 'PAYPAL', 'SQUARE', 'AUTHORIZE_NET', 'BRAINTREE', 'CUSTOM'],
        required: true
      },
      customerId: String,
      accountId: String,
      merchantId: String,
      publicKey: String,
      webhookEndpoint: String,
      testMode: {
        type: Boolean,
        default: false
      }
    },
    
    paymentMethods: [{
      methodId: String,
      methodType: {
        type: String,
        enum: ['CARD', 'BANK_ACCOUNT', 'PAYPAL', 'WALLET', 'CRYPTO', 'CHECK', 'WIRE']
      },
      isDefault: Boolean,
      cardDetails: {
        last4: String,
        brand: String,
        expiryMonth: Number,
        expiryYear: Number,
        cardholderName: String
      },
      bankDetails: {
        accountType: String,
        last4: String,
        bankName: String,
        routingNumber: String
      },
      walletDetails: {
        walletType: String,
        email: String
      },
      verificationStatus: {
        type: String,
        enum: ['VERIFIED', 'PENDING', 'FAILED', 'NOT_REQUIRED']
      },
      addedAt: Date,
      lastUsedAt: Date,
      metadata: mongoose.Schema.Types.Mixed
    }],
    
    transactions: [{
      transactionId: String,
      transactionType: {
        type: String,
        enum: ['CHARGE', 'REFUND', 'PARTIAL_REFUND', 'CHARGEBACK', 'ADJUSTMENT', 'CREDIT']
      },
      amount: Number,
      currency: String,
      status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DISPUTED']
      },
      paymentMethodId: String,
      invoiceId: String,
      description: String,
      processedAt: Date,
      gatewayResponse: mongoose.Schema.Types.Mixed,
      metadata: mongoose.Schema.Types.Mixed,
      errorDetails: String
    }],
    
    recurringCharges: [{
      chargeId: String,
      description: String,
      amount: Number,
      currency: String,
      interval: String,
      intervalCount: Number,
      nextChargeDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']
      },
      retryPolicy: {
        maxAttempts: Number,
        retryInterval: Number
      },
      failureCount: Number,
      lastAttemptDate: Date
    }],
    
    paymentSchedule: [{
      scheduleId: String,
      scheduleType: {
        type: String,
        enum: ['INSTALLMENT', 'MILESTONE', 'RECURRING', 'CUSTOM']
      },
      totalAmount: Number,
      installments: [{
        installmentNumber: Number,
        amount: Number,
        dueDate: Date,
        status: String,
        paidDate: Date,
        paymentId: String
      }],
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId
    }]
  },

  // ==================== Revenue Analytics ====================
  revenueAnalytics: {
    metrics: {
      totalRevenue: {
        lifetime: Number,
        currentYear: Number,
        currentQuarter: Number,
        currentMonth: Number,
        lastUpdated: Date
      },
      recurringRevenue: {
        mrr: Number,
        arr: Number,
        qrr: Number,
        growth: {
          mrrGrowth: Number,
          arrGrowth: Number,
          growthRate: Number
        }
      },
      averageRevenue: {
        arpu: Number,
        arpa: Number,
        ltv: Number,
        paybackPeriod: Number
      },
      churn: {
        customerChurn: Number,
        revenueChurn: Number,
        netRevenueRetention: Number,
        grossRevenueRetention: Number
      },
      collections: {
        collectionRate: Number,
        dso: Number,
        overdueAmount: Number,
        writeOffAmount: Number
      }
    },
    
    forecasting: {
      projectedMRR: [{
        month: Date,
        projected: Number,
        confidence: Number,
        bestCase: Number,
        worstCase: Number
      }],
      projectedARR: Number,
      pipelineValue: Number,
      winRate: Number,
      salesCycle: Number
    },
    
    cohortAnalysis: {
      cohorts: [{
        cohortMonth: Date,
        customers: Number,
        initialMRR: Number,
        currentMRR: Number,
        retention: [{
          month: Number,
          retained: Number,
          revenue: Number,
          percentage: Number
        }]
      }],
      averageRetention: Number,
      bestPerformingCohort: Date
    },
    
    segmentation: {
      byPlan: [{
        planName: String,
        customers: Number,
        revenue: Number,
        percentage: Number,
        avgRevenue: Number
      }],
      byRegion: [{
        region: String,
        customers: Number,
        revenue: Number,
        percentage: Number
      }],
      byIndustry: [{
        industry: String,
        customers: Number,
        revenue: Number,
        percentage: Number
      }],
      bySize: [{
        size: String,
        customers: Number,
        revenue: Number,
        percentage: Number
      }]
    }
  },

  // ==================== Tax Configuration ====================
  taxConfiguration: {
    taxSettings: {
      taxEnabled: {
        type: Boolean,
        default: true
      },
      taxProvider: {
        type: String,
        enum: ['AVALARA', 'TAXJAR', 'STRIPE_TAX', 'MANUAL', 'CUSTOM']
      },
      defaultTaxRate: Number,
      taxIdNumber: String,
      taxExempt: {
        type: Boolean,
        default: false
      },
      exemptionCertificate: {
        certificateNumber: String,
        expirationDate: Date,
        documentUrl: String
      }
    },
    
    taxRates: [{
      jurisdiction: String,
      country: String,
      state: String,
      city: String,
      postalCode: String,
      rate: Number,
      taxType: {
        type: String,
        enum: ['SALES', 'VAT', 'GST', 'PST', 'HST', 'CUSTOM']
      },
      effectiveDate: Date,
      expirationDate: Date,
      compound: Boolean
    }],
    
    taxCalculations: [{
      invoiceId: String,
      subtotal: Number,
      taxableAmount: Number,
      taxDetails: [{
        jurisdiction: String,
        rate: Number,
        amount: Number,
        taxType: String
      }],
      totalTax: Number,
      total: Number,
      calculatedAt: Date
    }],
    
    taxReporting: {
      reportingPeriod: {
        type: String,
        enum: ['MONTHLY', 'QUARTERLY', 'ANNUAL']
      },
      filingDeadlines: [{
        jurisdiction: String,
        deadline: Date,
        filed: Boolean,
        filedDate: Date,
        confirmationNumber: String
      }],
      taxLiability: {
        current: Number,
        collected: Number,
        remitted: Number,
        pending: Number
      }
    },
    
    complianceTracking: {
      nexusStates: [String],
      registrations: [{
        jurisdiction: String,
        registrationNumber: String,
        registrationDate: Date,
        status: String
      }],
      audits: [{
        auditId: String,
        jurisdiction: String,
        period: String,
        status: String,
        findings: mongoose.Schema.Types.Mixed,
        completedDate: Date
      }]
    }
  },

  // ==================== Financial Reporting ====================
  financialReporting: {
    statements: {
      incomeStatement: {
        revenue: Number,
        costOfGoodsSold: Number,
        grossProfit: Number,
        operatingExpenses: Number,
        netIncome: Number,
        period: String,
        generatedAt: Date
      },
      balanceSheet: {
        assets: {
          current: Number,
          fixed: Number,
          total: Number
        },
        liabilities: {
          current: Number,
          longTerm: Number,
          total: Number
        },
        equity: Number,
        generatedAt: Date
      },
      cashFlow: {
        operating: Number,
        investing: Number,
        financing: Number,
        netChange: Number,
        endingCash: Number,
        period: String
      }
    },
    
    customReports: [{
      reportId: String,
      reportName: String,
      reportType: String,
      schedule: {
        frequency: String,
        nextRun: Date,
        recipients: [String]
      },
      parameters: mongoose.Schema.Types.Mixed,
      lastGenerated: Date,
      format: String
    }],
    
    kpis: [{
      kpiName: String,
      value: Number,
      target: Number,
      variance: Number,
      trend: String,
      period: String,
      category: String
    }],
    
    budgeting: {
      budgets: [{
        budgetName: String,
        period: String,
        amount: Number,
        allocated: Number,
        spent: Number,
        remaining: Number,
        variance: Number,
        department: String
      }],
      forecasts: [{
        forecastName: String,
        period: String,
        projected: Number,
        actual: Number,
        variance: Number,
        accuracy: Number
      }]
    }
  },

  // ==================== Discount Management ====================
  discountManagement: {
    activeDiscounts: [{
      discountId: String,
      discountCode: String,
      discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FIXED_AMOUNT', 'TRIAL_EXTENSION', 'FREE_ADDON', 'VOLUME']
      },
      value: Number,
      applicableTo: {
        type: String,
        enum: ['SUBSCRIPTION', 'ADDON', 'USAGE', 'ALL']
      },
      duration: {
        type: String,
        enum: ['ONCE', 'REPEATING', 'FOREVER']
      },
      durationInMonths: Number,
      validFrom: Date,
      validUntil: Date,
      usageLimit: Number,
      usageCount: Number,
      minimumAmount: Number,
      maximumDiscount: Number,
      stackable: Boolean,
      autoApply: Boolean,
      conditions: mongoose.Schema.Types.Mixed
    }],
    
    promotions: [{
      promotionId: String,
      promotionName: String,
      promotionType: String,
      startDate: Date,
      endDate: Date,
      targetSegment: [String],
      rules: mongoose.Schema.Types.Mixed,
      performance: {
        views: Number,
        conversions: Number,
        revenue: Number,
        roi: Number
      }
    }],
    
    loyaltyProgram: {
      enrolled: Boolean,
      tier: String,
      points: Number,
      lifetimePoints: Number,
      rewards: [{
        rewardId: String,
        rewardType: String,
        pointsCost: Number,
        redeemed: Boolean,
        redeemedAt: Date
      }],
      tierBenefits: [String]
    },
    
    volumeDiscounts: [{
      tier: Number,
      minQuantity: Number,
      maxQuantity: Number,
      discountPercentage: Number,
      applicableProducts: [String]
    }]
  },

  // ==================== Compliance & Audit ====================
  complianceAudit: {
    regulatoryCompliance: {
      frameworks: [{
        framework: {
          type: String,
          enum: ['PCI_DSS', 'SOX', 'GAAP', 'IFRS', 'SOC2', 'ISO27001']
        },
        status: {
          type: String,
          enum: ['COMPLIANT', 'NON_COMPLIANT', 'IN_PROGRESS', 'NOT_APPLICABLE']
        },
        lastAudit: Date,
        nextAudit: Date,
        findings: [mongoose.Schema.Types.Mixed],
        remediations: [mongoose.Schema.Types.Mixed]
      }],
      certifications: [{
        certification: String,
        issuer: String,
        issueDate: Date,
        expiryDate: Date,
        documentUrl: String
      }]
    },
    
    auditTrail: [{
      auditId: String,
      action: String,
      entity: String,
      entityId: String,
      performedBy: mongoose.Schema.Types.ObjectId,
      performedAt: Date,
      changes: mongoose.Schema.Types.Mixed,
      ipAddress: String,
      userAgent: String,
      result: String
    }],
    
    financialControls: {
      approvalLimits: [{
        role: String,
        maxAmount: Number,
        requiresDualApproval: Boolean,
        approvalChain: [String]
      }],
      segregationOfDuties: [{
        function: String,
        restrictions: [String],
        allowedRoles: [String]
      }],
      reconiliations: [{
        type: String,
        frequency: String,
        lastPerformed: Date,
        performedBy: mongoose.Schema.Types.ObjectId,
        discrepancies: [mongoose.Schema.Types.Mixed]
      }]
    },
    
    riskAssessment: {
      creditRisk: {
        score: Number,
        rating: String,
        factors: [String],
        mitigations: [String],
        lastAssessed: Date
      },
      fraudRisk: {
        score: Number,
        indicators: [String],
        preventionMeasures: [String],
        incidents: [{
          incidentId: String,
          date: Date,
          amount: Number,
          description: String,
          resolution: String
        }]
      }
    }
  },

  // ==================== Integration Configuration ====================
  integrationConfig: {
    accountingSystems: [{
      system: {
        type: String,
        enum: ['QUICKBOOKS', 'XERO', 'SAGE', 'SAP', 'NETSUITE', 'CUSTOM']
      },
      connectionStatus: String,
      syncEnabled: Boolean,
      syncFrequency: String,
      lastSync: Date,
      mappings: mongoose.Schema.Types.Mixed,
      credentials: mongoose.Schema.Types.Mixed
    }],
    
    paymentGateways: [{
      gateway: String,
      enabled: Boolean,
      configuration: mongoose.Schema.Types.Mixed,
      supportedMethods: [String],
      supportedCurrencies: [String],
      webhooks: [{
        event: String,
        url: String,
        active: Boolean
      }]
    }],
    
    erpSystems: [{
      system: String,
      module: String,
      syncEnabled: Boolean,
      dataFlows: [{
        direction: String,
        entity: String,
        frequency: String,
        lastSync: Date
      }]
    }],
    
    apiIntegrations: [{
      apiName: String,
      apiVersion: String,
      endpoint: String,
      authentication: mongoose.Schema.Types.Mixed,
      rateLimits: {
        requests: Number,
        period: String
      },
      usage: {
        calls: Number,
        lastCall: Date
      }
    }]
  },

  // ==================== Notifications & Alerts ====================
  notificationSettings: {
    billingAlerts: {
      paymentFailure: {
        enabled: Boolean,
        recipients: [String],
        channels: [String]
      },
      paymentSuccess: {
        enabled: Boolean,
        recipients: [String],
        channels: [String]
      },
      subscriptionExpiry: {
        enabled: Boolean,
        daysBefor: Number,
        recipients: [String]
      },
      usageThreshold: {
        enabled: Boolean,
        thresholds: [{
          metric: String,
          value: Number,
          recipients: [String]
        }]
      },
      invoiceDue: {
        enabled: Boolean,
        daysBefore: [Number],
        recipients: [String]
      }
    },
    
    customAlerts: [{
      alertId: String,
      alertName: String,
      condition: mongoose.Schema.Types.Mixed,
      recipients: [String],
      channels: [String],
      frequency: String,
      active: Boolean
    }],
    
    communicationLog: [{
      messageId: String,
      type: String,
      recipient: String,
      subject: String,
      channel: String,
      sentAt: Date,
      status: String,
      opens: Number,
      clicks: Number
    }]
  },

  // ==================== Lifecycle Management ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'DELINQUENT', 'CHURNED', 'ARCHIVED'],
      default: 'ACTIVE',
      required: true,
      index: true
    },
    
    customerJourney: {
      acquisitionDate: Date,
      acquisitionChannel: String,
      activationDate: Date,
      firstPaymentDate: Date,
      lastPaymentDate: Date,
      suspensionDate: Date,
      reactivationDate: Date,
      churnDate: Date,
      winBackDate: Date
    },
    
    health: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      factors: {
        paymentHistory: Number,
        usageEngagement: Number,
        supportInteractions: Number,
        productAdoption: Number
      },
      riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      },
      churnProbability: Number,
      recommendedActions: [String]
    },
    
    retentionStrategies: [{
      strategyId: String,
      strategyType: String,
      appliedAt: Date,
      outcome: String,
      effectiveness: Number
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
    version: {
      type: Number,
      default: 1
    },
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed,
    notes: [{
      noteId: String,
      note: String,
      addedBy: mongoose.Schema.Types.ObjectId,
      addedAt: Date,
      category: String
    }]
  }
}, {
  timestamps: true,
  collection: 'billing_admin',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
billingAdminSchema.index({ 'billingReference.organizationId': 1, 'lifecycle.status': 1 });
billingAdminSchema.index({ 'billingConfiguration.billingType': 1, 'subscriptionManagement.currentSubscription.status': 1 });
billingAdminSchema.index({ 'paymentProcessing.transactions.transactionId': 1 });
billingAdminSchema.index({ 'subscriptionManagement.currentSubscription.tier': 1 });
billingAdminSchema.index({ 'revenueAnalytics.metrics.totalRevenue.lifetime': -1 });
billingAdminSchema.index({ 'lifecycle.customerJourney.acquisitionDate': -1 });
billingAdminSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
billingAdminSchema.virtual('isActive').get(function() {
  return this.lifecycle.status === 'ACTIVE' && 
         this.subscriptionManagement.currentSubscription.status === 'ACTIVE';
});

billingAdminSchema.virtual('currentMRR').get(function() {
  return this.subscriptionManagement.currentSubscription.mrr || 0;
});

billingAdminSchema.virtual('outstandingBalance').get(function() {
  const overdueAmount = this.revenueAnalytics.metrics.collections.overdueAmount || 0;
  return overdueAmount;
});

billingAdminSchema.virtual('healthScore').get(function() {
  return this.lifecycle.health.score || 0;
});

// ==================== Instance Methods ====================

/**
 * Process payment for the billing account
 * @async
 * @param {Object} paymentData - Payment information
 * @param {Object} processingOptions - Processing options
 * @returns {Promise<Object>} Payment result
 */
billingAdminSchema.methods.processPayment = async function(paymentData, processingOptions = {}) {
  try {
    const transaction = {
      transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      transactionType: paymentData.type || 'CHARGE',
      amount: paymentData.amount,
      currency: paymentData.currency || this.billingConfiguration.currency.primary,
      status: 'PENDING',
      paymentMethodId: paymentData.paymentMethodId,
      invoiceId: paymentData.invoiceId,
      description: paymentData.description,
      processedAt: new Date(),
      metadata: paymentData.metadata || {}
    };

    // Validate payment method
    const paymentMethod = this.paymentProcessing.paymentMethods.find(
      method => method.methodId === paymentData.paymentMethodId
    );

    if (!paymentMethod) {
      throw new AppError('Invalid payment method', 400);
    }

    // Process based on gateway
    const gateway = this.paymentProcessing.paymentGateway.provider;
    let gatewayResponse;

    switch (gateway) {
      case 'STRIPE':
        gatewayResponse = await this.#processStripePayment(paymentData, paymentMethod);
        break;
      case 'PAYPAL':
        gatewayResponse = await this.#processPayPalPayment(paymentData, paymentMethod);
        break;
      case 'SQUARE':
        gatewayResponse = await this.#processSquarePayment(paymentData, paymentMethod);
        break;
      default:
        gatewayResponse = await this.#processCustomPayment(paymentData, paymentMethod);
    }

    transaction.gatewayResponse = gatewayResponse;
    transaction.status = gatewayResponse.success ? 'COMPLETED' : 'FAILED';

    if (gatewayResponse.error) {
      transaction.errorDetails = gatewayResponse.error;
    }

    this.paymentProcessing.transactions.push(transaction);

    // Update revenue metrics
    if (transaction.status === 'COMPLETED') {
      await this.updateRevenueMetrics(transaction.amount);
    }

    await this.save();

    logger.info(`Payment processed for billing ${this.billingAdminId}: ${transaction.transactionId}`);
    return { success: true, transaction };

  } catch (error) {
    logger.error(`Failed to process payment for ${this.billingAdminId}:`, error);
    throw error;
  }
};

/**
 * Generate invoice for the billing period
 * @async
 * @param {Object} invoiceData - Invoice generation data
 * @returns {Promise<Object>} Generated invoice
 */
billingAdminSchema.methods.generateInvoice = async function(invoiceData = {}) {
  try {
    const invoiceNumber = this.#generateInvoiceNumber();
    
    const invoice = {
      invoiceId: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      invoiceNumber,
      billingPeriod: {
        start: invoiceData.periodStart || this.subscriptionManagement.currentSubscription.currentPeriodStart,
        end: invoiceData.periodEnd || this.subscriptionManagement.currentSubscription.currentPeriodEnd
      },
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      status: 'DRAFT',
      dueDate: dateHelper.addDays(new Date(), this.billingConfiguration.invoiceSettings.dueDaysAfterIssue),
      generatedAt: new Date()
    };

    // Add subscription charges
    if (this.subscriptionManagement.currentSubscription.status === 'ACTIVE') {
      invoice.items.push({
        description: `${this.subscriptionManagement.currentSubscription.planName} Subscription`,
        quantity: 1,
        unitPrice: this.subscriptionManagement.currentSubscription.mrr,
        amount: this.subscriptionManagement.currentSubscription.mrr
      });
      invoice.subtotal += this.subscriptionManagement.currentSubscription.mrr;
    }

    // Add addon charges
    for (const addon of this.subscriptionManagement.addons) {
      if (addon.status === 'ACTIVE') {
        invoice.items.push({
          description: addon.addonName,
          quantity: addon.quantity,
          unitPrice: addon.unitPrice,
          amount: addon.totalPrice
        });
        invoice.subtotal += addon.totalPrice;
      }
    }

    // Add usage overage charges
    if (this.subscriptionManagement.usage.overage.allowed) {
      for (const overage of this.subscriptionManagement.usage.overage.charges) {
        invoice.items.push({
          description: `${overage.metric} Overage`,
          quantity: overage.overage,
          unitPrice: overage.rate,
          amount: overage.amount
        });
        invoice.subtotal += overage.amount;
      }
    }

    // Calculate tax
    if (this.taxConfiguration.taxSettings.taxEnabled) {
      invoice.tax = await this.calculateTax(invoice.subtotal);
    }

    // Apply discounts
    const discount = await this.calculateApplicableDiscounts(invoice.subtotal);
    if (discount > 0) {
      invoice.items.push({
        description: 'Discount',
        amount: -discount
      });
      invoice.subtotal -= discount;
    }

    invoice.total = invoice.subtotal + invoice.tax;

    logger.info(`Invoice generated for billing ${this.billingAdminId}: ${invoice.invoiceNumber}`);
    return invoice;

  } catch (error) {
    logger.error(`Failed to generate invoice for ${this.billingAdminId}:`, error);
    throw error;
  }
};

/**
 * Calculate applicable taxes
 * @async
 * @param {Number} amount - Taxable amount
 * @returns {Promise<Number>} Tax amount
 */
billingAdminSchema.methods.calculateTax = async function(amount) {
  try {
    if (!this.taxConfiguration.taxSettings.taxEnabled) {
      return 0;
    }

    if (this.taxConfiguration.taxSettings.taxExempt) {
      return 0;
    }

    let totalTax = 0;
    const taxCalculation = {
      invoiceId: `CALC-${Date.now()}`,
      subtotal: amount,
      taxableAmount: amount,
      taxDetails: [],
      calculatedAt: new Date()
    };

    // Apply applicable tax rates
    for (const taxRate of this.taxConfiguration.taxRates) {
      if (this.#isTaxRateApplicable(taxRate)) {
        const taxAmount = amount * (taxRate.rate / 100);
        taxCalculation.taxDetails.push({
          jurisdiction: taxRate.jurisdiction,
          rate: taxRate.rate,
          amount: taxAmount,
          taxType: taxRate.taxType
        });
        totalTax += taxAmount;
      }
    }

    taxCalculation.totalTax = totalTax;
    taxCalculation.total = amount + totalTax;

    this.taxConfiguration.taxCalculations.push(taxCalculation);
    await this.save();

    return totalTax;

  } catch (error) {
    logger.error(`Failed to calculate tax for ${this.billingAdminId}:`, error);
    throw error;
  }
};

/**
 * Apply subscription upgrade
 * @async
 * @param {Object} upgradeData - Upgrade information
 * @returns {Promise<Object>} Upgrade result
 */
billingAdminSchema.methods.upgradeSubscription = async function(upgradeData) {
  try {
    const currentSubscription = this.subscriptionManagement.currentSubscription;
    
    // Store current subscription in history
    this.subscriptionManagement.subscriptionHistory.push({
      subscriptionId: currentSubscription.subscriptionId,
      planName: currentSubscription.planName,
      tier: currentSubscription.tier,
      startDate: currentSubscription.startDate,
      endDate: new Date(),
      mrr: currentSubscription.mrr,
      reason: upgradeData.reason || 'UPGRADE',
      changedBy: upgradeData.changedBy
    });

    // Update to new subscription
    currentSubscription.planId = upgradeData.planId;
    currentSubscription.planName = upgradeData.planName;
    currentSubscription.tier = upgradeData.tier;
    currentSubscription.mrr = upgradeData.mrr;
    currentSubscription.arr = upgradeData.mrr * 12;
    currentSubscription.startDate = new Date();
    currentSubscription.currentPeriodStart = new Date();
    currentSubscription.currentPeriodEnd = dateHelper.addMonths(new Date(), 1);

    // Update usage limits
    if (upgradeData.limits) {
      this.subscriptionManagement.usage.limits = upgradeData.limits;
    }

    // Track upgrade
    this.subscriptionManagement.upgradePath.upgradeHistory.push({
      fromPlan: this.subscriptionManagement.subscriptionHistory[this.subscriptionManagement.subscriptionHistory.length - 1].planName,
      toPlan: upgradeData.planName,
      upgradeDate: new Date(),
      reason: upgradeData.reason,
      upgradedBy: upgradeData.changedBy
    });

    // Update revenue metrics
    await this.updateRevenueMetrics();

    await this.save();

    logger.info(`Subscription upgraded for billing ${this.billingAdminId}`);
    return { success: true, subscription: currentSubscription };

  } catch (error) {
    logger.error(`Failed to upgrade subscription for ${this.billingAdminId}:`, error);
    throw error;
  }
};

/**
 * Process refund for a transaction
 * @async
 * @param {String} transactionId - Original transaction ID
 * @param {Object} refundData - Refund information
 * @returns {Promise<Object>} Refund result
 */
billingAdminSchema.methods.processRefund = async function(transactionId, refundData) {
  try {
    const originalTransaction = this.paymentProcessing.transactions.find(
      txn => txn.transactionId === transactionId
    );

    if (!originalTransaction) {
      throw new AppError('Original transaction not found', 404);
    }

    if (originalTransaction.status !== 'COMPLETED') {
      throw new AppError('Cannot refund non-completed transaction', 400);
    }

    const refundAmount = refundData.amount || originalTransaction.amount;
    if (refundAmount > originalTransaction.amount) {
      throw new AppError('Refund amount exceeds original transaction', 400);
    }

    const refundTransaction = {
      transactionId: `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      transactionType: refundAmount === originalTransaction.amount ? 'REFUND' : 'PARTIAL_REFUND',
      amount: -refundAmount,
      currency: originalTransaction.currency,
      status: 'PENDING',
      paymentMethodId: originalTransaction.paymentMethodId,
      invoiceId: originalTransaction.invoiceId,
      description: refundData.reason || 'Refund',
      processedAt: new Date(),
      metadata: {
        originalTransactionId: transactionId,
        refundReason: refundData.reason
      }
    };

    // Process refund through gateway
    const gateway = this.paymentProcessing.paymentGateway.provider;
    const gatewayResponse = await this.#processGatewayRefund(gateway, originalTransaction, refundAmount);

    refundTransaction.gatewayResponse = gatewayResponse;
    refundTransaction.status = gatewayResponse.success ? 'COMPLETED' : 'FAILED';

    this.paymentProcessing.transactions.push(refundTransaction);

    // Update revenue metrics
    if (refundTransaction.status === 'COMPLETED') {
      await this.updateRevenueMetrics(-refundAmount);
    }

    await this.save();

    logger.info(`Refund processed for billing ${this.billingAdminId}: ${refundTransaction.transactionId}`);
    return { success: true, refund: refundTransaction };

  } catch (error) {
    logger.error(`Failed to process refund for ${this.billingAdminId}:`, error);
    throw error;
  }
};

/**
 * Update revenue metrics
 * @async
 * @param {Number} amount - Amount to update (optional)
 * @returns {Promise<void>}
 */
billingAdminSchema.methods.updateRevenueMetrics = async function(amount = 0) {
  try {
    const metrics = this.revenueAnalytics.metrics;
    const now = new Date();

    // Update total revenue
    if (amount !== 0) {
      metrics.totalRevenue.lifetime += amount;
      metrics.totalRevenue.currentMonth += amount;
      metrics.totalRevenue.currentQuarter += amount;
      metrics.totalRevenue.currentYear += amount;
    }

    // Update recurring revenue
    metrics.recurringRevenue.mrr = this.subscriptionManagement.currentSubscription.mrr || 0;
    metrics.recurringRevenue.arr = metrics.recurringRevenue.mrr * 12;
    metrics.recurringRevenue.qrr = metrics.recurringRevenue.mrr * 3;

    // Calculate growth
    const previousMRR = this.subscriptionManagement.subscriptionHistory.length > 0
      ? this.subscriptionManagement.subscriptionHistory[this.subscriptionManagement.subscriptionHistory.length - 1].mrr
      : 0;
    
    metrics.recurringRevenue.growth.mrrGrowth = metrics.recurringRevenue.mrr - previousMRR;
    metrics.recurringRevenue.growth.growthRate = previousMRR > 0
      ? ((metrics.recurringRevenue.mrr - previousMRR) / previousMRR) * 100
      : 0;

    metrics.totalRevenue.lastUpdated = now;

    await this.save();

  } catch (error) {
    logger.error(`Failed to update revenue metrics for ${this.billingAdminId}:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================

/**
 * Find all active billing accounts
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} Active billing accounts
 */
billingAdminSchema.statics.findActiveBillingAccounts = async function(filters = {}) {
  const query = {
    'lifecycle.status': 'ACTIVE',
    'subscriptionManagement.currentSubscription.status': 'ACTIVE'
  };

  if (filters.tier) {
    query['subscriptionManagement.currentSubscription.tier'] = filters.tier;
  }

  if (filters.billingType) {
    query['billingConfiguration.billingType'] = filters.billingType;
  }

  return this.find(query).sort({ 'revenueAnalytics.metrics.totalRevenue.lifetime': -1 });
};

/**
 * Find delinquent accounts
 * @static
 * @async
 * @returns {Promise<Array>} Delinquent accounts
 */
billingAdminSchema.statics.findDelinquentAccounts = async function() {
  return this.find({
    $or: [
      { 'lifecycle.status': 'DELINQUENT' },
      { 'revenueAnalytics.metrics.collections.overdueAmount': { $gt: 0 } }
    ]
  }).sort({ 'revenueAnalytics.metrics.collections.overdueAmount': -1 });
};

/**
 * Calculate platform-wide revenue metrics
 * @static
 * @async
 * @returns {Promise<Object>} Platform revenue metrics
 */
billingAdminSchema.statics.calculatePlatformRevenue = async function() {
  const aggregation = await this.aggregate([
    {
      $match: {
        'lifecycle.status': { $in: ['ACTIVE', 'SUSPENDED'] }
      }
    },
    {
      $group: {
        _id: null,
        totalMRR: { $sum: '$subscriptionManagement.currentSubscription.mrr' },
        totalARR: { $sum: '$subscriptionManagement.currentSubscription.arr' },
        totalLifetimeRevenue: { $sum: '$revenueAnalytics.metrics.totalRevenue.lifetime' },
        activeAccounts: { $sum: 1 }
      }
    }
  ]);

  return aggregation[0] || {
    totalMRR: 0,
    totalARR: 0,
    totalLifetimeRevenue: 0,
    activeAccounts: 0
  };
};

// ==================== Private Helper Methods ====================

/**
 * Generate invoice number
 * @private
 * @returns {String} Invoice number
 */
billingAdminSchema.methods.#generateInvoiceNumber = function() {
  const settings = this.billingConfiguration.invoiceSettings.numbering;
  const prefix = settings.prefix || 'INV';
  const suffix = settings.suffix || '';
  const nextNumber = settings.nextNumber || 1;
  
  settings.nextNumber = nextNumber + 1;
  
  return `${prefix}${String(nextNumber).padStart(6, '0')}${suffix}`;
};

/**
 * Check if tax rate is applicable
 * @private
 * @param {Object} taxRate - Tax rate object
 * @returns {Boolean} Is applicable
 */
billingAdminSchema.methods.#isTaxRateApplicable = function(taxRate) {
  const now = new Date();
  
  if (taxRate.effectiveDate && taxRate.effectiveDate > now) {
    return false;
  }
  
  if (taxRate.expirationDate && taxRate.expirationDate < now) {
    return false;
  }
  
  return true;
};

/**
 * Calculate applicable discounts
 * @private
 * @param {Number} amount - Base amount
 * @returns {Promise<Number>} Discount amount
 */
billingAdminSchema.methods.calculateApplicableDiscounts = async function(amount) {
  let totalDiscount = 0;

  for (const discount of this.discountManagement.activeDiscounts) {
    if (this.#isDiscountApplicable(discount)) {
      if (discount.discountType === 'PERCENTAGE') {
        totalDiscount += amount * (discount.value / 100);
      } else if (discount.discountType === 'FIXED_AMOUNT') {
        totalDiscount += discount.value;
      }
    }
  }

  return Math.min(totalDiscount, amount);
};

/**
 * Check if discount is applicable
 * @private
 * @param {Object} discount - Discount object
 * @returns {Boolean} Is applicable
 */
billingAdminSchema.methods.#isDiscountApplicable = function(discount) {
  const now = new Date();
  
  if (discount.validFrom && discount.validFrom > now) {
    return false;
  }
  
  if (discount.validUntil && discount.validUntil < now) {
    return false;
  }
  
  if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
    return false;
  }
  
  return true;
};

// Payment gateway processing methods (simplified implementations)
billingAdminSchema.methods.#processStripePayment = async function(paymentData, paymentMethod) {
  // Stripe payment processing logic
  return { success: true, chargeId: `ch_${Date.now()}` };
};

billingAdminSchema.methods.#processPayPalPayment = async function(paymentData, paymentMethod) {
  // PayPal payment processing logic
  return { success: true, transactionId: `PP_${Date.now()}` };
};

billingAdminSchema.methods.#processSquarePayment = async function(paymentData, paymentMethod) {
  // Square payment processing logic
  return { success: true, paymentId: `sq_${Date.now()}` };
};

billingAdminSchema.methods.#processCustomPayment = async function(paymentData, paymentMethod) {
  // Custom payment processing logic
  return { success: true, referenceId: `CUSTOM_${Date.now()}` };
};

billingAdminSchema.methods.#processGatewayRefund = async function(gateway, originalTransaction, amount) {
  // Gateway refund processing logic
  return { success: true, refundId: `refund_${Date.now()}` };
};

// ==================== Hooks ====================
billingAdminSchema.pre('save', async function(next) {
  // Update health score before saving
  if (this.isModified()) {
    const healthFactors = this.lifecycle.health.factors;
    const weights = {
      paymentHistory: 0.4,
      usageEngagement: 0.2,
      supportInteractions: 0.2,
      productAdoption: 0.2
    };

    let score = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      score += (healthFactors[factor] || 0) * weight;
    }

    this.lifecycle.health.score = Math.round(score);

    // Determine risk level
    if (score >= 80) {
      this.lifecycle.health.riskLevel = 'LOW';
    } else if (score >= 60) {
      this.lifecycle.health.riskLevel = 'MEDIUM';
    } else if (score >= 40) {
      this.lifecycle.health.riskLevel = 'HIGH';
    } else {
      this.lifecycle.health.riskLevel = 'CRITICAL';
    }
  }

  next();
});

// ==================== Model Export ====================
const BillingAdmin = mongoose.model('BillingAdmin', billingAdminSchema);

module.exports = BillingAdmin;