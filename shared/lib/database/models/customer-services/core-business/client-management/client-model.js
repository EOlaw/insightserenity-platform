'use strict';

/**
 * @fileoverview Enhanced client model with comprehensive business management and enterprise features
 * @module servers/customer-services/modules/core-business/clients/models/client-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * Enhanced client schema definition for enterprise business management
 */
const clientSchemaDefinition = {
  // ==================== Core Identity ====================
  clientCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^[A-Z0-9-]+$/,
    index: true,
    immutable: true
  },

  companyName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },

  legalName: {
    type: String,
    trim: true,
    maxlength: 200
  },

  tradingName: {
    type: String,
    trim: true,
    maxlength: 200
  },

  // ==================== Multi-Tenancy & Organization ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  parentClientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    index: true
  },

  subsidiaries: [{
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client'
    },
    relationship: {
      type: String,
      enum: ['subsidiary', 'division', 'branch', 'affiliate']
    },
    ownershipPercentage: Number,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ==================== Business Information ====================
  businessDetails: {
    registrationNumber: {
      type: String,
      index: true
    },
    taxId: {
      type: String,
      select: false
    },
    vatNumber: String,
    incorporationDate: Date,
    fiscalYearEnd: String,
    entityType: {
      type: String,
      enum: ['corporation', 'llc', 'partnership', 'sole_proprietorship', 'non_profit', 'government', 'other']
    },
    businessStructure: {
      type: String,
      enum: ['public', 'private', 'subsidiary', 'franchise', 'joint_venture']
    },
    numberOfEmployees: {
      range: {
        type: String,
        enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']
      },
      exact: Number,
      lastUpdated: Date
    },
    annualRevenue: {
      amount: Number,
      currency: {
        type: String,
        default: 'USD'
      },
      range: {
        type: String,
        enum: ['<1M', '1M-10M', '10M-50M', '50M-100M', '100M-500M', '500M-1B', '1B+']
      },
      fiscalYear: Number,
      lastUpdated: Date
    },
    stockSymbol: String,
    exchange: String,
    dunsNumber: String,
    naicsCode: String,
    sicCode: String
  },

  // ==================== Industry & Classification ====================
  industry: {
    primary: {
      sector: String,
      subSector: String,
      code: String
    },
    secondary: [{
      sector: String,
      subSector: String,
      code: String
    }],
    keywords: [String],
    certifications: [{
      name: String,
      issuingBody: String,
      certificateNumber: String,
      issueDate: Date,
      expiryDate: Date,
      status: {
        type: String,
        enum: ['active', 'expired', 'suspended', 'revoked']
      },
      documentUrl: String
    }]
  },

  // ==================== Contact Information ====================
  contacts: {
    primary: {
      name: String,
      title: String,
      email: {
        type: String,
        validate: {
          validator: CommonValidator.isEmail,
          message: 'Invalid email address'
        }
      },
      phone: String,
      mobile: String,
      extension: String,
      preferredContactMethod: {
        type: String,
        enum: ['email', 'phone', 'mobile', 'in_person']
      }
    },
    billing: {
      name: String,
      title: String,
      email: String,
      phone: String,
      department: String
    },
    technical: [{
      name: String,
      title: String,
      email: String,
      phone: String,
      specialization: String,
      isPrimary: Boolean
    }],
    executives: [{
      name: String,
      title: String,
      role: {
        type: String,
        enum: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'other']
      },
      email: String,
      phone: String,
      linkedinUrl: String,
      addedAt: Date
    }],
    stakeholders: [{
      name: String,
      title: String,
      department: String,
      email: String,
      phone: String,
      role: String,
      influence: {
        type: String,
        enum: ['champion', 'supporter', 'neutral', 'skeptic', 'blocker']
      },
      decisionMaker: Boolean,
      notes: String
    }]
  },

  // ==================== Addresses ====================
  addresses: {
    headquarters: {
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: {
        type: String,
        required: true
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      },
      timezone: String
    },
    billing: {
      sameAsHeadquarters: {
        type: Boolean,
        default: true
      },
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    shipping: [{
      label: String,
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      isDefault: Boolean,
      contactName: String,
      contactPhone: String
    }],
    locations: [{
      type: {
        type: String,
        enum: ['office', 'warehouse', 'factory', 'store', 'datacenter', 'other']
      },
      name: String,
      address: {
        street1: String,
        street2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
      },
      employeeCount: Number,
      isPrimary: Boolean
    }]
  },

  // ==================== Financial & Billing ====================
  billing: {
    currency: {
      type: String,
      default: 'USD'
    },
    paymentTerms: {
      type: String,
      enum: ['net15', 'net30', 'net45', 'net60', 'net90', 'due_on_receipt', 'custom'],
      default: 'net30'
    },
    customPaymentTerms: {
      days: Number,
      description: String
    },
    creditLimit: {
      amount: Number,
      currency: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      reviewDate: Date
    },
    creditStatus: {
      rating: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor', 'unrated']
      },
      score: Number,
      agency: String,
      lastChecked: Date
    },
    taxExempt: {
      type: Boolean,
      default: false
    },
    taxExemptionDetails: {
      certificateNumber: String,
      issueDate: Date,
      expiryDate: Date,
      jurisdiction: String,
      documentUrl: String
    },
    preferredPaymentMethod: {
      type: String,
      enum: ['credit_card', 'ach', 'wire', 'check', 'paypal', 'crypto']
    },
    paymentMethods: [{
      type: {
        type: String,
        enum: ['credit_card', 'ach', 'wire', 'check', 'paypal', 'crypto']
      },
      isDefault: Boolean,
      details: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        select: false
      },
      verifiedAt: Date,
      addedAt: Date
    }],
    invoicePreferences: {
      frequency: {
        type: String,
        enum: ['monthly', 'quarterly', 'on_delivery', 'on_completion', 'custom']
      },
      format: {
        type: String,
        enum: ['pdf', 'excel', 'csv', 'edi']
      },
      deliveryMethod: {
        type: String,
        enum: ['email', 'portal', 'api', 'mail']
      },
      consolidate: Boolean,
      includeBackup: Boolean,
      customInstructions: String
    },
    billingHistory: [{
      invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
      },
      invoiceNumber: String,
      amount: Number,
      currency: String,
      issueDate: Date,
      dueDate: Date,
      paidDate: Date,
      status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'disputed', 'written_off']
      },
      paymentMethod: String,
      transactionId: String
    }],
    outstandingBalance: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    averageOrderValue: Number,
    paymentPerformance: {
      onTimePaymentRate: Number,
      averageDaysToPayment: Number,
      totalDisputes: Number,
      lastPaymentDate: Date
    }
  },

  // ==================== Service & Contract Management ====================
  contracts: [{
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    },
    contractNumber: String,
    type: {
      type: String,
      enum: ['master_agreement', 'sow', 'nda', 'sla', 'purchase_order', 'subscription']
    },
    status: {
      type: String,
      enum: ['draft', 'negotiation', 'active', 'expired', 'terminated', 'renewed']
    },
    value: {
      amount: Number,
      currency: String
    },
    startDate: Date,
    endDate: Date,
    autoRenew: Boolean,
    renewalDate: Date,
    terminationClause: String,
    signedBy: {
      client: {
        name: String,
        title: String,
        date: Date
      },
      company: {
        name: String,
        title: String,
        date: Date
      }
    },
    documents: [{
      type: String,
      url: String,
      uploadedAt: Date
    }]
  }],

  serviceAgreements: [{
    serviceType: String,
    slaLevel: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze', 'basic']
    },
    responseTime: String,
    resolutionTime: String,
    availability: String,
    supportHours: String,
    escalationPath: [String]
  }],

  // ==================== Projects & Engagements ====================
  projects: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    projectCode: String,
    name: String,
    status: {
      type: String,
      enum: ['prospect', 'proposal', 'active', 'on_hold', 'completed', 'cancelled']
    },
    value: Number,
    startDate: Date,
    endDate: Date,
    completionPercentage: Number
  }],

  engagements: [{
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Engagement'
    },
    type: String,
    status: String,
    startDate: Date,
    endDate: Date,
    value: Number
  }],

  opportunities: [{
    opportunityId: String,
    title: String,
    stage: {
      type: String,
      enum: ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
    },
    value: Number,
    probability: Number,
    expectedCloseDate: Date,
    competitor: [String],
    notes: String
  }],

  // ==================== Relationship & Account Management ====================
  relationship: {
    status: {
      type: String,
      enum: ['prospect', 'lead', 'active', 'inactive', 'churned', 'blacklisted'],
      default: 'prospect',
      index: true
    },
    tier: {
      type: String,
      enum: ['strategic', 'enterprise', 'mid_market', 'small_business', 'startup'],
      index: true
    },
    accountManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    salesRep: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    customerSuccessManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    technicalLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acquisitionDate: Date,
    acquisitionSource: {
      type: String,
      enum: ['direct_sales', 'marketing', 'referral', 'partner', 'inbound', 'event', 'other']
    },
    acquisitionCampaign: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client'
    },
    partnerChannel: String,
    onboardingStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'requires_attention']
    },
    onboardingCompletedAt: Date,
    healthScore: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      trend: {
        type: String,
        enum: ['improving', 'stable', 'declining']
      },
      factors: {
        engagement: Number,
        satisfaction: Number,
        adoption: Number,
        renewal: Number
      },
      lastCalculated: Date
    },
    satisfactionScore: {
      nps: Number,
      csat: Number,
      ces: Number,
      lastSurveyDate: Date
    },
    churnRisk: {
      level: {
        type: String,
        enum: ['none', 'low', 'medium', 'high', 'critical']
      },
      factors: [String],
      mitigationPlan: String,
      assessedAt: Date
    },
    retentionStrategy: String,
    upsellPotential: {
      score: Number,
      opportunities: [String],
      estimatedValue: Number
    }
  },

  // ==================== Communication & Interactions ====================
  communications: {
    preferences: {
      language: {
        type: String,
        default: 'en'
      },
      timezone: String,
      bestTimeToContact: String,
      doNotContact: {
        type: Boolean,
        default: false
      },
      communicationRestrictions: [String],
      preferredChannels: [{
        type: String,
        enum: ['email', 'phone', 'sms', 'whatsapp', 'slack', 'teams', 'portal']
      }]
    },
    lastContact: {
      date: Date,
      type: String,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      subject: String,
      outcome: String
    },
    nextScheduledContact: {
      date: Date,
      type: String,
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      purpose: String
    },
    interactionHistory: [{
      date: Date,
      type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'demo', 'support', 'complaint', 'feedback']
      },
      channel: String,
      initiatedBy: {
        type: String,
        enum: ['client', 'company']
      },
      participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      subject: String,
      notes: String,
      outcome: String,
      followUpRequired: Boolean,
      recordingUrl: String,
      duration: Number,
      sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative']
      }
    }],
    emailSubscriptions: {
      newsletter: Boolean,
      productUpdates: Boolean,
      marketingEmails: Boolean,
      eventInvitations: Boolean
    }
  },

  // ==================== Documents & Compliance ====================
  documents: [{
    documentId: String,
    type: {
      type: String,
      enum: ['contract', 'proposal', 'invoice', 'report', 'presentation', 'legal', 'technical', 'other']
    },
    name: String,
    description: String,
    url: String,
    size: Number,
    mimeType: String,
    version: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: Date,
    lastAccessedAt: Date,
    accessCount: {
      type: Number,
      default: 0
    },
    tags: [String],
    confidential: Boolean,
    expiryDate: Date
  }],

  compliance: {
    kycStatus: {
      type: String,
      enum: ['not_started', 'pending', 'verified', 'failed', 'expired'],
      default: 'not_started'
    },
    kycVerifiedAt: Date,
    kycExpiryDate: Date,
    amlStatus: {
      type: String,
      enum: ['clear', 'pending_review', 'high_risk', 'blocked']
    },
    amlCheckedAt: Date,
    sanctions: {
      checked: Boolean,
      checkedAt: Date,
      clearance: Boolean,
      notes: String
    },
    dataPrivacy: {
      gdprConsent: Boolean,
      gdprConsentDate: Date,
      ccpaConsent: Boolean,
      ccpaConsentDate: Date,
      dataRetentionAgreed: Boolean,
      dataProcessingAgreement: {
        signed: Boolean,
        signedDate: Date,
        documentUrl: String
      }
    },
    riskAssessment: {
      overallRisk: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      financialRisk: String,
      operationalRisk: String,
      reputationalRisk: String,
      assessedAt: Date,
      assessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      nextReviewDate: Date
    }
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    lifetime: {
      totalRevenue: {
        type: Number,
        default: 0
      },
      totalProjects: {
        type: Number,
        default: 0
      },
      totalEngagements: {
        type: Number,
        default: 0
      },
      averageProjectValue: Number,
      totalInvoices: {
        type: Number,
        default: 0
      },
      totalPayments: {
        type: Number,
        default: 0
      }
    },
    current: {
      activeProjects: {
        type: Number,
        default: 0
      },
      monthlyRecurringRevenue: Number,
      annualRecurringRevenue: Number,
      pendingRevenue: Number,
      utilizationRate: Number
    },
    engagement: {
      lastActivityDate: Date,
      activityScore: Number,
      portalLogins: {
        type: Number,
        default: 0
      },
      apiUsage: {
        type: Number,
        default: 0
      },
      supportTickets: {
        type: Number,
        default: 0
      },
      featureAdoption: {
        type: Map,
        of: Number
      }
    },
    performance: {
      projectSuccessRate: Number,
      onTimeDeliveryRate: Number,
      budgetAdherenceRate: Number,
      qualityScore: Number,
      escalations: {
        type: Number,
        default: 0
      }
    },
    trends: {
      revenueGrowth: Number,
      engagementTrend: String,
      satisfactionTrend: String,
      riskTrend: String
    }
  },

  // ==================== Notes & Custom Fields ====================
  notes: [{
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['general', 'sales', 'support', 'financial', 'technical', 'relationship']
    },
    visibility: {
      type: String,
      enum: ['public', 'internal', 'private']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    editedAt: Date,
    attachments: [String],
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],

  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // ==================== Social & Marketing ====================
  socialProfiles: {
    linkedin: {
      url: String,
      followers: Number,
      lastUpdated: Date
    },
    twitter: {
      handle: String,
      followers: Number,
      verified: Boolean
    },
    facebook: String,
    instagram: String,
    youtube: String,
    website: {
      url: String,
      technology: [String],
      monthlyVisitors: Number,
      alexaRank: Number
    }
  },

  marketing: {
    segment: {
      type: String,
      enum: ['key_account', 'growth', 'retention', 'win_back', 'prospect']
    },
    persona: String,
    leadScore: Number,
    campaigns: [{
      campaignId: String,
      name: String,
      type: String,
      status: String,
      enrolledAt: Date,
      completedAt: Date,
      outcome: String
    }],
    touchpoints: {
      type: Number,
      default: 0
    },
    conversionFunnel: {
      stage: String,
      enteredAt: Date,
      daysInStage: Number
    }
  },

  // ==================== API & Integration ====================
  integrations: {
    externalIds: {
      salesforce: String,
      hubspot: String,
      dynamics: String,
      sap: String,
      oracle: String,
      quickbooks: String,
      custom: {
        type: Map,
        of: String
      }
    },
    syncStatus: {
      lastSync: Date,
      nextSync: Date,
      syncErrors: [{
        date: Date,
        system: String,
        error: String
      }]
    },
    webhooks: [{
      url: String,
      events: [String],
      active: Boolean,
      secret: {
        type: String,
        select: false
      },
      lastTriggered: Date
    }]
  },

  // ==================== Metadata & System ====================
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'integration', 'migration']
    },
    importBatch: String,
    importedAt: Date,
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String],
    flags: {
      isVip: {
        type: Boolean,
        default: false
      },
      isStrategic: {
        type: Boolean,
        default: false
      },
      requiresAttention: {
        type: Boolean,
        default: false
      },
      hasCustomTerms: {
        type: Boolean,
        default: false
      }
    },
    version: {
      type: Number,
      default: 1
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Audit Trail ====================
  auditLog: [{
    action: String,
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: Date,
    ip: String,
    userAgent: String
  }],

  // ==================== Lifecycle Management ====================
  lifecycle: {
    stage: {
      type: String,
      enum: ['prospect', 'opportunity', 'customer', 'renewal', 'at_risk', 'churned'],
      default: 'prospect'
    },
    stageHistory: [{
      stage: String,
      enteredAt: Date,
      exitedAt: Date,
      duration: Number,
      trigger: String
    }],
    milestones: [{
      type: String,
      achievedAt: Date,
      value: mongoose.Schema.Types.Mixed
    }],
    importantDates: {
      firstContactDate: Date,
      qualificationDate: Date,
      firstPurchaseDate: Date,
      lastPurchaseDate: Date,
      lastRenewalDate: Date,
      nextRenewalDate: Date,
      churnDate: Date
    }
  },

  // ==================== Deletion & Archival ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  archiveStatus: {
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date,
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    archiveReason: String
  }
};

