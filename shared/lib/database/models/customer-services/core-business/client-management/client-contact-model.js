'use strict';

/**
 * @fileoverview Enhanced client contact model with comprehensive relationship management
 * @module servers/customer-services/modules/core-business/clients/models/client-contact-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const EncryptionService = require('../../../../..//security/encryption/encryption-service');

/**
 * Enhanced client contact schema definition for enterprise contact management
 */
const clientContactSchemaDefinition = {
  // ==================== Core Identity ====================
  contactId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^CONT-[A-Z0-9]{8,}$/,
    index: true,
    immutable: true
  },

  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
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

  // ==================== Personal Information ====================
  personalInfo: {
    prefix: {
      type: String,
      enum: ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Hon', 'Rev']
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    middleName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    suffix: {
      type: String,
      enum: ['Jr', 'Sr', 'II', 'III', 'IV', 'PhD', 'MD', 'Esq']
    },
    nickname: {
      type: String,
      trim: true,
      maxlength: 50
    },
    pronouns: {
      type: String,
      enum: ['he/him', 'she/her', 'they/them', 'other']
    },
    dateOfBirth: {
      type: Date,
      select: false
    },
    nationality: String,
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['native', 'fluent', 'professional', 'conversational', 'basic']
      },
      isPrimary: Boolean
    }],
    photo: {
      url: String,
      publicId: String,
      source: {
        type: String,
        enum: ['upload', 'gravatar', 'linkedin', 'generated']
      },
      updatedAt: Date
    }
  },

  // ==================== Professional Information ====================
  professionalInfo: {
    jobTitle: {
      type: String,
      required: true,
      maxlength: 200
    },
    department: {
      type: String,
      maxlength: 100
    },
    division: String,
    reportsTo: {
      name: String,
      title: String,
      contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientContact'
      }
    },
    seniority: {
      type: String,
      enum: ['entry', 'associate', 'senior', 'lead', 'manager', 'director', 'vp', 'svp', 'evp', 'c_suite', 'owner']
    },
    employeeId: String,
    startDate: Date,
    yearsWithCompany: Number,
    responsibilities: [String],
    specializations: [String],
    certifications: [{
      name: String,
      issuingOrganization: String,
      issueDate: Date,
      expiryDate: Date,
      credentialId: String,
      verificationUrl: String
    }],
    professionalMemberships: [{
      organization: String,
      role: String,
      since: Date
    }],
    education: [{
      degree: String,
      field: String,
      institution: String,
      graduationYear: Number
    }],
    previousEmployment: [{
      company: String,
      position: String,
      duration: String,
      keyAchievements: [String]
    }]
  },

  // ==================== Contact Information ====================
  contactDetails: {
    emails: [{
      address: {
        type: String,
        required: true,
        lowercase: true,
        validate: {
          validator: CommonValidator.isEmail,
          message: 'Invalid email address'
        }
      },
      type: {
        type: String,
        enum: ['work', 'personal', 'other'],
        default: 'work'
      },
      isPrimary: {
        type: Boolean,
        default: false
      },
      isVerified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date,
      doNotEmail: {
        type: Boolean,
        default: false
      }
    }],
    phones: [{
      number: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['office', 'mobile', 'home', 'fax', 'other'],
        default: 'office'
      },
      extension: String,
      isPrimary: {
        type: Boolean,
        default: false
      },
      isVerified: {
        type: Boolean,
        default: false
      },
      canText: {
        type: Boolean,
        default: false
      },
      preferredCallTime: String,
      doNotCall: {
        type: Boolean,
        default: false
      }
    }],
    addresses: [{
      type: {
        type: String,
        enum: ['office', 'home', 'other'],
        default: 'office'
      },
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      isPrimary: Boolean,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    }],
    socialProfiles: [{
      platform: {
        type: String,
        enum: ['linkedin', 'twitter', 'facebook', 'instagram', 'github', 'other']
      },
      url: String,
      handle: String,
      verified: Boolean,
      isPublic: Boolean
    }],
    instantMessaging: [{
      platform: {
        type: String,
        enum: ['slack', 'teams', 'whatsapp', 'telegram', 'wechat', 'skype', 'other']
      },
      identifier: String,
      isPrimary: Boolean
    }],
    website: String,
    assistantInfo: {
      name: String,
      email: String,
      phone: String,
      notes: String
    }
  },

  // ==================== Role & Influence ====================
  roleInfluence: {
    isPrimaryContact: {
      type: Boolean,
      default: false,
      index: true
    },
    isBillingContact: {
      type: Boolean,
      default: false
    },
    isTechnicalContact: {
      type: Boolean,
      default: false
    },
    isDecisionMaker: {
      type: Boolean,
      default: false
    },
    decisionAuthority: {
      type: String,
      enum: ['final', 'approval', 'recommendation', 'influencer', 'end_user', 'none']
    },
    budgetAuthority: {
      hasAuthority: Boolean,
      limit: Number,
      currency: String
    },
    influence: {
      level: {
        type: String,
        enum: ['champion', 'supporter', 'neutral', 'skeptic', 'detractor', 'unknown'],
        default: 'unknown'
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      notes: String
    },
    stakeholderType: {
      type: String,
      enum: ['executive_sponsor', 'business_owner', 'technical_lead', 'project_manager', 'end_user', 'influencer', 'gatekeeper', 'other']
    },
    buyingRole: {
      type: String,
      enum: ['economic_buyer', 'technical_buyer', 'user_buyer', 'coach', 'none']
    },
    engagementLevel: {
      type: String,
      enum: ['highly_engaged', 'engaged', 'somewhat_engaged', 'disengaged', 'unknown'],
      default: 'unknown'
    }
  },

  // ==================== Communication Preferences ====================
  communicationPreferences: {
    preferredChannel: {
      type: String,
      enum: ['email', 'phone', 'text', 'in_person', 'video_call', 'instant_message'],
      default: 'email'
    },
    preferredLanguage: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    bestTimeToContact: {
      days: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      timeRange: {
        start: String,
        end: String
      }
    },
    communicationFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'as_needed']
    },
    doNotContact: {
      enabled: {
        type: Boolean,
        default: false
      },
      reason: String,
      until: Date,
      setBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      setAt: Date
    },
    subscriptions: {
      newsletter: {
        type: Boolean,
        default: true
      },
      productUpdates: {
        type: Boolean,
        default: true
      },
      events: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      },
      surveys: {
        type: Boolean,
        default: true
      }
    },
    communicationRestrictions: [String]
  },

  // ==================== Relationship Management ====================
  relationship: {
    status: {
      type: String,
      enum: ['active', 'inactive', 'left_company', 'on_leave', 'do_not_contact', 'deceased'],
      default: 'active',
      index: true
    },
    type: {
      type: String,
      enum: ['primary', 'secondary', 'technical', 'billing', 'legal', 'emergency']
    },
    startDate: Date,
    endDate: Date,
    strength: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      level: {
        type: String,
        enum: ['very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'none']
      },
      lastAssessed: Date
    },
    lastInteraction: {
      date: Date,
      type: String,
      channel: String,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      outcome: String,
      notes: String
    },
    nextScheduledInteraction: {
      date: Date,
      type: String,
      purpose: String,
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reminder: {
        enabled: Boolean,
        date: Date
      }
    },
    relationshipOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    accountTeamRole: String,
    keyRelationships: [{
      contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientContact'
      },
      relationship: {
        type: String,
        enum: ['reports_to', 'manages', 'peer', 'collaborates_with', 'influenced_by', 'influences']
      },
      strength: {
        type: String,
        enum: ['strong', 'moderate', 'weak']
      }
    }],
    replacedBy: {
      contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientContact'
      },
      date: Date,
      reason: String
    }
  },

  // ==================== Interaction History ====================
  interactions: [{
    interactionId: String,
    date: {
      type: Date,
      required: true
    },
    type: {
      type: String,
      enum: ['call', 'email', 'meeting', 'video_call', 'text', 'social', 'event', 'other'],
      required: true
    },
    channel: String,
    direction: {
      type: String,
      enum: ['inbound', 'outbound']
    },
    purpose: String,
    subject: String,
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    duration: Number,
    outcome: {
      type: String,
      enum: ['successful', 'follow_up_required', 'no_response', 'negative', 'neutral']
    },
    notes: String,
    sentiment: {
      type: String,
      enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative']
    },
    followUpRequired: Boolean,
    followUpDate: Date,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    attachments: [String],
    tags: [String]
  }],

  // ==================== Activities & Engagement ====================
  activities: {
    emailOpens: {
      type: Number,
      default: 0
    },
    emailClicks: {
      type: Number,
      default: 0
    },
    webVisits: {
      type: Number,
      default: 0
    },
    documentsViewed: {
      type: Number,
      default: 0
    },
    eventsAttended: [{
      eventName: String,
      eventDate: Date,
      eventType: String,
      participated: Boolean,
      feedback: String
    }],
    campaignEngagement: [{
      campaignId: String,
      campaignName: String,
      engagement: {
        type: String,
        enum: ['opened', 'clicked', 'responded', 'converted', 'unsubscribed']
      },
      date: Date
    }],
    portalActivity: {
      lastLogin: Date,
      totalLogins: {
        type: Number,
        default: 0
      },
      actionsPerformed: {
        type: Number,
        default: 0
      }
    },
    socialEngagement: {
      linkedinConnected: Boolean,
      twitterFollowing: Boolean,
      contentShares: {
        type: Number,
        default: 0
      },
      contentLikes: {
        type: Number,
        default: 0
      },
      comments: {
        type: Number,
        default: 0
      }
    }
  },

  // ==================== Projects & Opportunities ====================
  projectInvolvement: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    role: String,
    involvement: {
      type: String,
      enum: ['lead', 'key_stakeholder', 'contributor', 'informed', 'approver']
    },
    startDate: Date,
    endDate: Date,
    contribution: String,
    satisfaction: {
      type: Number,
      min: 1,
      max: 5
    }
  }],

  opportunities: [{
    opportunityId: String,
    role: String,
    influence: {
      type: String,
      enum: ['champion', 'supporter', 'neutral', 'opponent', 'unknown']
    },
    stage: String,
    notes: String
  }],

  // ==================== Personal Preferences & Interests ====================
  personalPreferences: {
    interests: {
      professional: [String],
      personal: [String],
      hobbies: [String],
      sports: [String]
    },
    preferences: {
      coffee: String,
      dietary: [String],
      seatingPreference: String,
      travelPreference: String
    },
    personalDetails: {
      spouseName: {
        type: String,
        select: false
      },
      children: [{
        name: String,
        age: Number,
        interests: [String]
      }],
      pets: [{
        type: String,
        name: String
      }],
      significantDates: [{
        date: Date,
        occasion: String,
        recurring: Boolean
      }]
    },
    giftHistory: [{
      date: Date,
      occasion: String,
      gift: String,
      response: String
    }],
    notes: {
      type: String,
      maxlength: 5000,
      select: false
    }
  },

  // ==================== Scoring & Analytics ====================
  scoring: {
    leadScore: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      factors: {
        demographic: Number,
        firmographic: Number,
        behavioral: Number,
        engagement: Number
      },
      lastCalculated: Date,
      trend: {
        type: String,
        enum: ['increasing', 'stable', 'decreasing']
      }
    },
    engagementScore: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      recentActivity: Number,
      responseRate: Number,
      initiativeRate: Number,
      lastCalculated: Date
    },
    influenceScore: {
      internal: Number,
      external: Number,
      overall: Number,
      lastCalculated: Date
    },
    riskScore: {
      flightRisk: {
        type: Number,
        min: 0,
        max: 100
      },
      factors: [String],
      lastAssessed: Date
    },
    satisfactionScore: {
      nps: Number,
      csat: Number,
      lastSurveyDate: Date,
      feedback: String
    }
  },

  // ==================== Data Quality & Validation ====================
  dataQuality: {
    completeness: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      missingFields: [String],
      lastChecked: Date
    },
    accuracy: {
      verified: {
        type: Boolean,
        default: false
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date,
      verificationMethod: String
    },
    lastUpdated: {
      date: Date,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      source: {
        type: String,
        enum: ['manual', 'import', 'integration', 'enrichment', 'api']
      }
    },
    enrichment: {
      lastEnriched: Date,
      source: String,
      fieldsEnriched: [String],
      confidence: Number
    },
    duplicateCheck: {
      lastChecked: Date,
      potentialDuplicates: [{
        contactId: String,
        similarity: Number,
        fields: [String]
      }],
      isDuplicate: Boolean,
      masterRecordId: String
    }
  },

  // ==================== Compliance & Privacy ====================
  compliance: {
    gdpr: {
      consentGiven: Boolean,
      consentDate: Date,
      consentMethod: String,
      lawfulBasis: {
        type: String,
        enum: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests']
      },
      dataRetentionApproved: Boolean,
      portabilityRequested: Boolean,
      erasureRequested: Boolean,
      restrictionRequested: Boolean
    },
    marketing: {
      optIn: Boolean,
      optInDate: Date,
      optInMethod: String,
      optOutDate: Date,
      optOutReason: String,
      suppressionList: Boolean
    },
    doNotSell: Boolean,
    dataSource: {
      type: String,
      enum: ['direct', 'imported', 'purchased', 'public', 'partner', 'enriched']
    },
    retentionPolicy: {
      policy: String,
      reviewDate: Date,
      expiryDate: Date
    }
  },

  // ==================== Integration & External Systems ====================
  integrations: {
    externalIds: {
      salesforce: String,
      hubspot: String,
      dynamics: String,
      marketo: String,
      linkedin: String,
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
        error: String,
        resolved: Boolean
      }]
    },
    apiAccess: {
      enabled: Boolean,
      lastAccessed: Date,
      accessCount: {
        type: Number,
        default: 0
      }
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
      enum: ['general', 'meeting', 'personal', 'strategic', 'warning', 'opportunity']
    },
    visibility: {
      type: String,
      enum: ['public', 'team', 'private'],
      default: 'team'
    },
    importance: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
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
    modifiedAt: Date,
    expiresAt: Date,
    tags: [String],
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],

  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // ==================== Tags & Categories ====================
  tags: [String],
  
  categories: [{
    type: String,
    enum: ['vip', 'key_contact', 'technical', 'business', 'executive', 'operational', 'strategic']
  }],

  // ==================== Metadata & System ====================
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'integration', 'enrichment', 'migration']
    },
    importBatch: String,
    importedAt: Date,
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    flags: {
      isVip: {
        type: Boolean,
        default: false
      },
      requiresValidation: {
        type: Boolean,
        default: false
      },
      hasDataIssues: {
        type: Boolean,
        default: false
      },
      isTestContact: {
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
    reason: String,
    ip: String,
    userAgent: String
  }],

  // ==================== Lifecycle Management ====================
  lifecycle: {
    firstContactDate: Date,
    lastContactDate: Date,
    totalInteractions: {
      type: Number,
      default: 0
    },
    averageResponseTime: Number,
    preferredContactMethod: String,
    contactFrequency: {
      value: Number,
      unit: String
    },
    nextReviewDate: Date,
    archiveDate: Date,
    retentionExpiryDate: Date
  },

  // ==================== Status & Visibility ====================
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

