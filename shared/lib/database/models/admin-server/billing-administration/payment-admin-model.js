'use strict';

/**
 * @fileoverview Enterprise payment administration model for comprehensive payment processing
 * @module servers/admin-server/modules/billing-administration/models/payment-admin-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/utils/formatters/currency-formatter
 * @requires module:shared/lib/integrations/payment/stripe-service
 * @requires module:shared/lib/integrations/payment/paypal-service
 * @requires module:shared/lib/integrations/payment/payment-processor
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const EncryptionService = require('../../../../security/encryption/encryption-service');
const CommonValidator = require('../../../../utils/validators/common-validators');
const stringHelper = require('../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../utils/helpers/date-helper');
const cryptoHelper = require('../../../../utils/helpers/crypto-helper');
const currencyFormatter = require('../../../../utils/formatters/currency-formatter');
const StripeService = require('../../../../integrations/payment/stripe-service');
const PayPalService = require('../../../../integrations/payment/paypal-service');
const PaymentProcessor = require('../../../../integrations/payment/payment-processor');

/**
 * @class PaymentAdminSchema
 * @description Comprehensive payment administration schema for enterprise payment processing
 * @extends mongoose.Schema
 */
const paymentAdminSchema = new mongoose.Schema({
  // ==================== Core Payment Identification ====================
  paymentAdminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `PAY-ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for payment administration record'
  },

  paymentReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization'
    },
    billingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingAdmin',
      required: true,
      index: true,
      description: 'Reference to billing account'
    },
    customerId: {
      type: String,
      required: true,
      index: true,
      description: 'Customer identifier'
    },
    merchantAccountId: {
      type: String,
      sparse: true,
      description: 'Merchant account identifier'
    },
    subAccountId: {
      type: String,
      sparse: true,
      description: 'Sub-account for marketplace or platform'
    }
  },

  // ==================== Payment Gateway Configuration ====================
  gatewayConfiguration: {
    primaryGateway: {
      provider: {
        type: String,
        enum: ['STRIPE', 'PAYPAL', 'SQUARE', 'AUTHORIZE_NET', 'BRAINTREE', 'ADYEN', 'WORLDPAY', 'CUSTOM'],
        required: true,
        index: true
      },
      accountId: String,
      merchantId: String,
      publicKey: String,
      privateKey: String,
      webhookSecret: String,
      apiVersion: String,
      environment: {
        type: String,
        enum: ['TEST', 'SANDBOX', 'PRODUCTION'],
        default: 'PRODUCTION'
      },
      capabilities: [{
        capability: String,
        enabled: Boolean,
        configuration: mongoose.Schema.Types.Mixed
      }],
      rateLimits: {
        requestsPerSecond: Number,
        dailyTransactionLimit: Number,
        monthlyVolumeLimit: Number
      },
      connectionStatus: {
        status: {
          type: String,
          enum: ['CONNECTED', 'DISCONNECTED', 'ERROR', 'PENDING'],
          default: 'PENDING'
        },
        lastChecked: Date,
        lastError: String
      }
    },
    
    fallbackGateways: [{
      provider: String,
      priority: Number,
      accountId: String,
      conditions: {
        useForCurrency: [String],
        useForAmount: {
          min: Number,
          max: Number
        },
        useForCountry: [String],
        useOnPrimaryFailure: Boolean
      },
      configuration: mongoose.Schema.Types.Mixed
    }],
    
    routingRules: [{
      ruleId: String,
      ruleName: String,
      priority: Number,
      conditions: {
        paymentMethod: [String],
        currency: [String],
        amount: {
          min: Number,
          max: Number
        },
        country: [String],
        customerType: [String]
      },
      gateway: String,
      active: Boolean
    }],
    
    fraudPrevention: {
      provider: {
        type: String,
        enum: ['INTERNAL', 'SIFT', 'SIGNIFYD', 'RISKIFIED', 'CLEARSALE', 'CUSTOM']
      },
      enabled: Boolean,
      rules: [{
        ruleId: String,
        ruleName: String,
        condition: mongoose.Schema.Types.Mixed,
        action: {
          type: String,
          enum: ['BLOCK', 'REVIEW', 'CHALLENGE', 'ALLOW']
        },
        priority: Number
      }],
      thresholds: {
        riskScore: Number,
        velocityLimits: {
          transactionsPerHour: Number,
          amountPerDay: Number,
          cardsPerAccount: Number
        }
      },
      blacklists: {
        emails: [String],
        ipAddresses: [String],
        cards: [String],
        countries: [String]
      }
    }
  },

  // ==================== Payment Methods Management ====================
  paymentMethods: {
    savedMethods: [{
      methodId: {
        type: String,
        required: true,
        unique: true
      },
      methodType: {
        type: String,
        enum: ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_ACCOUNT', 'PAYPAL', 'APPLE_PAY', 'GOOGLE_PAY', 'CRYPTO', 'WIRE_TRANSFER', 'CHECK'],
        required: true
      },
      isDefault: {
        type: Boolean,
        default: false
      },
      isActive: {
        type: Boolean,
        default: true
      },
      cardDetails: {
        last4: String,
        brand: {
          type: String,
          enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'DINERS', 'JCB', 'UNIONPAY', 'OTHER']
        },
        expiryMonth: Number,
        expiryYear: Number,
        cardholderName: String,
        issuerBank: String,
        country: String,
        funding: {
          type: String,
          enum: ['CREDIT', 'DEBIT', 'PREPAID', 'UNKNOWN']
        },
        fingerprint: String,
        bin: String
      },
      bankAccountDetails: {
        last4: String,
        accountType: {
          type: String,
          enum: ['CHECKING', 'SAVINGS', 'BUSINESS_CHECKING', 'BUSINESS_SAVINGS']
        },
        bankName: String,
        routingNumber: String,
        accountHolderName: String,
        accountHolderType: {
          type: String,
          enum: ['INDIVIDUAL', 'COMPANY']
        },
        status: {
          type: String,
          enum: ['NEW', 'VALIDATED', 'VERIFIED', 'VERIFICATION_FAILED', 'ERRORED']
        }
      },
      digitalWalletDetails: {
        walletType: String,
        email: String,
        phone: String,
        deviceInfo: mongoose.Schema.Types.Mixed
      },
      cryptoDetails: {
        walletAddress: String,
        network: String,
        currency: String
      },
      billingAddress: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
      },
      verification: {
        status: {
          type: String,
          enum: ['PENDING', 'VERIFIED', 'FAILED', 'NOT_REQUIRED']
        },
        verifiedAt: Date,
        verificationMethod: String,
        verificationDetails: mongoose.Schema.Types.Mixed
      },
      tokenization: {
        token: String,
        tokenProvider: String,
        tokenCreatedAt: Date,
        tokenExpiresAt: Date
      },
      metadata: {
        createdAt: Date,
        createdBy: mongoose.Schema.Types.ObjectId,
        lastUsedAt: Date,
        useCount: Number,
        labels: [String],
        customFields: mongoose.Schema.Types.Mixed
      }
    }],
    
    paymentMethodLimits: {
      maxSavedMethods: {
        type: Number,
        default: 10
      },
      maxCardsPerType: {
        credit: Number,
        debit: Number
      },
      maxBankAccounts: Number,
      allowedMethods: [String],
      restrictedMethods: [String]
    },
    
    methodValidation: {
      requireCVV: Boolean,
      require3DS: Boolean,
      requireBillingAddress: Boolean,
      validateExpiry: Boolean,
      blockPrepaidCards: Boolean,
      blockInternationalCards: Boolean
    }
  },

  // ==================== Transaction Processing ====================
  transactionProcessing: {
    transactions: [{
      transactionId: {
        type: String,
        required: true,
        unique: true,
        index: true
      },
      transactionType: {
        type: String,
        enum: ['AUTHORIZATION', 'CAPTURE', 'CHARGE', 'REFUND', 'PARTIAL_REFUND', 'VOID', 'CHARGEBACK', 'ADJUSTMENT', 'PAYOUT', 'TRANSFER'],
        required: true,
        index: true
      },
      status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED', 'DISPUTED'],
        required: true,
        index: true
      },
      amount: {
        value: {
          type: Number,
          required: true
        },
        currency: {
          type: String,
          required: true,
          default: 'USD'
        },
        exchangeRate: Number,
        baseCurrencyAmount: Number
      },
      paymentMethodId: String,
      gatewayUsed: String,
      gatewayTransactionId: String,
      gatewayResponse: {
        responseCode: String,
        responseMessage: String,
        authorizationCode: String,
        avsResult: String,
        cvvResult: String,
        riskScore: Number,
        rawResponse: mongoose.Schema.Types.Mixed
      },
      processingFees: {
        gatewayFee: Number,
        processingFee: Number,
        interchangeFee: Number,
        totalFees: Number,
        feesCurrency: String
      },
      timestamps: {
        createdAt: {
          type: Date,
          required: true,
          index: true
        },
        authorizedAt: Date,
        capturedAt: Date,
        completedAt: Date,
        failedAt: Date,
        reversedAt: Date
      },
      retryInfo: {
        attemptNumber: Number,
        maxAttempts: Number,
        nextRetryAt: Date,
        retryReason: String
      },
      metadata: {
        invoiceId: String,
        orderId: String,
        subscriptionId: String,
        description: String,
        statementDescriptor: String,
        customFields: mongoose.Schema.Types.Mixed,
        tags: [String]
      },
      ipAddress: String,
      userAgent: String,
      deviceFingerprint: String
    }],
    
    processingQueue: [{
      queueId: String,
      transactionId: String,
      priority: Number,
      scheduledAt: Date,
      status: {
        type: String,
        enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']
      },
      attempts: Number,
      lastAttempt: Date,
      error: String
    }],
    
    batchProcessing: [{
      batchId: String,
      batchType: String,
      status: String,
      totalTransactions: Number,
      processedTransactions: Number,
      failedTransactions: Number,
      totalAmount: Number,
      startedAt: Date,
      completedAt: Date,
      results: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Recurring Payments ====================
  recurringPayments: {
    subscriptions: [{
      subscriptionId: {
        type: String,
        required: true,
        unique: true
      },
      planId: String,
      status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING', 'TRIAL'],
        index: true
      },
      billingCycle: {
        interval: {
          type: String,
          enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM']
        },
        intervalCount: Number,
        customInterval: {
          value: Number,
          unit: String
        }
      },
      pricing: {
        amount: Number,
        currency: String,
        taxIncluded: Boolean,
        trialAmount: Number,
        trialPeriodDays: Number
      },
      currentPeriod: {
        start: Date,
        end: Date,
        billingAttempts: Number,
        paid: Boolean
      },
      nextBillingDate: Date,
      paymentMethodId: String,
      retryPolicy: {
        enabled: Boolean,
        maxAttempts: Number,
        retrySchedule: [Number],
        failureAction: {
          type: String,
          enum: ['SUSPEND', 'CANCEL', 'DOWNGRADE', 'NOTIFY_ONLY']
        }
      },
      history: [{
        periodStart: Date,
        periodEnd: Date,
        amount: Number,
        status: String,
        transactionId: String,
        billedAt: Date
      }]
    }],
    
    paymentSchedules: [{
      scheduleId: String,
      scheduleType: {
        type: String,
        enum: ['INSTALLMENT', 'MILESTONE', 'CUSTOM']
      },
      totalAmount: Number,
      currency: String,
      installments: [{
        installmentNumber: Number,
        dueDate: Date,
        amount: Number,
        status: {
          type: String,
          enum: ['SCHEDULED', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED']
        },
        paidDate: Date,
        transactionId: String,
        retryCount: Number
      }],
      paymentMethodId: String,
      autoCharge: Boolean,
      reminderSettings: {
        enabled: Boolean,
        daysBefore: [Number]
      }
    }],
    
    dunningConfiguration: {
      enabled: Boolean,
      strategy: {
        type: String,
        enum: ['AGGRESSIVE', 'STANDARD', 'GENTLE', 'CUSTOM']
      },
      stages: [{
        stageNumber: Number,
        dayAfterFailure: Number,
        action: {
          type: String,
          enum: ['RETRY', 'EMAIL', 'SMS', 'SUSPEND', 'CANCEL']
        },
        retryWithAlternateMethod: Boolean,
        communicationTemplate: String
      }],
      smartRetry: {
        enabled: Boolean,
        optimalRetryTimes: [Number],
        considerTimezone: Boolean,
        considerPayday: Boolean
      }
    }
  },

  // ==================== Refunds & Disputes ====================
  refundsAndDisputes: {
    refunds: [{
      refundId: {
        type: String,
        required: true,
        unique: true
      },
      originalTransactionId: {
        type: String,
        required: true
      },
      refundType: {
        type: String,
        enum: ['FULL', 'PARTIAL', 'CREDIT', 'GOODWILL']
      },
      amount: {
        value: Number,
        currency: String
      },
      reason: {
        type: String,
        enum: ['DUPLICATE', 'FRAUDULENT', 'REQUESTED_BY_CUSTOMER', 'PRODUCT_UNACCEPTABLE', 'PRODUCT_NOT_RECEIVED', 'PROCESSING_ERROR', 'OTHER']
      },
      reasonDetails: String,
      status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']
      },
      processedAt: Date,
      gatewayRefundId: String,
      refundMethod: {
        type: String,
        enum: ['ORIGINAL_PAYMENT_METHOD', 'STORE_CREDIT', 'CHECK', 'BANK_TRANSFER', 'CASH']
      },
      approvedBy: mongoose.Schema.Types.ObjectId,
      metadata: mongoose.Schema.Types.Mixed
    }],
    
    chargebacks: [{
      chargebackId: {
        type: String,
        required: true,
        unique: true
      },
      transactionId: String,
      amount: Number,
      currency: String,
      reason: {
        code: String,
        description: String
      },
      status: {
        type: String,
        enum: ['PENDING', 'UNDER_REVIEW', 'DISPUTED', 'ACCEPTED', 'WON', 'LOST', 'CLOSED']
      },
      receivedDate: Date,
      dueDate: Date,
      evidence: [{
        documentType: String,
        documentUrl: String,
        submittedAt: Date,
        description: String
      }],
      outcome: {
        decision: String,
        decisionDate: Date,
        liabilityShift: Boolean,
        amountRefunded: Number,
        fees: Number
      },
      networkReasonCode: String,
      gatewayChargebackId: String
    }],
    
    disputeManagement: {
      autoRespondToDisputes: Boolean,
      evidenceTemplate: mongoose.Schema.Types.Mixed,
      disputeThreshold: {
        maxDisputeRate: Number,
        maxDisputeAmount: Number,
        actionOnThresholdExceeded: String
      },
      preventionRules: [{
        ruleType: String,
        condition: mongoose.Schema.Types.Mixed,
        action: String
      }]
    }
  },

  // ==================== Settlement & Reconciliation ====================
  settlementReconciliation: {
    settlements: [{
      settlementId: String,
      settlementDate: Date,
      amount: Number,
      currency: String,
      transactionCount: Number,
      bankAccount: {
        accountNumber: String,
        routingNumber: String,
        bankName: String
      },
      status: {
        type: String,
        enum: ['PENDING', 'IN_TRANSIT', 'DEPOSITED', 'FAILED', 'RETURNED']
      },
      gatewaySettlementId: String,
      transactions: [String],
      fees: {
        processingFees: Number,
        gatewayFees: Number,
        netAmount: Number
      }
    }],
    
    reconciliation: {
      lastReconciled: Date,
      nextScheduled: Date,
      autoReconcile: Boolean,
      reconciliationRules: [{
        field: String,
        matchType: {
          type: String,
          enum: ['EXACT', 'FUZZY', 'TOLERANCE']
        },
        tolerance: Number
      }],
      discrepancies: [{
        date: Date,
        type: String,
        expectedAmount: Number,
        actualAmount: Number,
        difference: Number,
        resolved: Boolean,
        resolution: String
      }],
      reports: [{
        reportId: String,
        reportDate: Date,
        reportType: String,
        status: String,
        fileUrl: String
      }]
    },
    
    accounting: {
      ledgerEntries: [{
        entryId: String,
        entryDate: Date,
        accountCode: String,
        debit: Number,
        credit: Number,
        description: String,
        transactionId: String,
        posted: Boolean
      }],
      chartOfAccounts: {
        revenueAccount: String,
        receivableAccount: String,
        refundAccount: String,
        feeAccount: String,
        chargebackAccount: String
      },
      taxReporting: {
        taxableRevenue: Number,
        collectedTax: Number,
        reportingPeriod: String,
        filingStatus: String
      }
    }
  },

  // ==================== Risk Management ====================
  riskManagement: {
    riskProfile: {
      riskScore: {
        type: Number,
        min: 0,
        max: 100
      },
      riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'BLOCKED']
      },
      factors: {
        transactionHistory: Number,
        chargebackRate: Number,
        averageTransactionValue: Number,
        accountAge: Number,
        verificationStatus: Number
      },
      lastAssessment: Date,
      nextReview: Date
    },
    
    fraudDetection: {
      suspiciousActivities: [{
        activityId: String,
        activityType: String,
        detectedAt: Date,
        riskScore: Number,
        details: mongoose.Schema.Types.Mixed,
        action: {
          type: String,
          enum: ['FLAGGED', 'BLOCKED', 'REVIEWED', 'CLEARED']
        },
        reviewedBy: mongoose.Schema.Types.ObjectId,
        reviewedAt: Date
      }],
      
      velocityChecks: {
        transactionsPerHour: {
          current: Number,
          limit: Number
        },
        amountPerDay: {
          current: Number,
          limit: Number
        },
        uniqueCardsPerDay: {
          current: Number,
          limit: Number
        },
        failedAttemptsPerHour: {
          current: Number,
          limit: Number
        }
      },
      
      deviceFingerprinting: {
        knownDevices: [{
          deviceId: String,
          deviceType: String,
          lastSeen: Date,
          trustScore: Number
        }],
        suspiciousDevices: [String]
      },
      
      geoLocation: {
        allowedCountries: [String],
        blockedCountries: [String],
        unusualLocationAlert: Boolean,
        lastKnownLocation: {
          country: String,
          city: String,
          coordinates: {
            latitude: Number,
            longitude: Number
          }
        }
      }
    },
    
    limitsAndRestrictions: {
      transactionLimits: {
        single: {
          min: Number,
          max: Number
        },
        daily: {
          count: Number,
          amount: Number
        },
        weekly: {
          count: Number,
          amount: Number
        },
        monthly: {
          count: Number,
          amount: Number
        }
      },
      
      customLimits: [{
        limitType: String,
        condition: mongoose.Schema.Types.Mixed,
        value: Number,
        period: String,
        enforced: Boolean
      }],
      
      restrictions: [{
        restrictionType: String,
        reason: String,
        appliedAt: Date,
        appliedBy: mongoose.Schema.Types.ObjectId,
        expiresAt: Date,
        permanent: Boolean
      }]
    }
  },

  // ==================== Compliance & Security ====================
  complianceSecurity: {
    pciCompliance: {
      level: {
        type: String,
        enum: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'SAQ_A', 'SAQ_A_EP', 'SAQ_D']
      },
      validated: Boolean,
      validationDate: Date,
      expirationDate: Date,
      attestation: {
        documentUrl: String,
        submittedBy: mongoose.Schema.Types.ObjectId,
        submittedAt: Date
      },
      scanResults: [{
        scanDate: Date,
        passed: Boolean,
        vulnerabilities: [String],
        reportUrl: String
      }]
    },
    
    dataProtection: {
      encryptionEnabled: Boolean,
      tokenizationEnabled: Boolean,
      dataRetentionDays: Number,
      gdprCompliant: Boolean,
      dataResidency: {
        region: String,
        allowCrossBorder: Boolean
      },
      auditLogs: {
        enabled: Boolean,
        retentionDays: Number,
        includeFields: [String]
      }
    },
    
    amlKyc: {
      kycStatus: {
        type: String,
        enum: ['NOT_REQUIRED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'FAILED', 'EXPIRED']
      },
      kycLevel: {
        type: String,
        enum: ['BASIC', 'ENHANCED', 'FULL']
      },
      verificationDate: Date,
      expirationDate: Date,
      documents: [{
        documentType: String,
        documentId: String,
        status: String,
        uploadedAt: Date
      }],
      amlScreening: {
        lastScreened: Date,
        screeningProvider: String,
        matchFound: Boolean,
        matchDetails: mongoose.Schema.Types.Mixed
      },
      sanctions: {
        screened: Boolean,
        lastScreened: Date,
        onSanctionsList: Boolean,
        listName: String
      }
    },
    
    regulatoryReporting: {
      required: Boolean,
      reports: [{
        reportType: String,
        reportingPeriod: String,
        filedDate: Date,
        reportId: String,
        status: String
      }],
      thresholdReporting: {
        enabled: Boolean,
        threshold: Number,
        reportingRequired: Boolean
      }
    }
  },

  // ==================== Analytics & Metrics ====================
  analyticsMetrics: {
    performanceMetrics: {
      successRate: {
        overall: Number,
        byPaymentMethod: [{
          method: String,
          rate: Number
        }],
        byGateway: [{
          gateway: String,
          rate: Number
        }]
      },
      averageProcessingTime: Number,
      authorizationRate: Number,
      captureRate: Number,
      declineReasons: [{
        reason: String,
        count: Number,
        percentage: Number
      }],
      conversionFunnel: {
        initiated: Number,
        authorized: Number,
        captured: Number,
        completed: Number
      }
    },
    
    financialMetrics: {
      totalProcessed: {
        volume: Number,
        count: Number,
        period: String
      },
      averageTransactionValue: Number,
      processingCosts: {
        totalFees: Number,
        averageFeePercentage: Number,
        feesByGateway: [{
          gateway: String,
          fees: Number,
          percentage: Number
        }]
      },
      netRevenue: Number,
      refundRate: Number,
      chargebackRate: Number
    },
    
    customerMetrics: {
      uniqueCustomers: Number,
      repeatCustomerRate: Number,
      averageCustomerLifetimeValue: Number,
      paymentMethodDistribution: [{
        method: String,
        count: Number,
        percentage: Number
      }],
      geographicDistribution: [{
        country: String,
        count: Number,
        volume: Number
      }]
    },
    
    trends: {
      volumeTrend: [{
        date: Date,
        volume: Number,
        count: Number
      }],
      growthRate: {
        daily: Number,
        weekly: Number,
        monthly: Number,
        yearly: Number
      },
      seasonalPatterns: [{
        period: String,
        averageVolume: Number,
        peakDays: [Number],
        lowDays: [Number]
      }],
      projections: {
        nextMonth: Number,
        nextQuarter: Number,
        confidence: Number
      }
    }
  },

  // ==================== Notifications & Webhooks ====================
  notificationsWebhooks: {
    notificationSettings: {
      emailNotifications: {
        enabled: Boolean,
        recipients: [String],
        events: [{
          eventType: String,
          enabled: Boolean,
          template: String
        }]
      },
      smsNotifications: {
        enabled: Boolean,
        phoneNumbers: [String],
        events: [String]
      },
      slackNotifications: {
        enabled: Boolean,
        webhookUrl: String,
        channel: String,
        events: [String]
      }
    },
    
    webhookConfiguration: {
      endpoints: [{
        endpointId: String,
        url: String,
        active: Boolean,
        events: [String],
        headers: mongoose.Schema.Types.Mixed,
        authentication: {
          type: String,
          credentials: mongoose.Schema.Types.Mixed
        },
        retryPolicy: {
          maxAttempts: Number,
          backoffMultiplier: Number
        }
      }],
      
      webhookEvents: [{
        eventId: String,
        eventType: String,
        timestamp: Date,
        payload: mongoose.Schema.Types.Mixed,
        deliveryAttempts: [{
          attemptNumber: Number,
          timestamp: Date,
          responseCode: Number,
          responseBody: String,
          success: Boolean
        }],
        status: {
          type: String,
          enum: ['PENDING', 'DELIVERED', 'FAILED', 'RETRYING']
        }
      }],
      
      eventTypes: {
        paymentEvents: ['payment.authorized', 'payment.captured', 'payment.failed', 'payment.refunded'],
        subscriptionEvents: ['subscription.created', 'subscription.updated', 'subscription.cancelled'],
        disputeEvents: ['dispute.created', 'dispute.updated', 'dispute.closed'],
        accountEvents: ['account.updated', 'payment_method.attached', 'payment_method.detached']
      }
    },
    
    alerting: {
      alerts: [{
        alertId: String,
        alertType: String,
        condition: mongoose.Schema.Types.Mixed,
        threshold: Number,
        triggered: Boolean,
        triggeredAt: Date,
        message: String,
        severity: {
          type: String,
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        },
        acknowledged: Boolean,
        acknowledgedBy: mongoose.Schema.Types.ObjectId
      }],
      
      escalationPolicy: {
        enabled: Boolean,
        levels: [{
          level: Number,
          waitTime: Number,
          contacts: [String],
          contactMethod: String
        }]
      }
    }
  },

  // ==================== Integration Management ====================
  integrationManagement: {
    connectedSystems: [{
      systemType: {
        type: String,
        enum: ['ERP', 'CRM', 'ACCOUNTING', 'ECOMMERCE', 'MARKETPLACE', 'CUSTOM']
      },
      systemName: String,
      connectionStatus: {
        type: String,
        enum: ['CONNECTED', 'DISCONNECTED', 'ERROR', 'SYNCING']
      },
      lastSync: Date,
      syncFrequency: String,
      configuration: mongoose.Schema.Types.Mixed,
      mapping: {
        fields: [{
          sourceField: String,
          targetField: String,
          transformation: String
        }],
        entities: [{
          sourceEntity: String,
          targetEntity: String
        }]
      },
      errorLog: [{
        timestamp: Date,
        error: String,
        resolved: Boolean
      }]
    }],
    
    apiConfiguration: {
      apiKeys: [{
        keyId: String,
        keyName: String,
        permissions: [String],
        createdAt: Date,
        lastUsed: Date,
        expiresAt: Date,
        active: Boolean
      }],
      
      ipWhitelist: [String],
      
      rateLimits: {
        requestsPerSecond: Number,
        requestsPerMinute: Number,
        requestsPerHour: Number,
        burstLimit: Number
      },
      
      usage: {
        currentMonth: {
          requests: Number,
          dataTransferred: Number
        },
        history: [{
          month: String,
          requests: Number,
          dataTransferred: Number,
          errors: Number
        }]
      }
    },
    
    dataSync: {
      syncJobs: [{
        jobId: String,
        jobType: String,
        schedule: String,
        lastRun: Date,
        nextRun: Date,
        status: String,
        recordsProcessed: Number,
        errors: Number
      }],
      
      conflictResolution: {
        strategy: {
          type: String,
          enum: ['LATEST_WINS', 'SOURCE_WINS', 'MANUAL', 'MERGE']
        },
        conflicts: [{
          conflictId: String,
          entityType: String,
          entityId: String,
          sourceValue: mongoose.Schema.Types.Mixed,
          targetValue: mongoose.Schema.Types.Mixed,
          resolved: Boolean,
          resolution: mongoose.Schema.Types.Mixed
        }]
      }
    }
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
    environment: {
      type: String,
      enum: ['DEVELOPMENT', 'STAGING', 'PRODUCTION'],
      default: 'PRODUCTION'
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
  collection: 'payment_admin',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
paymentAdminSchema.index({ 'paymentReference.organizationId': 1, 'paymentReference.customerId': 1 });
paymentAdminSchema.index({ 'transactionProcessing.transactions.transactionId': 1 });
paymentAdminSchema.index({ 'transactionProcessing.transactions.status': 1 });
paymentAdminSchema.index({ 'transactionProcessing.transactions.timestamps.createdAt': -1 });
paymentAdminSchema.index({ 'paymentMethods.savedMethods.methodId': 1 });
paymentAdminSchema.index({ 'recurringPayments.subscriptions.subscriptionId': 1 });
paymentAdminSchema.index({ 'recurringPayments.subscriptions.status': 1 });
paymentAdminSchema.index({ 'refundsAndDisputes.refunds.refundId': 1 });
paymentAdminSchema.index({ 'refundsAndDisputes.chargebacks.chargebackId': 1 });
paymentAdminSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
paymentAdminSchema.virtual('isActive').get(function() {
  return this.gatewayConfiguration.primaryGateway.connectionStatus.status === 'CONNECTED';
});

paymentAdminSchema.virtual('totalProcessedVolume').get(function() {
  return this.analyticsMetrics.financialMetrics.totalProcessed.volume || 0;
});

paymentAdminSchema.virtual('currentRiskLevel').get(function() {
  return this.riskManagement.riskProfile.riskLevel || 'UNKNOWN';
});

paymentAdminSchema.virtual('successRate').get(function() {
  return this.analyticsMetrics.performanceMetrics.successRate.overall || 0;
});

paymentAdminSchema.virtual('hasActiveSubscriptions').get(function() {
  return this.recurringPayments.subscriptions.some(sub => sub.status === 'ACTIVE');
});

// ==================== Instance Methods ====================

/**
 * Process a payment transaction
 * @async
 * @param {Object} paymentData - Payment transaction data
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Transaction result
 */
paymentAdminSchema.methods.processTransaction = async function(paymentData, options = {}) {
  try {
    const encryptionService = new EncryptionService();
    const paymentProcessor = new PaymentProcessor();

    // Create transaction record
    const transaction = {
      transactionId: `TXN-${Date.now()}-${cryptoHelper.generateRandomString(9)}`,
      transactionType: paymentData.type || 'CHARGE',
      status: 'PENDING',
      amount: {
        value: paymentData.amount,
        currency: paymentData.currency || 'USD'
      },
      paymentMethodId: paymentData.paymentMethodId,
      gatewayUsed: options.gateway || this.gatewayConfiguration.primaryGateway.provider,
      timestamps: {
        createdAt: new Date()
      },
      metadata: paymentData.metadata || {},
      ipAddress: options.ipAddress,
      userAgent: options.userAgent
    };

    // Validate payment method
    const paymentMethod = this.paymentMethods.savedMethods.find(
      method => method.methodId === paymentData.paymentMethodId && method.isActive
    );

    if (!paymentMethod) {
      throw new AppError('Invalid or inactive payment method', 400);
    }

    // Check risk and fraud
    const riskCheck = await this.performRiskAssessment(transaction, paymentMethod);
    if (riskCheck.action === 'BLOCK') {
      transaction.status = 'FAILED';
      transaction.gatewayResponse = {
        responseCode: 'BLOCKED',
        responseMessage: 'Transaction blocked due to risk assessment'
      };
      this.transactionProcessing.transactions.push(transaction);
      await this.save();
      throw new AppError('Transaction blocked due to risk assessment', 403);
    }

    // Process through gateway
    let gatewayResult;
    const gateway = this.gatewayConfiguration.primaryGateway.provider;

    switch (gateway) {
      case 'STRIPE':
        gatewayResult = await this.#processStripeTransaction(paymentData, paymentMethod, options);
        break;
      case 'PAYPAL':
        gatewayResult = await this.#processPayPalTransaction(paymentData, paymentMethod, options);
        break;
      case 'SQUARE':
        gatewayResult = await this.#processSquareTransaction(paymentData, paymentMethod, options);
        break;
      case 'AUTHORIZE_NET':
        gatewayResult = await this.#processAuthorizeNetTransaction(paymentData, paymentMethod, options);
        break;
      case 'BRAINTREE':
        gatewayResult = await this.#processBraintreeTransaction(paymentData, paymentMethod, options);
        break;
      default:
        gatewayResult = await this.#processCustomTransaction(paymentData, paymentMethod, options);
    }

    // Update transaction with gateway response
    transaction.gatewayTransactionId = gatewayResult.transactionId;
    transaction.gatewayResponse = {
      responseCode: gatewayResult.code,
      responseMessage: gatewayResult.message,
      authorizationCode: gatewayResult.authCode,
      avsResult: gatewayResult.avsResult,
      cvvResult: gatewayResult.cvvResult,
      riskScore: gatewayResult.riskScore,
      rawResponse: gatewayResult.raw
    };

    // Update transaction status based on result
    if (gatewayResult.success) {
      if (paymentData.type === 'AUTHORIZATION') {
        transaction.status = 'AUTHORIZED';
        transaction.timestamps.authorizedAt = new Date();
      } else {
        transaction.status = 'COMPLETED';
        transaction.timestamps.completedAt = new Date();
      }
    } else {
      transaction.status = 'FAILED';
      transaction.timestamps.failedAt = new Date();
    }

    // Calculate and store processing fees
    if (gatewayResult.fees) {
      transaction.processingFees = {
        gatewayFee: gatewayResult.fees.gateway || 0,
        processingFee: gatewayResult.fees.processing || 0,
        interchangeFee: gatewayResult.fees.interchange || 0,
        totalFees: gatewayResult.fees.total || 0,
        feesCurrency: gatewayResult.fees.currency || paymentData.currency
      };
    }

    // Save transaction
    this.transactionProcessing.transactions.push(transaction);

    // Update analytics
    await this.updateAnalytics(transaction);

    // Update payment method last used
    paymentMethod.metadata.lastUsedAt = new Date();
    paymentMethod.metadata.useCount = (paymentMethod.metadata.useCount || 0) + 1;

    await this.save();

    logger.info(`Transaction processed: ${transaction.transactionId}`);
    return { success: gatewayResult.success, transaction };

  } catch (error) {
    logger.error(`Failed to process transaction:`, error);
    throw error;
  }
};

/**
 * Add a new payment method
 * @async
 * @param {Object} methodData - Payment method data
 * @returns {Promise<Object>} Added payment method
 */
paymentAdminSchema.methods.addPaymentMethod = async function(methodData) {
  try {
    const encryptionService = new EncryptionService();
    
    // Check method limits
    if (this.paymentMethods.savedMethods.length >= this.paymentMethods.paymentMethodLimits.maxSavedMethods) {
      throw new AppError('Maximum payment methods limit reached', 400);
    }

    const paymentMethod = {
      methodId: `PM-${Date.now()}-${cryptoHelper.generateRandomString(9)}`,
      methodType: methodData.type,
      isDefault: methodData.isDefault || this.paymentMethods.savedMethods.length === 0,
      isActive: true,
      billingAddress: methodData.billingAddress,
      verification: {
        status: 'PENDING'
      },
      metadata: {
        createdAt: new Date(),
        createdBy: methodData.createdBy,
        useCount: 0,
        labels: methodData.labels || []
      }
    };

    // Handle specific method types
    switch (methodData.type) {
      case 'CREDIT_CARD':
      case 'DEBIT_CARD':
        paymentMethod.cardDetails = {
          last4: methodData.cardNumber.slice(-4),
          brand: this.#detectCardBrand(methodData.cardNumber),
          expiryMonth: methodData.expiryMonth,
          expiryYear: methodData.expiryYear,
          cardholderName: methodData.cardholderName,
          fingerprint: await encryptionService.hash(methodData.cardNumber)
        };
        
        // Tokenize card
        if (methodData.tokenize) {
          const tokenResult = await this.#tokenizeCard(methodData);
          paymentMethod.tokenization = {
            token: tokenResult.token,
            tokenProvider: tokenResult.provider,
            tokenCreatedAt: new Date()
          };
        }
        break;

      case 'BANK_ACCOUNT':
        paymentMethod.bankAccountDetails = {
          last4: methodData.accountNumber.slice(-4),
          accountType: methodData.accountType,
          bankName: methodData.bankName,
          routingNumber: methodData.routingNumber,
          accountHolderName: methodData.accountHolderName,
          accountHolderType: methodData.accountHolderType,
          status: 'NEW'
        };
        break;

      case 'PAYPAL':
      case 'APPLE_PAY':
      case 'GOOGLE_PAY':
        paymentMethod.digitalWalletDetails = {
          walletType: methodData.type,
          email: methodData.email,
          phone: methodData.phone
        };
        break;

      case 'CRYPTO':
        paymentMethod.cryptoDetails = {
          walletAddress: methodData.walletAddress,
          network: methodData.network,
          currency: methodData.cryptoCurrency
        };
        break;
    }

    // Set other defaults as false if this is default
    if (paymentMethod.isDefault) {
      this.paymentMethods.savedMethods.forEach(method => {
        method.isDefault = false;
      });
    }

    // Verify payment method if required
    if (this.paymentMethods.methodValidation.require3DS && 
        (methodData.type === 'CREDIT_CARD' || methodData.type === 'DEBIT_CARD')) {
      const verificationResult = await this.#verify3DS(paymentMethod);
      paymentMethod.verification = verificationResult;
    }

    this.paymentMethods.savedMethods.push(paymentMethod);
    await this.save();

    logger.info(`Payment method added: ${paymentMethod.methodId}`);
    return { success: true, paymentMethod };

  } catch (error) {
    logger.error(`Failed to add payment method:`, error);
    throw error;
  }
};

/**
 * Process a refund
 * @async
 * @param {String} transactionId - Original transaction ID
 * @param {Object} refundData - Refund data
 * @returns {Promise<Object>} Refund result
 */
paymentAdminSchema.methods.processRefund = async function(transactionId, refundData) {
  try {
    // Find original transaction
    const originalTransaction = this.transactionProcessing.transactions.find(
      txn => txn.transactionId === transactionId
    );

    if (!originalTransaction) {
      throw new AppError('Original transaction not found', 404);
    }

    if (!['CAPTURED', 'COMPLETED'].includes(originalTransaction.status)) {
      throw new AppError('Transaction cannot be refunded in current status', 400);
    }

    // Calculate refund amount
    const refundAmount = refundData.amount || originalTransaction.amount.value;
    const existingRefunds = this.refundsAndDisputes.refunds.filter(
      r => r.originalTransactionId === transactionId && r.status === 'COMPLETED'
    );
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amount.value, 0);

    if (totalRefunded + refundAmount > originalTransaction.amount.value) {
      throw new AppError('Refund amount exceeds original transaction', 400);
    }

    // Create refund record
    const refund = {
      refundId: `REF-${Date.now()}-${cryptoHelper.generateRandomString(9)}`,
      originalTransactionId: transactionId,
      refundType: refundAmount === originalTransaction.amount.value ? 'FULL' : 'PARTIAL',
      amount: {
        value: refundAmount,
        currency: originalTransaction.amount.currency
      },
      reason: refundData.reason || 'REQUESTED_BY_CUSTOMER',
      reasonDetails: refundData.reasonDetails,
      status: 'PENDING',
      refundMethod: refundData.method || 'ORIGINAL_PAYMENT_METHOD',
      approvedBy: refundData.approvedBy,
      metadata: refundData.metadata
    };

    // Process refund through gateway
    const gateway = originalTransaction.gatewayUsed;
    const gatewayResult = await this.#processGatewayRefund(
      gateway,
      originalTransaction.gatewayTransactionId,
      refundAmount
    );

    // Update refund status
    refund.status = gatewayResult.success ? 'COMPLETED' : 'FAILED';
    refund.processedAt = new Date();
    refund.gatewayRefundId = gatewayResult.refundId;

    this.refundsAndDisputes.refunds.push(refund);

    // Create refund transaction
    const refundTransaction = {
      transactionId: `TXN-${refund.refundId}`,
      transactionType: 'REFUND',
      status: refund.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
      amount: {
        value: -refundAmount,
        currency: originalTransaction.amount.currency
      },
      gatewayUsed: gateway,
      gatewayTransactionId: gatewayResult.refundId,
      timestamps: {
        createdAt: new Date(),
        completedAt: refund.status === 'COMPLETED' ? new Date() : null
      },
      metadata: {
        originalTransactionId: transactionId,
        refundId: refund.refundId,
        reason: refund.reason
      }
    };

    this.transactionProcessing.transactions.push(refundTransaction);
    await this.save();

    logger.info(`Refund processed: ${refund.refundId}`);
    return { success: true, refund };

  } catch (error) {
    logger.error(`Failed to process refund:`, error);
    throw error;
  }
};

/**
 * Create a recurring subscription
 * @async
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<Object>} Created subscription
 */
paymentAdminSchema.methods.createSubscription = async function(subscriptionData) {
  try {
    const subscription = {
      subscriptionId: `SUB-${Date.now()}-${cryptoHelper.generateRandomString(9)}`,
      planId: subscriptionData.planId,
      status: subscriptionData.trialPeriod ? 'TRIAL' : 'ACTIVE',
      billingCycle: {
        interval: subscriptionData.interval,
        intervalCount: subscriptionData.intervalCount || 1
      },
      pricing: {
        amount: subscriptionData.amount,
        currency: subscriptionData.currency || 'USD',
        taxIncluded: subscriptionData.taxIncluded || false,
        trialAmount: subscriptionData.trialAmount || 0,
        trialPeriodDays: subscriptionData.trialPeriodDays || 0
      },
      currentPeriod: {
        start: new Date(),
        end: this.#calculatePeriodEnd(new Date(), subscriptionData.interval, subscriptionData.intervalCount),
        billingAttempts: 0,
        paid: false
      },
      paymentMethodId: subscriptionData.paymentMethodId,
      retryPolicy: {
        enabled: true,
        maxAttempts: subscriptionData.maxRetryAttempts || 3,
        retrySchedule: subscriptionData.retrySchedule || [1, 3, 5],
        failureAction: subscriptionData.failureAction || 'SUSPEND'
      },
      history: []
    };

    // Calculate next billing date
    if (subscription.pricing.trialPeriodDays > 0) {
      subscription.nextBillingDate = dateHelper.addDays(new Date(), subscription.pricing.trialPeriodDays);
    } else {
      subscription.nextBillingDate = subscription.currentPeriod.end;
    }

    // Verify payment method
    const paymentMethod = this.paymentMethods.savedMethods.find(
      method => method.methodId === subscriptionData.paymentMethodId && method.isActive
    );

    if (!paymentMethod) {
      throw new AppError('Invalid payment method for subscription', 400);
    }

    this.recurringPayments.subscriptions.push(subscription);
    await this.save();

    logger.info(`Subscription created: ${subscription.subscriptionId}`);
    return { success: true, subscription };

  } catch (error) {
    logger.error(`Failed to create subscription:`, error);
    throw error;
  }
};

/**
 * Perform risk assessment for transaction
 * @async
 * @param {Object} transaction - Transaction data
 * @param {Object} paymentMethod - Payment method data
 * @returns {Promise<Object>} Risk assessment result
 */
paymentAdminSchema.methods.performRiskAssessment = async function(transaction, paymentMethod) {
  try {
    let riskScore = 0;
    const factors = [];

    // Check velocity limits
    const velocityCheck = await this.#checkVelocityLimits(transaction);
    if (velocityCheck.exceeded) {
      riskScore += 30;
      factors.push('VELOCITY_LIMIT_EXCEEDED');
    }

    // Check for suspicious patterns
    if (transaction.amount.value > 10000) {
      riskScore += 20;
      factors.push('HIGH_AMOUNT');
    }

    // Check payment method history
    if (paymentMethod.metadata.useCount === 0) {
      riskScore += 15;
      factors.push('NEW_PAYMENT_METHOD');
    }

    // Check geographic anomalies
    const geoCheck = await this.#checkGeographicAnomalies(transaction.ipAddress);
    if (geoCheck.suspicious) {
      riskScore += 25;
      factors.push('GEOGRAPHIC_ANOMALY');
    }

    // Check blacklists
    const blacklistCheck = this.#checkBlacklists(paymentMethod, transaction);
    if (blacklistCheck.blocked) {
      riskScore = 100;
      factors.push('BLACKLISTED');
    }

    // Determine action based on score
    let action = 'ALLOW';
    let riskLevel = 'LOW';

    if (riskScore >= 80) {
      action = 'BLOCK';
      riskLevel = 'VERY_HIGH';
    } else if (riskScore >= 60) {
      action = 'REVIEW';
      riskLevel = 'HIGH';
    } else if (riskScore >= 40) {
      action = 'CHALLENGE';
      riskLevel = 'MEDIUM';
    }

    // Update risk profile
    this.riskManagement.riskProfile.riskScore = riskScore;
    this.riskManagement.riskProfile.riskLevel = riskLevel;
    this.riskManagement.riskProfile.lastAssessment = new Date();

    // Log suspicious activity if needed
    if (riskScore >= 40) {
      this.riskManagement.fraudDetection.suspiciousActivities.push({
        activityId: `ACT-${Date.now()}`,
        activityType: 'TRANSACTION_RISK',
        detectedAt: new Date(),
        riskScore,
        details: { transaction, factors },
        action
      });
    }

    return { riskScore, riskLevel, action, factors };

  } catch (error) {
    logger.error('Risk assessment failed:', error);
    return { riskScore: 50, riskLevel: 'MEDIUM', action: 'REVIEW', factors: ['ASSESSMENT_ERROR'] };
  }
};

/**
 * Update analytics metrics
 * @async
 * @param {Object} transaction - Transaction data
 * @returns {Promise<void>}
 */
paymentAdminSchema.methods.updateAnalytics = async function(transaction) {
  try {
    const metrics = this.analyticsMetrics;
    
    // Update performance metrics
    const transactions = this.transactionProcessing.transactions;
    const successfulTxns = transactions.filter(t => t.status === 'COMPLETED').length;
    metrics.performanceMetrics.successRate.overall = 
      transactions.length > 0 ? (successfulTxns / transactions.length) * 100 : 0;

    // Update financial metrics
    if (transaction.status === 'COMPLETED' && transaction.transactionType === 'CHARGE') {
      metrics.financialMetrics.totalProcessed.volume += transaction.amount.value;
      metrics.financialMetrics.totalProcessed.count += 1;
    }

    // Update average transaction value
    const totalVolume = metrics.financialMetrics.totalProcessed.volume;
    const totalCount = metrics.financialMetrics.totalProcessed.count;
    metrics.financialMetrics.averageTransactionValue = 
      totalCount > 0 ? totalVolume / totalCount : 0;

    await this.save();

  } catch (error) {
    logger.error('Failed to update analytics:', error);
  }
};

// ==================== Static Methods ====================

/**
 * Find payment accounts by risk level
 * @static
 * @async
 * @param {String} riskLevel - Risk level to filter
 * @returns {Promise<Array>} Payment accounts
 */
paymentAdminSchema.statics.findByRiskLevel = async function(riskLevel) {
  return this.find({
    'riskManagement.riskProfile.riskLevel': riskLevel
  }).sort({ 'riskManagement.riskProfile.riskScore': -1 });
};

/**
 * Calculate platform-wide payment metrics
 * @static
 * @async
 * @returns {Promise<Object>} Platform metrics
 */
paymentAdminSchema.statics.calculatePlatformMetrics = async function() {
  const aggregation = await this.aggregate([
    {
      $group: {
        _id: null,
        totalVolume: { $sum: '$analyticsMetrics.financialMetrics.totalProcessed.volume' },
        totalTransactions: { $sum: '$analyticsMetrics.financialMetrics.totalProcessed.count' },
        averageSuccessRate: { $avg: '$analyticsMetrics.performanceMetrics.successRate.overall' },
        activeAccounts: { $sum: 1 }
      }
    }
  ]);

  return aggregation[0] || {
    totalVolume: 0,
    totalTransactions: 0,
    averageSuccessRate: 0,
    activeAccounts: 0
  };
};

/**
 * Find accounts with failed transactions
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} Accounts with failed transactions
 */
paymentAdminSchema.statics.findAccountsWithFailedTransactions = async function(filters = {}) {
  const query = {
    'transactionProcessing.transactions': {
      $elemMatch: {
        status: 'FAILED',
        'timestamps.createdAt': {
          $gte: filters.startDate || dateHelper.addDays(new Date(), -30)
        }
      }
    }
  };

  return this.find(query).sort({ 'metadata.lastModifiedAt': -1 });
};

// ==================== Private Helper Methods ====================

/**
 * Detect card brand from number
 * @private
 * @param {String} cardNumber - Card number
 * @returns {String} Card brand
 */
paymentAdminSchema.methods.#detectCardBrand = function(cardNumber) {
  const patterns = {
    VISA: /^4[0-9]{12}(?:[0-9]{3})?$/,
    MASTERCARD: /^5[1-5][0-9]{14}$/,
    AMEX: /^3[47][0-9]{13}$/,
    DISCOVER: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    DINERS: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
    JCB: /^(?:2131|1800|35\d{3})\d{11}$/
  };

  for (const [brand, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber.replace(/\s/g, ''))) {
      return brand;
    }
  }

  return 'OTHER';
};

/**
 * Calculate period end date
 * @private
 * @param {Date} startDate - Period start date
 * @param {String} interval - Billing interval
 * @param {Number} intervalCount - Interval count
 * @returns {Date} Period end date
 */
paymentAdminSchema.methods.#calculatePeriodEnd = function(startDate, interval, intervalCount = 1) {
  const date = new Date(startDate);
  
  switch (interval) {
    case 'DAILY':
      return dateHelper.addDays(date, intervalCount);
    case 'WEEKLY':
      return dateHelper.addDays(date, 7 * intervalCount);
    case 'MONTHLY':
      return dateHelper.addMonths(date, intervalCount);
    case 'QUARTERLY':
      return dateHelper.addMonths(date, 3 * intervalCount);
    case 'SEMI_ANNUAL':
      return dateHelper.addMonths(date, 6 * intervalCount);
    case 'ANNUAL':
      return dateHelper.addMonths(date, 12 * intervalCount);
    default:
      return dateHelper.addMonths(date, intervalCount);
  }
};

/**
 * Check velocity limits
 * @private
 * @async
 * @param {Object} transaction - Transaction data
 * @returns {Promise<Object>} Velocity check result
 */
paymentAdminSchema.methods.#checkVelocityLimits = async function(transaction) {
  const limits = this.riskManagement.fraudDetection.velocityChecks;
  const now = new Date();
  const oneHourAgo = dateHelper.addHours(now, -1);
  const oneDayAgo = dateHelper.addDays(now, -1);

  // Check transactions per hour
  const recentTransactions = this.transactionProcessing.transactions.filter(
    t => t.timestamps.createdAt > oneHourAgo
  );

  if (recentTransactions.length >= limits.transactionsPerHour.limit) {
    return { exceeded: true, type: 'HOURLY_TRANSACTION_LIMIT' };
  }

  // Check amount per day
  const dailyTransactions = this.transactionProcessing.transactions.filter(
    t => t.timestamps.createdAt > oneDayAgo && t.status === 'COMPLETED'
  );

  const dailyAmount = dailyTransactions.reduce((sum, t) => sum + t.amount.value, 0);
  if (dailyAmount + transaction.amount.value > limits.amountPerDay.limit) {
    return { exceeded: true, type: 'DAILY_AMOUNT_LIMIT' };
  }

  return { exceeded: false };
};

/**
 * Check geographic anomalies
 * @private
 * @async
 * @param {String} ipAddress - IP address
 * @returns {Promise<Object>} Geographic check result
 */
paymentAdminSchema.methods.#checkGeographicAnomalies = async function(ipAddress) {
  // Simplified implementation - would integrate with IP geolocation service
  const blockedCountries = this.riskManagement.fraudDetection.geoLocation.blockedCountries;
  
  // This would normally resolve country from IP
  const country = 'US'; // Placeholder
  
  if (blockedCountries.includes(country)) {
    return { suspicious: true, reason: 'BLOCKED_COUNTRY' };
  }

  return { suspicious: false };
};

/**
 * Check blacklists
 * @private
 * @param {Object} paymentMethod - Payment method
 * @param {Object} transaction - Transaction
 * @returns {Object} Blacklist check result
 */
paymentAdminSchema.methods.#checkBlacklists = function(paymentMethod, transaction) {
  const blacklists = this.gatewayConfiguration.fraudPrevention.blacklists;
  
  // Check email blacklist
  if (transaction.metadata.email && blacklists.emails.includes(transaction.metadata.email)) {
    return { blocked: true, reason: 'BLACKLISTED_EMAIL' };
  }

  // Check IP blacklist
  if (transaction.ipAddress && blacklists.ipAddresses.includes(transaction.ipAddress)) {
    return { blocked: true, reason: 'BLACKLISTED_IP' };
  }

  // Check card blacklist
  if (paymentMethod.cardDetails && blacklists.cards.includes(paymentMethod.cardDetails.fingerprint)) {
    return { blocked: true, reason: 'BLACKLISTED_CARD' };
  }

  return { blocked: false };
};

// Payment gateway processing methods (simplified implementations)
paymentAdminSchema.methods.#processStripeTransaction = async function(paymentData, paymentMethod, options) {
  const stripeService = new StripeService();
  return await stripeService.processPayment(paymentData, paymentMethod, options);
};

paymentAdminSchema.methods.#processPayPalTransaction = async function(paymentData, paymentMethod, options) {
  const paypalService = new PayPalService();
  return await paypalService.processPayment(paymentData, paymentMethod, options);
};

paymentAdminSchema.methods.#processSquareTransaction = async function(paymentData, paymentMethod, options) {
  // Square implementation
  return { success: true, transactionId: `sq_${Date.now()}`, code: '00', message: 'Approved' };
};

paymentAdminSchema.methods.#processAuthorizeNetTransaction = async function(paymentData, paymentMethod, options) {
  // Authorize.Net implementation
  return { success: true, transactionId: `auth_${Date.now()}`, code: '1', message: 'Approved' };
};

paymentAdminSchema.methods.#processBraintreeTransaction = async function(paymentData, paymentMethod, options) {
  // Braintree implementation
  return { success: true, transactionId: `bt_${Date.now()}`, code: '1000', message: 'Approved' };
};

paymentAdminSchema.methods.#processCustomTransaction = async function(paymentData, paymentMethod, options) {
  // Custom gateway implementation
  return { success: true, transactionId: `custom_${Date.now()}`, code: 'OK', message: 'Approved' };
};

paymentAdminSchema.methods.#processGatewayRefund = async function(gateway, transactionId, amount) {
  // Gateway refund processing
  return { success: true, refundId: `refund_${Date.now()}` };
};

paymentAdminSchema.methods.#tokenizeCard = async function(cardData) {
  // Card tokenization
  return { token: `tok_${Date.now()}`, provider: 'STRIPE' };
};

paymentAdminSchema.methods.#verify3DS = async function(paymentMethod) {
  // 3D Secure verification
  return { status: 'VERIFIED', verifiedAt: new Date(), verificationMethod: '3DS' };
};

// ==================== Hooks ====================
paymentAdminSchema.pre('save', async function(next) {
  // Update modification timestamp
  this.metadata.lastModifiedAt = new Date();
  this.metadata.version += 1;

  // Update velocity counters
  if (this.isModified('transactionProcessing.transactions')) {
    const now = new Date();
    const oneHourAgo = dateHelper.addHours(now, -1);
    const oneDayAgo = dateHelper.addDays(now, -1);

    const hourlyTransactions = this.transactionProcessing.transactions.filter(
      t => t.timestamps.createdAt > oneHourAgo
    );

    const dailyTransactions = this.transactionProcessing.transactions.filter(
      t => t.timestamps.createdAt > oneDayAgo
    );

    this.riskManagement.fraudDetection.velocityChecks.transactionsPerHour.current = hourlyTransactions.length;
    this.riskManagement.fraudDetection.velocityChecks.amountPerDay.current = 
      dailyTransactions.reduce((sum, t) => sum + (t.amount.value > 0 ? t.amount.value : 0), 0);
  }

  next();
});

// ==================== Model Export ====================
const PaymentAdmin = mongoose.model('PaymentAdmin', paymentAdminSchema);

module.exports = PaymentAdmin;