const clientSchema = new Schema(clientSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// ==================== Indexes ====================
clientSchema.index({ tenantId: 1, clientCode: 1 }, { unique: true });
clientSchema.index({ tenantId: 1, 'relationship.status': 1 });
clientSchema.index({ tenantId: 1, companyName: 1 });
clientSchema.index({ tenantId: 1, 'relationship.accountManager': 1 });
clientSchema.index({ tenantId: 1, 'relationship.tier': 1 });
clientSchema.index({ tenantId: 1, 'billing.outstandingBalance': -1 });
clientSchema.index({ tenantId: 1, 'analytics.lifetime.totalRevenue': -1 });
clientSchema.index({ tenantId: 1, 'lifecycle.stage': 1 });
clientSchema.index({ tenantId: 1, searchTokens: 1 });
clientSchema.index({ tenantId: 1, createdAt: -1 });
clientSchema.index({ tenantId: 1, isDeleted: 1 });

// Text search index
clientSchema.index({
  companyName: 'text',
  legalName: 'text',
  tradingName: 'text',
  'contacts.primary.name': 'text',
  'notes.content': 'text'
});

// ==================== Virtual Fields ====================
clientSchema.virtual('displayName').get(function() {
  return this.tradingName || this.companyName || this.legalName;
});

clientSchema.virtual('fullAddress').get(function() {
  const addr = this.addresses.headquarters;
  if (!addr) return '';
  const parts = [addr.street1, addr.street2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
  return parts.join(', ');
});

clientSchema.virtual('isActive').get(function() {
  return this.relationship.status === 'active' && !this.isDeleted && !this.archiveStatus.isArchived;
});

clientSchema.virtual('hasOutstandingBalance').get(function() {
  return this.billing.outstandingBalance > 0;
});

clientSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.lifecycle.importantDates.nextRenewalDate) return null;
  const days = Math.floor((this.lifecycle.importantDates.nextRenewalDate - new Date()) / (1000 * 60 * 60 * 24));
  return days;
});