const clientContactSchema = new Schema(clientContactSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// ==================== Indexes ====================
clientContactSchema.index({ tenantId: 1, contactId: 1 }, { unique: true });
clientContactSchema.index({ tenantId: 1, clientId: 1, 'relationship.status': 1 });
clientContactSchema.index({ tenantId: 1, 'personalInfo.firstName': 1, 'personalInfo.lastName': 1 });
clientContactSchema.index({ tenantId: 1, 'contactDetails.emails.address': 1 });
clientContactSchema.index({ tenantId: 1, 'roleInfluence.isPrimaryContact': 1 });
clientContactSchema.index({ tenantId: 1, 'relationship.relationshipOwner': 1 });
clientContactSchema.index({ tenantId: 1, isActive: 1, isDeleted: 1 });
clientContactSchema.index({ tenantId: 1, searchTokens: 1 });
clientContactSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
clientContactSchema.index({
  'personalInfo.firstName': 'text',
  'personalInfo.lastName': 'text',
  'professionalInfo.jobTitle': 'text',
  'notes.content': 'text'
});

// ==================== Virtual Fields ====================
clientContactSchema.virtual('fullName').get(function() {
  const parts = [
    this.personalInfo.prefix,
    this.personalInfo.firstName,
    this.personalInfo.middleName,
    this.personalInfo.lastName,
    this.personalInfo.suffix
  ].filter(Boolean);
  return parts.join(' ');
});

clientContactSchema.virtual('displayName').get(function() {
  if (this.personalInfo.nickname) {
    return `${this.personalInfo.nickname} ${this.personalInfo.lastName}`;
  }
  return this.fullName;
});

clientContactSchema.virtual('primaryEmail').get(function() {
  const primary = this.contactDetails.emails.find(e => e.isPrimary);
  return primary ? primary.address : this.contactDetails.emails[0]?.address;
});

clientContactSchema.virtual('primaryPhone').get(function() {
  const primary = this.contactDetails.phones.find(p => p.isPrimary);
  return primary ? primary.number : this.contactDetails.phones[0]?.number;
});

clientContactSchema.virtual('daysSinceLastContact').get(function() {
  if (!this.relationship.lastInteraction?.date) return null;
  return Math.floor((new Date() - this.relationship.lastInteraction.date) / (1000 * 60 * 60 * 24));
});

clientContactSchema.virtual('isKeyContact').get(function() {
  return this.roleInfluence.isPrimaryContact || 
         this.roleInfluence.isDecisionMaker || 
         this.roleInfluence.influence.level === 'champion';
});

clientContactSchema.virtual('engagementLevel').get(function() {
  const score = this.scoring.engagementScore.score || 0;
  if (score >= 80) return 'highly_engaged';
  if (score >= 60) return 'engaged';
  if (score >= 40) return 'somewhat_engaged';
  if (score >= 20) return 'minimally_engaged';
  return 'disengaged';
});

// ==================== Pre-save Middleware ====================
clientContactSchema.pre('save', async function(next) {
  try {
    // Generate contact ID if not provided
    if (!this.contactId && this.isNew) {
      this.contactId = await this.constructor.generateContactId(this.tenantId);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate scores
    if (this.isModified('interactions') || this.isModified('activities')) {
      this.calculateEngagementScore();
    }

    // Update lifecycle metrics
    if (this.isModified('interactions')) {
      this.updateLifecycleMetrics();
    }

    // Check data quality
    this.assessDataQuality();

    // Encrypt sensitive data
    if (this.isModified('personalInfo.dateOfBirth') && this.personalInfo.dateOfBirth) {
      // Encrypt date of birth if needed
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
clientContactSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add name tokens
  if (this.personalInfo.firstName) {
    this.personalInfo.firstName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  if (this.personalInfo.lastName) {
    this.personalInfo.lastName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  if (this.personalInfo.nickname) {
    tokens.add(this.personalInfo.nickname.toLowerCase());
  }
  
  // Add email tokens
  this.contactDetails.emails.forEach(email => {
    const parts = email.address.split('@')[0].split(/[._-]/);
    parts.forEach(part => tokens.add(part.toLowerCase()));
  });
  
  // Add company and title tokens
  if (this.professionalInfo.jobTitle) {
    this.professionalInfo.jobTitle.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add tags
  if (this.tags) {
    this.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

clientContactSchema.methods.calculateEngagementScore = function() {
  let score = 0;
  const weights = {
    recentInteraction: 30,
    interactionFrequency: 25,
    emailEngagement: 15,
    eventParticipation: 15,
    portalActivity: 10,
    socialEngagement: 5
  };
  
  // Recent interaction score
  const daysSinceContact = this.daysSinceLastContact;
  if (daysSinceContact !== null) {
    if (daysSinceContact <= 7) score += weights.recentInteraction;
    else if (daysSinceContact <= 30) score += weights.recentInteraction * 0.7;
    else if (daysSinceContact <= 90) score += weights.recentInteraction * 0.3;
  }
  
  // Interaction frequency
  const monthlyInteractions = this.interactions.filter(i => 
    i.date > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;
  score += Math.min(weights.interactionFrequency, monthlyInteractions * 5);
  
  // Email engagement
  if (this.activities.emailOpens > 0) {
    const clickRate = this.activities.emailClicks / this.activities.emailOpens;
    score += weights.emailEngagement * Math.min(1, clickRate * 2);
  }
  
  // Event participation
  const recentEvents = this.activities.eventsAttended.filter(e => 
    e.eventDate > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  ).length;
  score += Math.min(weights.eventParticipation, recentEvents * 5);
  
  // Portal activity
  if (this.activities.portalActivity.lastLogin) {
    const daysSinceLogin = Math.floor((new Date() - this.activities.portalActivity.lastLogin) / (1000 * 60 * 60 * 24));
    if (daysSinceLogin <= 30) score += weights.portalActivity;
    else if (daysSinceLogin <= 90) score += weights.portalActivity * 0.5;
  }
  
  // Social engagement
  if (this.activities.socialEngagement.linkedinConnected) score += weights.socialEngagement * 0.5;
  if (this.activities.socialEngagement.contentShares > 0) score += weights.socialEngagement * 0.5;
  
  this.scoring.engagementScore = {
    score: Math.round(score),
    lastCalculated: new Date()
  };
};

clientContactSchema.methods.updateLifecycleMetrics = function() {
  if (!this.lifecycle.firstContactDate && this.interactions.length > 0) {
    this.lifecycle.firstContactDate = this.interactions[this.interactions.length - 1].date;
  }
  
  if (this.interactions.length > 0) {
    this.lifecycle.lastContactDate = this.interactions[0].date;
    this.lifecycle.totalInteractions = this.interactions.length;
  }
  
  // Calculate average response time
  const responses = this.interactions.filter(i => i.direction === 'inbound');
  if (responses.length > 1) {
    let totalTime = 0;
    let count = 0;
    for (let i = 1; i < responses.length; i++) {
      const timeDiff = responses[i - 1].date - responses[i].date;
      if (timeDiff > 0 && timeDiff < 7 * 24 * 60 * 60 * 1000) { // Within a week
        totalTime += timeDiff;
        count++;
      }
    }
    if (count > 0) {
      this.lifecycle.averageResponseTime = totalTime / count / (1000 * 60 * 60); // In hours
    }
  }
};

clientContactSchema.methods.assessDataQuality = function() {
  const requiredFields = [
    'personalInfo.firstName',
    'personalInfo.lastName',
    'professionalInfo.jobTitle',
    'contactDetails.emails',
    'contactDetails.phones'
  ];
  
  const missingFields = [];
  let filledFields = 0;
  
  requiredFields.forEach(field => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], this);
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      filledFields++;
    } else {
      missingFields.push(field);
    }
  });
  
  const completenessScore = (filledFields / requiredFields.length) * 100;
  
  this.dataQuality.completeness = {
    score: Math.round(completenessScore),
    missingFields,
    lastChecked: new Date()
  };
};

clientContactSchema.methods.recordInteraction = async function(interactionData, userId) {
  const interaction = {
    interactionId: `INT-${Date.now()}`,
    date: new Date(),
    type: interactionData.type,
    channel: interactionData.channel,
    direction: interactionData.direction,
    purpose: interactionData.purpose,
    subject: interactionData.subject,
    participants: interactionData.participants,
    duration: interactionData.duration,
    outcome: interactionData.outcome,
    notes: interactionData.notes,
    sentiment: interactionData.sentiment,
    followUpRequired: interactionData.followUpRequired,
    followUpDate: interactionData.followUpDate,
    recordedBy: userId,
    attachments: interactionData.attachments,
    tags: interactionData.tags
  };
  
  this.interactions.unshift(interaction);
  
  // Keep only last 500 interactions
  this.interactions = this.interactions.slice(0, 500);
  
  // Update last interaction
  this.relationship.lastInteraction = {
    date: interaction.date,
    type: interaction.type,
    channel: interaction.channel,
    by: userId,
    outcome: interaction.outcome,
    notes: interaction.notes
  };
  
  await this.save();
  return interaction;
};

clientContactSchema.methods.updateInfluence = async function(influenceData) {
  this.roleInfluence.influence = {
    level: influenceData.level,
    score: influenceData.score,
    notes: influenceData.notes
  };
  
  if (influenceData.decisionAuthority) {
    this.roleInfluence.decisionAuthority = influenceData.decisionAuthority;
  }
  
  if (influenceData.budgetAuthority) {
    this.roleInfluence.budgetAuthority = influenceData.budgetAuthority;
  }
  
  await this.save();
  
  logger.info('Contact influence updated', {
    contactId: this._id,
    clientId: this.clientId,
    influenceLevel: influenceData.level
  });
};

clientContactSchema.methods.markAsLeft = async function(replacementContactId, reason) {
  this.relationship.status = 'left_company';
  this.relationship.endDate = new Date();
  
  if (replacementContactId) {
    this.relationship.replacedBy = {
      contactId: replacementContactId,
      date: new Date(),
      reason
    };
  }
  
  // Transfer primary contact status if applicable
  if (this.roleInfluence.isPrimaryContact && replacementContactId) {
    this.roleInfluence.isPrimaryContact = false;
    const replacement = await this.constructor.findById(replacementContactId);
    if (replacement) {
      replacement.roleInfluence.isPrimaryContact = true;
      await replacement.save();
    }
  }
  
  await this.save();
  
  logger.info('Contact marked as left company', {
    contactId: this._id,
    clientId: this.clientId,
    replacedBy: replacementContactId
  });
};

clientContactSchema.methods.addNote = async function(noteData, userId) {
  const note = {
    content: noteData.content,
    type: noteData.type || 'general',
    visibility: noteData.visibility || 'team',
    importance: noteData.importance || 'medium',
    createdBy: userId,
    createdAt: new Date(),
    tags: noteData.tags,
    mentions: noteData.mentions,
    expiresAt: noteData.expiresAt
  };
  
  if (!this.notes) this.notes = [];
  this.notes.unshift(note);
  
  // Keep only last 100 notes
  this.notes = this.notes.slice(0, 100);
  
  await this.save();
  return note;
};

clientContactSchema.methods.updateSubscriptions = async function(subscriptions) {
  Object.keys(subscriptions).forEach(key => {
    if (this.communicationPreferences.subscriptions[key] !== undefined) {
      this.communicationPreferences.subscriptions[key] = subscriptions[key];
    }
  });
  
  if (Object.values(subscriptions).every(v => v === false)) {
    this.compliance.marketing.optIn = false;
    this.compliance.marketing.optOutDate = new Date();
  }
  
  await this.save();
  
  logger.info('Contact subscriptions updated', {
    contactId: this._id,
    subscriptions
  });
};

// ==================== Static Methods ====================
clientContactSchema.statics.generateContactId = async function(tenantId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = stringHelper.generateRandomString(4).toUpperCase();
  return `CONT-${timestamp}-${random}`;
};

clientContactSchema.statics.findByClient = async function(clientId, options = {}) {
  const {
    status = 'active',
    isPrimary,
    includeInactive = false,
    limit = 100,
    skip = 0,
    sort = { 'personalInfo.lastName': 1, 'personalInfo.firstName': 1 }
  } = options;
  
  const query = {
    clientId,
    isDeleted: false
  };
  
  if (!includeInactive) {
    query['relationship.status'] = status;
  }
  
  if (isPrimary !== undefined) {
    query['roleInfluence.isPrimaryContact'] = isPrimary;
  }
  
  const [contacts, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    contacts,
    total,
    hasMore: total > skip + contacts.length
  };
};

clientContactSchema.statics.searchContacts = async function(tenantId, searchQuery, options = {}) {
  const {
    clientId,
    filters = {},
    limit = 20,
    skip = 0,
    sort = { 'scoring.engagementScore.score': -1 }
  } = options;
  
  const query = {
    tenantId,
    isDeleted: false,
    $or: [
      { 'personalInfo.firstName': new RegExp(searchQuery, 'i') },
      { 'personalInfo.lastName': new RegExp(searchQuery, 'i') },
      { 'personalInfo.nickname': new RegExp(searchQuery, 'i') },
      { 'contactDetails.emails.address': new RegExp(searchQuery, 'i') },
      { 'professionalInfo.jobTitle': new RegExp(searchQuery, 'i') },
      { searchTokens: new RegExp(searchQuery, 'i') }
    ]
  };
  
  if (clientId) {
    query.clientId = clientId;
  }
  
  // Apply filters
  Object.keys(filters).forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null) {
      query[key] = filters[key];
    }
  });
  
  const [contacts, total] = await Promise.all([
    this.find(query)
      .populate('clientId', 'companyName clientCode')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog -personalInfo.dateOfBirth'),
    this.countDocuments(query)
  ]);
  
  return {
    contacts,
    total,
    hasMore: total > skip + contacts.length
  };
};

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 */
module.exports = {
    schema: clientContactSchema,
    modelName: 'ClientContact',

    // Legacy export for backward compatibility
    // This will be used if imported directly in environments without ConnectionManager
    createModel: function (connection) {
        if (connection) {
            return connection.model('ClientContact', clientContactSchema)
        } else {
            // Fallback to default mongoose connection
            return mongoose.model('ClientContact', clientContactSchema)
        }
    }
}

// For backward compatibility, also exports as direct model
module.exports.ClientContact = mongoose.model('ClientContact', clientContactSchema);
module.exports.clientContactSchema = clientContactSchema;