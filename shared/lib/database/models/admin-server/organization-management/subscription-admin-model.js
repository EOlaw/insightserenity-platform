'use strict';

/**
 * @fileoverview Enterprise subscription administration model for comprehensive billing and subscription management
 * @module servers/admin-server/modules/organization-management/models/subscription-admin-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/currency-formatter
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const dateHelper = require('../../../../utils/helpers/date-helper');
const currencyFormatter = require('../../../../utils/formatters/currency-formatter');

/**
 * @class SubscriptionAdminSchema
 * @description Comprehensive subscription administration schema for enterprise billing management
 * @extends mongoose.Schema
 */
const subscriptionAdminSchema = new mongoose.Schema({
  // ==================== Core Subscription Identification ====================
  subscriptionAdminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `SUB-ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
  },

  subscriptionReference: {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    accountNumber: {
      type: String,
      unique: true,
      required: true
    },
    externalSubscriptionId: String,
    paymentProviderId: String
  },

  // ==================== Plan Configuration ====================
  planConfiguration: {
    currentPlan: {
      planId: {
        type: String,
        required: true
      },
      planName: {
        type: String,
        required: true
      },
      planType: {
        type: String,
        enum: ['ENTERPRISE', 'BUSINESS', 'PROFESSIONAL', 'STANDARD', 'BASIC', 'FREE', 'TRIAL', 'CUSTOM'],
        required: true,
        index: true
      },
      tier: {
        type: String,
        enum: ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'],
        required: true
      },
      category: {
        type: String,
        enum: ['MONTHLY', 'ANNUAL', 'BIENNIAL', 'PERPETUAL', 'USAGE_BASED', 'HYBRID'],
        required: true
      },
      customPlan: {
        isCustom: {
          type: Boolean,
          default: false
        },
        negotiatedBy: String,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        customTerms: mongoose.Schema.Types.Mixed
      }
    },

    pricing: {
      basePrice: {
        amount: {
          type: Number,
          required: true
        },
        currency: {
          type: String,
          default: 'USD',
          required: true
        },
        period: {
          type: String,
          enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'],
          default: 'MONTHLY'
        }
      },
      
      unitPricing: [{
        unitType: {
          type: String,
          enum: ['USER', 'SEAT', 'PROJECT', 'API_CALL', 'STORAGE_GB', 'BANDWIDTH_GB', 'TRANSACTION']
        },
        pricePerUnit: Number,
        includedUnits: Number,
        overage: {
          allowed: Boolean,
          pricePerUnit: Number,
          billingCycle: String
        }
      }],
      
      addOns: [{
        addonId: String,
        name: String,
        price: Number,
        billingCycle: String,
        quantity: Number,
        startDate: Date,
        endDate: Date,
        autoRenew: Boolean
      }],
      
      discounts: [{
        discountId: String,
        type: {
          type: String,
          enum: ['PERCENTAGE', 'FIXED', 'VOLUME', 'PROMOTIONAL', 'LOYALTY', 'PARTNER']
        },
        value: Number,
        applicable: {
          startDate: Date,
          endDate: Date,
          conditions: mongoose.Schema.Types.Mixed
        },
        code: String,
        appliedBy: String
      }],
      
      taxes: [{
        taxType: String,
        rate: Number,
        jurisdiction: String,
        taxId: String,
        exemption: {
          isExempt: Boolean,
          exemptionId: String,
          validUntil: Date
        }
      }],
      
      totalMonthlyRecurring: {
        type: Number,
        default: 0
      },
      totalAnnualValue: {
        type: Number,
        default: 0
      }
    },

    features: {
      included: [{
        featureId: String,
        featureName: String,
        category: String,
        limit: mongoose.Schema.Types.Mixed,
        unlimited: Boolean
      }],
      
      limitations: {
        users: Number,
        projects: Number,
        storage: Number,
        apiCalls: Number,
        bandwidth: Number,
        customDomains: Number,
        integrations: Number,
        teams: Number
      },
      
      usage: {
        users: {
          current: Number,
          limit: Number,
          percentage: Number
        },
        storage: {
          currentGB: Number,
          limitGB: Number,
          percentage: Number
        },
        apiCalls: {
          currentMonth: Number,
          limitMonth: Number,
          percentage: Number
        },
        projects: {
          current: Number,
          limit: Number,
          percentage: Number
        }
      },
      
      featureFlags: [{
        flag: String,
        enabled: Boolean,
        rolloutPercentage: Number,
        overrideReason: String
      }]
    }
  },

  // ==================== Billing Management ====================
  billingManagement: {
    billingDetails: {
      billingCycle: {
        type: String,
        enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM'],
        required: true
      },
      billingDay: {
        type: Number,
        min: 1,
        max: 31
      },
      nextBillingDate: {
        type: Date,
        required: true,
        index: true
      },
      billingMethod: {
        type: String,
        enum: ['ADVANCE', 'ARREARS', 'MILESTONE', 'USAGE_BASED'],
        default: 'ADVANCE'
      },
      autoRenewal: {
        enabled: {
          type: Boolean,
          default: true
        },
        renewalPeriod: String,
        notificationDays: Number
      },
      prorationEnabled: {
        type: Boolean,
        default: true
      }
    },

    paymentMethod: {
      primary: {
        type: {
          type: String,
          enum: ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'ACH', 'WIRE', 'CHECK', 'PAYPAL', 'INVOICE'],
          required: true
        },
        details: mongoose.Schema.Types.Mixed,
        isDefault: {
          type: Boolean,
          default: true
        },
        verifiedAt: Date,
        expirationDate: Date
      },
      
      backup: [{
        type: {
          type: String,
          enum: ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'ACH', 'WIRE', 'CHECK', 'PAYPAL']
        },
        details: mongoose.Schema.Types.Mixed,
        addedAt: Date
      }],
      
      billingAddress: {
        company: String,
        attention: String,
        street1: String,
        street2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String,
        taxId: String
      },
      
      paymentTerms: {
        netDays: {
          type: Number,
          default: 0
        },
        earlyPaymentDiscount: {
          percentage: Number,
          days: Number
        },
        lateFee: {
          type: Number,
          percentage: Number
        },
        creditLimit: Number
      }
    },

    invoices: [{
      invoiceId: String,
      invoiceNumber: {
        type: String,
        unique: true
      },
      invoiceDate: Date,
      dueDate: Date,
      billingPeriod: {
        start: Date,
        end: Date
      },
      lineItems: [{
        description: String,
        quantity: Number,
        unitPrice: Number,
        amount: Number,
        taxable: Boolean
      }],
      subtotal: Number,
      taxAmount: Number,
      discountAmount: Number,
      totalAmount: Number,
      status: {
        type: String,
        enum: ['DRAFT', 'PENDING', 'SENT', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'REFUNDED']
      },
      paidAt: Date,
      paymentMethod: String,
      transactionId: String,
      notes: String
    }],

    payments: [{
      paymentId: String,
      paymentDate: Date,
      amount: Number,
      currency: String,
      method: String,
      status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'DISPUTED']
      },
      transactionId: String,
      processorResponse: mongoose.Schema.Types.Mixed,
      invoiceIds: [String],
      failureReason: String,
      retryCount: Number
    }],

    credits: {
      balance: {
        type: Number,
        default: 0
      },
      transactions: [{
        creditId: String,
        type: {
          type: String,
          enum: ['PROMOTIONAL', 'REFUND', 'ADJUSTMENT', 'LOYALTY', 'REFERRAL']
        },
        amount: Number,
        reason: String,
        appliedAt: Date,
        appliedBy: String,
        expiresAt: Date
      }]
    },

    dunning: {
      status: {
        type: String,
        enum: ['GOOD_STANDING', 'GRACE_PERIOD', 'PAST_DUE', 'COLLECTIONS', 'SUSPENDED'],
        default: 'GOOD_STANDING'
      },
      attempts: [{
        attemptDate: Date,
        attemptNumber: Number,
        method: String,
        result: String,
        nextAttempt: Date
      }],
      suspensionDate: Date,
      cancellationDate: Date
    }
  },

  // ==================== Subscription Lifecycle ====================
  lifecycleManagement: {
    status: {
      type: String,
      enum: ['PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'CHURNED'],
      default: 'PENDING',
      required: true,
      index: true
    },

    dates: {
      signupDate: {
        type: Date,
        default: Date.now
      },
      trialStartDate: Date,
      trialEndDate: Date,
      activationDate: Date,
      lastRenewalDate: Date,
      nextRenewalDate: Date,
      suspensionDate: Date,
      cancellationDate: Date,
      churnDate: Date,
      reactivationDate: Date
    },

    trial: {
      isTrialing: {
        type: Boolean,
        default: false
      },
      trialDays: {
        type: Number,
        default: 14
      },
      trialExtended: Boolean,
      extensionDays: Number,
      conversionProbability: Number,
      conversionDate: Date,
      creditCardRequired: Boolean
    },

    renewal: {
      autoRenew: {
        type: Boolean,
        default: true
      },
      renewalCount: {
        type: Number,
        default: 0
      },
      lastRenewalAmount: Number,
      nextRenewalAmount: Number,
      renewalNotifications: [{
        sentAt: Date,
        type: String,
        method: String,
        recipient: String
      }],
      renewalHistory: [{
        renewalDate: Date,
        fromPlan: String,
        toPlan: String,
        amount: Number,
        success: Boolean
      }]
    },

    cancellation: {
      isCancelled: {
        type: Boolean,
        default: false
      },
      requestedAt: Date,
      requestedBy: String,
      effectiveDate: Date,
      reason: {
        primary: String,
        secondary: [String],
        feedback: String
      },
      salvageAttempts: [{
        attemptDate: Date,
        offer: String,
        accepted: Boolean
      }],
      refundAmount: Number,
      finalInvoice: String
    },

    upgrades: [{
      upgradeId: String,
      fromPlan: String,
      toPlan: String,
      upgradeDate: Date,
      upgradedBy: String,
      reason: String,
      priceDifference: Number,
      prorated: Boolean
    }],

    downgrades: [{
      downgradeId: String,
      fromPlan: String,
      toPlan: String,
      downgradeDate: Date,
      downgradedBy: String,
      reason: String,
      creditApplied: Number,
      effectiveDate: Date
    }]
  },

  // ==================== Usage Tracking ====================
  usageTracking: {
    current: {
      billingPeriod: {
        start: Date,
        end: Date
      },
      usage: {
        users: {
          active: Number,
          peak: Number,
          average: Number
        },
        storage: {
          currentGB: Number,
          peakGB: Number,
          averageGB: Number
        },
        apiCalls: {
          total: Number,
          successful: Number,
          failed: Number
        },
        bandwidth: {
          incomingGB: Number,
          outgoingGB: Number,
          totalGB: Number
        },
        compute: {
          hours: Number,
          cost: Number
        }
      },
      overages: [{
        metric: String,
        included: Number,
        used: Number,
        overage: Number,
        rate: Number,
        charge: Number
      }],
      estimatedCharges: Number
    },

    historical: [{
      period: {
        start: Date,
        end: Date
      },
      usage: mongoose.Schema.Types.Mixed,
      charges: Number,
      invoice: String
    }],

    quotas: [{
      metric: String,
      limit: Number,
      used: Number,
      percentage: Number,
      resetDate: Date,
      alertThreshold: Number,
      action: {
        type: String,
        enum: ['BLOCK', 'THROTTLE', 'CHARGE', 'NOTIFY']
      }
    }],

    alerts: [{
      alertId: String,
      metric: String,
      threshold: Number,
      currentValue: Number,
      triggeredAt: Date,
      notificationSent: Boolean,
      acknowledged: Boolean
    }]
  },

  // ==================== Revenue Analytics ====================
  revenueAnalytics: {
    metrics: {
      mrr: {
        current: Number,
        previous: Number,
        growth: Number,
        churn: Number,
        expansion: Number,
        contraction: Number,
        net: Number
      },
      arr: {
        current: Number,
        projected: Number,
        growth: Number
      },
      ltv: {
        estimated: Number,
        actual: Number,
        paybackMonths: Number
      },
      cac: {
        amount: Number,
        ratio: Number,
        recoveryMonths: Number
      },
      arpu: {
        current: Number,
        trend: String
      }
    },

    cohort: {
      signupCohort: String,
      cohortMonth: String,
      cohortQuarter: String,
      cohortYear: Number,
      retentionRate: Number,
      expansionRate: Number
    },

    segmentation: {
      segment: String,
      vertical: String,
      size: String,
      geo: String,
      channel: String,
      customAttributes: mongoose.Schema.Types.Mixed
    },

    health: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      indicators: {
        paymentHistory: Number,
        usagePattern: Number,
        engagement: Number,
        supportTickets: Number,
        featureAdoption: Number
      },
      churnRisk: {
        score: Number,
        factors: [String],
        predictedChurnDate: Date
      },
      expansionOpportunity: {
        score: Number,
        recommendedPlan: String,
        estimatedRevenue: Number
      }
    }
  },

  // ==================== Contract Management ====================
  contractManagement: {
    contract: {
      contractId: String,
      contractNumber: String,
      type: {
        type: String,
        enum: ['STANDARD', 'ENTERPRISE', 'CUSTOM', 'PARTNER', 'RESELLER']
      },
      status: {
        type: String,
        enum: ['DRAFT', 'NEGOTIATION', 'SIGNED', 'ACTIVE', 'EXPIRED', 'TERMINATED']
      },
      startDate: Date,
      endDate: Date,
      autoRenew: Boolean,
      renewalTerms: String,
      terminationClause: String
    },

    terms: {
      paymentTerms: String,
      sla: {
        uptime: Number,
        supportResponse: String,
        credits: mongoose.Schema.Types.Mixed
      },
      liability: String,
      confidentiality: String,
      customTerms: [String]
    },

    amendments: [{
      amendmentId: String,
      amendmentDate: Date,
      description: String,
      changes: mongoose.Schema.Types.Mixed,
      approvedBy: String,
      effectiveDate: Date
    }],

    documents: [{
      documentId: String,
      type: String,
      name: String,
      url: String,
      uploadedAt: Date,
      uploadedBy: String,
      version: String
    }],

    signatories: [{
      name: String,
      title: String,
      email: String,
      signedAt: Date,
      ipAddress: String,
      signatureId: String
    }]
  },

  // ==================== Support and Success ====================
  customerSuccess: {
    accountManager: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      name: String,
      email: String,
      phone: String,
      assignedDate: Date
    },

    supportPlan: {
      type: {
        type: String,
        enum: ['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM']
      },
      features: [String],
      sla: {
        responseTime: String,
        resolutionTime: String,
        availability: String
      },
      dedicatedSupport: Boolean,
      technicalAccountManager: String
    },

    interactions: [{
      interactionId: String,
      type: {
        type: String,
        enum: ['ONBOARDING', 'TRAINING', 'QBR', 'SUPPORT', 'UPSELL', 'RENEWAL', 'FEEDBACK']
      },
      date: Date,
      participants: [String],
      notes: String,
      outcome: String,
      followUp: Date
    }],

    satisfaction: {
      nps: {
        score: Number,
        date: Date,
        feedback: String
      },
      csat: {
        score: Number,
        date: Date,
        responses: Number
      },
      health: {
        score: Number,
        trend: String,
        lastUpdated: Date
      }
    },

    tickets: {
      total: Number,
      open: Number,
      avgResolutionTime: Number,
      satisfactionRate: Number
    }
  },

  // ==================== Audit Trail ====================
  auditTrail: {
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
    modifications: [{
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      modifiedAt: Date,
      action: String,
      changes: mongoose.Schema.Types.Mixed,
      reason: String
    }]
  }
}, {
  timestamps: true,
  collection: 'subscription_admin',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
subscriptionAdminSchema.index({ 'subscriptionReference.organizationId': 1, 'lifecycleManagement.status': 1 });
subscriptionAdminSchema.index({ 'planConfiguration.currentPlan.planType': 1 });
subscriptionAdminSchema.index({ 'billingManagement.billingDetails.nextBillingDate': 1 });
subscriptionAdminSchema.index({ 'lifecycleManagement.status': 1 });
subscriptionAdminSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
subscriptionAdminSchema.virtual('isActive').get(function() {
  return ['ACTIVE', 'TRIAL'].includes(this.lifecycleManagement.status);
});

subscriptionAdminSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.lifecycleManagement.dates.nextRenewalDate) return null;
  return Math.floor((this.lifecycleManagement.dates.nextRenewalDate - new Date()) / (1000 * 60 * 60 * 24));
});

// ==================== Instance Methods ====================
subscriptionAdminSchema.methods.calculateCharges = async function(period) {
  try {
    const charges = {
      base: this.planConfiguration.pricing.basePrice.amount,
      addons: 0,
      overages: 0,
      credits: 0,
      taxes: 0,
      total: 0
    };

    // Calculate add-ons
    this.planConfiguration.pricing.addOns.forEach(addon => {
      charges.addons += addon.price * (addon.quantity || 1);
    });

    // Calculate overages
    this.usageTracking.current.overages.forEach(overage => {
      charges.overages += overage.charge;
    });

    // Apply credits
    charges.credits = this.billingManagement.credits.balance;

    // Calculate taxes
    const subtotal = charges.base + charges.addons + charges.overages - charges.credits;
    this.planConfiguration.pricing.taxes.forEach(tax => {
      if (!tax.exemption?.isExempt) {
        charges.taxes += subtotal * (tax.rate / 100);
      }
    });

    charges.total = subtotal + charges.taxes;

    return charges;
  } catch (error) {
    logger.error('Failed to calculate charges:', error);
    throw error;
  }
};

subscriptionAdminSchema.methods.upgradePlan = async function(newPlan, upgradedBy) {
  try {
    const upgrade = {
      upgradeId: `UPG-${Date.now()}`,
      fromPlan: this.planConfiguration.currentPlan.planName,
      toPlan: newPlan.planName,
      upgradeDate: new Date(),
      upgradedBy,
      priceDifference: newPlan.price - this.planConfiguration.pricing.basePrice.amount,
      prorated: true
    };

    this.lifecycleManagement.upgrades.push(upgrade);
    this.planConfiguration.currentPlan = newPlan;
    
    await this.save();
    logger.info(`Subscription ${this.subscriptionAdminId} upgraded to ${newPlan.planName}`);
    return { success: true, upgrade };
    
  } catch (error) {
    logger.error('Failed to upgrade plan:', error);
    throw error;
  }
};

subscriptionAdminSchema.methods.processRenewal = async function() {
  try {
    const renewal = {
      renewalDate: new Date(),
      fromPlan: this.planConfiguration.currentPlan.planName,
      toPlan: this.planConfiguration.currentPlan.planName,
      amount: this.planConfiguration.pricing.basePrice.amount,
      success: true
    };

    this.lifecycleManagement.renewal.renewalHistory.push(renewal);
    this.lifecycleManagement.renewal.renewalCount += 1;
    this.lifecycleManagement.dates.lastRenewalDate = new Date();
    this.lifecycleManagement.dates.nextRenewalDate = dateHelper.addMonths(new Date(), 
      this.billingManagement.billingDetails.billingCycle === 'ANNUAL' ? 12 : 1);

    await this.save();
    logger.info(`Subscription ${this.subscriptionAdminId} renewed successfully`);
    return { success: true, renewal };
    
  } catch (error) {
    logger.error('Failed to process renewal:', error);
    throw error;
  }
};

// ==================== Static Methods ====================
subscriptionAdminSchema.statics.findExpiringSubscriptions = async function(days = 30) {
  const expirationDate = dateHelper.addDays(new Date(), days);
  return this.find({
    'lifecycleManagement.status': 'ACTIVE',
    'lifecycleManagement.dates.nextRenewalDate': { $lte: expirationDate }
  });
};

subscriptionAdminSchema.statics.findAtRiskSubscriptions = async function() {
  return this.find({
    'lifecycleManagement.status': 'ACTIVE',
    'revenueAnalytics.health.churnRisk.score': { $gte: 70 }
  });
};

subscriptionAdminSchema.statics.calculateTotalMRR = async function(organizationId) {
  const result = await this.aggregate([
    { $match: { 
      'subscriptionReference.organizationId': organizationId,
      'lifecycleManagement.status': 'ACTIVE' 
    }},
    { $group: {
      _id: null,
      totalMRR: { $sum: '$revenueAnalytics.metrics.mrr.current' }
    }}
  ]);
  
  return result[0]?.totalMRR || 0;
};

// ==================== Model Export ====================
const SubscriptionAdmin = mongoose.model('SubscriptionAdmin', subscriptionAdminSchema);

module.exports = SubscriptionAdmin;