clientSchema.virtual('primaryContact').get(function() {
  return this.contacts.primary;
});

// ==================== Pre-save Middleware ====================
clientSchema.pre('save', async function(next) {
  try {
    // Generate client code if not provided
    if (!this.clientCode && this.isNew) {
      this.clientCode = await this.constructor.generateClientCode(this.companyName, this.tenantId);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate analytics
    if (this.isModified('projects') || this.isModified('engagements')) {
      this.updateAnalytics();
    }

    // Update lifecycle stage
    if (this.isModified('relationship.status')) {
      this.updateLifecycleStage();
    }

    // Set legal name if not provided
    if (!this.legalName) {
      this.legalName = this.companyName;
    }

    // Encrypt sensitive data
    if (this.isModified('businessDetails.taxId') && this.businessDetails.taxId) {
      this.businessDetails.taxId = await EncryptionService.encrypt(this.businessDetails.taxId);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
clientSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add company name tokens
  if (this.companyName) {
    this.companyName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  if (this.legalName) {
    this.legalName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  if (this.tradingName) {
    this.tradingName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add client code
  if (this.clientCode) {
    tokens.add(this.clientCode.toLowerCase());
  }
  
  // Add contact names
  if (this.contacts.primary?.name) {
    this.contacts.primary.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add industry keywords
  if (this.industry.keywords) {
    this.industry.keywords.forEach(keyword => tokens.add(keyword.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

clientSchema.methods.updateAnalytics = function() {
  // Update lifetime analytics
  this.analytics.lifetime.totalProjects = this.projects.length;
  this.analytics.lifetime.totalEngagements = this.engagements.length;
  
  // Update current analytics
  this.analytics.current.activeProjects = this.projects.filter(p => p.status === 'active').length;
  
  // Calculate average project value
  const projectValues = this.projects.map(p => p.value).filter(v => v > 0);
  if (projectValues.length > 0) {
    this.analytics.lifetime.averageProjectValue = projectValues.reduce((a, b) => a + b, 0) / projectValues.length;
  }
};

clientSchema.methods.updateLifecycleStage = function() {
  const currentStage = this.lifecycle.stage;
  let newStage = currentStage;
  
  switch (this.relationship.status) {
    case 'prospect':
      newStage = 'prospect';
      break;
    case 'lead':
      newStage = 'opportunity';
      break;
    case 'active':
      newStage = 'customer';
      break;
    case 'churned':
      newStage = 'churned';
      break;
  }
  
  if (newStage !== currentStage) {
    // Update stage history
    if (!this.lifecycle.stageHistory) this.lifecycle.stageHistory = [];
    
    const lastStage = this.lifecycle.stageHistory[this.lifecycle.stageHistory.length - 1];
    if (lastStage) {
      lastStage.exitedAt = new Date();
      lastStage.duration = lastStage.exitedAt - lastStage.enteredAt;
    }
    
    this.lifecycle.stageHistory.push({
      stage: newStage,
      enteredAt: new Date(),
      trigger: 'status_change'
    });
    
    this.lifecycle.stage = newStage;
  }
};

clientSchema.methods.addProject = async function(projectData) {
  const project = {
    projectId: projectData._id,
    projectCode: projectData.projectCode,
    name: projectData.name,
    status: projectData.status,
    value: projectData.value,
    startDate: projectData.startDate,
    endDate: projectData.endDate,
    completionPercentage: 0
  };
  
  this.projects.push(project);
  
  // Update analytics
  this.analytics.lifetime.totalProjects += 1;
  this.analytics.lifetime.totalRevenue += projectData.value || 0;
  if (projectData.status === 'active') {
    this.analytics.current.activeProjects += 1;
  }
  
  await this.save();
  return project;
};

clientSchema.methods.updateHealthScore = async function() {
  const factors = {
    engagement: 0,
    satisfaction: 0,
    adoption: 0,
    renewal: 0
  };
  
  // Calculate engagement score (0-100)
  const daysSinceLastActivity = this.analytics.engagement.lastActivityDate 
    ? Math.floor((new Date() - this.analytics.engagement.lastActivityDate) / (1000 * 60 * 60 * 24))
    : 365;
  factors.engagement = Math.max(0, 100 - (daysSinceLastActivity * 2));
  
  // Use satisfaction scores if available
  if (this.relationship.satisfactionScore?.nps) {
    factors.satisfaction = Math.max(0, Math.min(100, (this.relationship.satisfactionScore.nps + 100) / 2));
  }
  
  // Calculate adoption based on feature usage
  if (this.analytics.engagement.featureAdoption) {
    const adoptionValues = Array.from(this.analytics.engagement.featureAdoption.values());
    factors.adoption = adoptionValues.length > 0 
      ? Math.min(100, (adoptionValues.reduce((a, b) => a + b, 0) / adoptionValues.length) * 10)
      : 0;
  }
  
  // Calculate renewal probability
  const daysUntilRenewal = this.daysUntilRenewal;
  if (daysUntilRenewal !== null) {
    factors.renewal = daysUntilRenewal > 90 ? 100 : Math.max(0, daysUntilRenewal);
  }
  
  // Calculate overall score
  const weights = { engagement: 0.3, satisfaction: 0.3, adoption: 0.2, renewal: 0.2 };
  const score = Object.keys(factors).reduce((total, key) => {
    return total + (factors[key] * weights[key]);
  }, 0);
  
  // Determine trend
  const previousScore = this.relationship.healthScore?.score || score;
  let trend = 'stable';
  if (score > previousScore + 5) trend = 'improving';
  else if (score < previousScore - 5) trend = 'declining';
  
  this.relationship.healthScore = {
    score: Math.round(score),
    trend,
    factors,
    lastCalculated: new Date()
  };
  
  // Update churn risk based on health score
  if (score < 30) {
    this.relationship.churnRisk.level = 'critical';
  } else if (score < 50) {
    this.relationship.churnRisk.level = 'high';
  } else if (score < 70) {
    this.relationship.churnRisk.level = 'medium';
  } else {
    this.relationship.churnRisk.level = 'low';
  }
  
  await this.save();
  return this.relationship.healthScore;
};

clientSchema.methods.recordInteraction = async function(interactionData) {
  const interaction = {
    date: new Date(),
    type: interactionData.type,
    channel: interactionData.channel,
    initiatedBy: interactionData.initiatedBy,
    participants: interactionData.participants,
    subject: interactionData.subject,
    notes: interactionData.notes,
    outcome: interactionData.outcome,
    followUpRequired: interactionData.followUpRequired,
    duration: interactionData.duration,
    sentiment: interactionData.sentiment
  };
  
  if (!this.communications.interactionHistory) {
    this.communications.interactionHistory = [];
  }
  
  this.communications.interactionHistory.unshift(interaction);
  
  // Keep only last 100 interactions
  this.communications.interactionHistory = this.communications.interactionHistory.slice(0, 100);
  
  // Update last contact
  this.communications.lastContact = {
    date: interaction.date,
    type: interaction.type,
    by: interactionData.by,
    subject: interaction.subject,
    outcome: interaction.outcome
  };
  
  // Update analytics
  this.analytics.engagement.lastActivityDate = new Date();
  this.analytics.engagement.activityScore = Math.min(100, (this.analytics.engagement.activityScore || 0) + 5);
  
  await this.save();
  return interaction;
};

clientSchema.methods.addContract = async function(contractData) {
  const contract = {
    contractId: contractData._id,
    contractNumber: contractData.contractNumber,
    type: contractData.type,
    status: contractData.status,
    value: contractData.value,
    startDate: contractData.startDate,
    endDate: contractData.endDate,
    autoRenew: contractData.autoRenew,
    signedBy: contractData.signedBy,
    documents: contractData.documents
  };
  
  this.contracts.push(contract);
  
  // Update next renewal date if applicable
  if (contract.endDate && contract.status === 'active') {
    if (!this.lifecycle.importantDates.nextRenewalDate || contract.endDate < this.lifecycle.importantDates.nextRenewalDate) {
      this.lifecycle.importantDates.nextRenewalDate = contract.endDate;
    }
  }
  
  await this.save();
  return contract;
};

clientSchema.methods.calculateCreditLimit = async function() {
  // Base calculation on payment history and revenue
  let creditLimit = 0;
  
  // Factor 1: Payment performance (40% weight)
  const paymentScore = this.billing.paymentPerformance?.onTimePaymentRate || 0;
  creditLimit += (paymentScore / 100) * 40000;
  
  // Factor 2: Total revenue (30% weight)
  const totalRevenue = this.analytics.lifetime.totalRevenue || 0;
  creditLimit += totalRevenue * 0.1;
  
  // Factor 3: Relationship duration (20% weight)
  const relationshipMonths = this.lifecycle.importantDates.acquisitionDate
    ? Math.floor((new Date() - this.lifecycle.importantDates.acquisitionDate) / (1000 * 60 * 60 * 24 * 30))
    : 0;
  creditLimit += relationshipMonths * 1000;
  
  // Factor 4: Company size (10% weight)
  const revenueMultiplier = {
    '<1M': 0.5,
    '1M-10M': 1,
    '10M-50M': 2,
    '50M-100M': 3,
    '100M-500M': 4,
    '500M-1B': 5,
    '1B+': 10
  };
  const sizeMultiplier = revenueMultiplier[this.businessDetails.annualRevenue?.range] || 1;
  creditLimit *= sizeMultiplier;
  
  // Apply tier multiplier
  const tierMultiplier = {
    'strategic': 2,
    'enterprise': 1.5,
    'mid_market': 1,
    'small_business': 0.7,
    'startup': 0.5
  };
  creditLimit *= tierMultiplier[this.relationship.tier] || 1;
  
  // Round to nearest 1000
  creditLimit = Math.round(creditLimit / 1000) * 1000;
  
  // Apply min/max limits
  creditLimit = Math.max(5000, Math.min(creditLimit, 1000000));
  
  return creditLimit;
};

clientSchema.methods.addNote = async function(noteData, userId) {
  const note = {
    content: noteData.content,
    type: noteData.type || 'general',
    visibility: noteData.visibility || 'internal',
    createdBy: userId,
    createdAt: new Date(),
    attachments: noteData.attachments,
    mentions: noteData.mentions
  };
  
  if (!this.notes) this.notes = [];
  this.notes.unshift(note);
  
  // Keep only last 500 notes
  this.notes = this.notes.slice(0, 500);
  
  await this.save();
  return note;
};

clientSchema.methods.archive = async function(userId, reason) {
  this.archiveStatus = {
    isArchived: true,
    archivedAt: new Date(),
    archivedBy: userId,
    archiveReason: reason
  };
  
  // Update relationship status
  this.relationship.status = 'inactive';
  
  await this.save();
  
  logger.info('Client archived', {
    clientId: this._id,
    clientCode: this.clientCode,
    archivedBy: userId,
    reason
  });
  
  return true;
};

clientSchema.methods.unarchive = async function(userId) {
  this.archiveStatus = {
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null
  };
  
  await this.save();
  
  logger.info('Client unarchived', {
    clientId: this._id,
    clientCode: this.clientCode,
    unarchivedBy: userId
  });
  
  return true;
};

// ==================== Static Methods ====================
clientSchema.statics.generateClientCode = async function(companyName, tenantId) {
  // Generate code from company name
  const prefix = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 3)
    .padEnd(3, 'X');
  
  // Find the next available number for this prefix
  const lastClient = await this.findOne({
    tenantId,
    clientCode: new RegExp(`^${prefix}-\\d{4}$`)
  }).sort({ clientCode: -1 });
  
  let nextNumber = 1;
  if (lastClient) {
    const lastNumber = parseInt(lastClient.clientCode.split('-')[1]);
    nextNumber = lastNumber + 1;
  }
  
  return `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
};

clientSchema.statics.findByTenant = async function(tenantId, options = {}) {
  const {
    status,
    tier,
    accountManager,
    includeArchived = false,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = {
    tenantId,
    isDeleted: false
  };
  
  if (!includeArchived) {
    query['archiveStatus.isArchived'] = { $ne: true };
  }
  
  if (status) {
    query['relationship.status'] = status;
  }
  
  if (tier) {
    query['relationship.tier'] = tier;
  }
  
  if (accountManager) {
    query['relationship.accountManager'] = accountManager;
  }
  
  const [clients, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    clients,
    total,
    hasMore: total > skip + clients.length
  };
};

clientSchema.statics.searchClients = async function(tenantId, searchQuery, options = {}) {
  const {
    filters = {},
    limit = 20,
    skip = 0,
    sort = { 'analytics.lifetime.totalRevenue': -1 }
  } = options;
  
  const query = {
    tenantId,
    isDeleted: false,
    'archiveStatus.isArchived': { $ne: true },
    $or: [
      { companyName: new RegExp(searchQuery, 'i') },
      { legalName: new RegExp(searchQuery, 'i') },
      { tradingName: new RegExp(searchQuery, 'i') },
      { clientCode: new RegExp(searchQuery, 'i') },
      { searchTokens: new RegExp(searchQuery, 'i') }
    ]
  };
  
  // Apply filters
  Object.keys(filters).forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null) {
      query[key] = filters[key];
    }
  });
  
  const [clients, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    clients,
    total,
    hasMore: total > skip + clients.length
  };
};

clientSchema.statics.getClientStatistics = async function(tenantId, dateRange = {}) {
  const match = {
    tenantId,
    isDeleted: false
  };
  
  if (dateRange.start || dateRange.end) {
    match.createdAt = {};
    if (dateRange.start) match.createdAt.$gte = dateRange.start;
    if (dateRange.end) match.createdAt.$lte = dateRange.end;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
              },
              prospects: {
                $sum: { $cond: [{ $eq: ['$relationship.status', 'prospect'] }, 1, 0] }
              },
              churned: {
                $sum: { $cond: [{ $eq: ['$relationship.status', 'churned'] }, 1, 0] }
              },
              totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
              avgRevenue: { $avg: '$analytics.lifetime.totalRevenue' },
              totalOutstanding: { $sum: '$billing.outstandingBalance' }
            }
          }
        ],
        byTier: [
          {
            $group: {
              _id: '$relationship.tier',
              count: { $sum: 1 },
              revenue: { $sum: '$analytics.lifetime.totalRevenue' }
            }
          }
        ],
        byIndustry: [
          {
            $group: {
              _id: '$industry.primary.sector',
              count: { $sum: 1 },
              revenue: { $sum: '$analytics.lifetime.totalRevenue' }
            }
          },
          { $sort: { revenue: -1 } },
          { $limit: 10 }
        ],
        byAccountManager: [
          {
            $group: {
              _id: '$relationship.accountManager',
              count: { $sum: 1 },
              revenue: { $sum: '$analytics.lifetime.totalRevenue' },
              avgHealthScore: { $avg: '$relationship.healthScore.score' }
            }
          }
        ],
        revenueByMonth: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              revenue: { $sum: '$analytics.lifetime.totalRevenue' },
              newClients: { $sum: 1 }
            }
          },
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ],
        topClients: [
          { $sort: { 'analytics.lifetime.totalRevenue': -1 } },
          { $limit: 10 },
          {
            $project: {
              clientCode: 1,
              companyName: 1,
              revenue: '$analytics.lifetime.totalRevenue',
              tier: '$relationship.tier'
            }
          }
        ],
        atRiskClients: [
          { $match: { 'relationship.churnRisk.level': { $in: ['high', 'critical'] } } },
          { $limit: 10 },
          {
            $project: {
              clientCode: 1,
              companyName: 1,
              riskLevel: '$relationship.churnRisk.level',
              healthScore: '$relationship.healthScore.score'
            }
          }
        ]
      }
    }
  ]);
  
  const result = stats[0];
  
  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      prospects: 0,
      churned: 0,
      totalRevenue: 0,
      avgRevenue: 0,
      totalOutstanding: 0
    },
    distribution: {
      byTier: result.byTier,
      byIndustry: result.byIndustry,
      byAccountManager: result.byAccountManager
    },
    trends: {
      revenueByMonth: result.revenueByMonth.reverse()
    },
    insights: {
      topClients: result.topClients,
      atRiskClients: result.atRiskClients
    }
  };
};

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 */
module.exports = {
    schema: clientSchema,
    modelName: 'Client',

    // Legacy export for backward compatibility
    // This will be used if imported directly in environments without ConnectionManager
    createModel: function (connection) {
        if (connection) {
            return connection.model('Client', clientSchema)
        } else {
            // Fallback to default mongoose connection
            return mongoose.model('Client', clientSchema)
        }
    }
}

// For backward compatibility, also exports as direct model
module.exports.Client = mongoose.model('Client', clientSchema);
module.exports.clientSchema = clientSchema;
