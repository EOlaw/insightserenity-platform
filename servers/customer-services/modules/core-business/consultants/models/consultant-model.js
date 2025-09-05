'use strict';

/**
 * @fileoverview Enhanced consultant model with comprehensive professional services and enterprise features
 * @module servers/customer-services/modules/core-business/consultants/models/consultant-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');
const EncryptionService = require('../../../../../../shared/lib/security/encryption/encryption-service');

/**
 * Enhanced consultant schema definition for enterprise professional services management
 */
const consultantSchemaDefinition = {
  // ==================== Core Identity ====================
  consultantCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^CON-[A-Z0-9]{6}$/,
    index: true,
    immutable: true
  },

  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  // ==================== Personal Information ====================
  personalInfo: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    lastName: {
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
    preferredName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    title: {
      type: String,
      enum: ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Eng']
    },
    dateOfBirth: {
      type: Date,
      select: false
    },
    nationalId: {
      type: String,
      select: false
    },
    passportNumber: {
      type: String,
      select: false
    },
    nationality: String,
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['native', 'fluent', 'professional', 'conversational', 'basic']
      },
      certified: Boolean,
      certificationDetails: String
    }],
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
      email: String,
      address: String
    }
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

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // ==================== Contact Information ====================
  contact: {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: {
        validator: CommonValidator.isEmail,
        message: 'Invalid email address'
      },
      index: true
    },
    secondaryEmail: {
      type: String,
      validate: {
        validator: CommonValidator.isEmail,
        message: 'Invalid secondary email address'
      }
    },
    phone: {
      primary: {
        type: String,
        required: true
      },
      mobile: String,
      business: String,
      extension: String
    },
    address: {
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
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'mobile', 'teams', 'slack', 'in_person'],
      default: 'email'
    },
    availability: {
      workingHours: {
        start: String,
        end: String,
        timezone: String
      },
      preferredMeetingTimes: [String],
      blackoutDates: [{
        start: Date,
        end: Date,
        reason: String
      }]
    }
  },

  // ==================== Professional Profile ====================
  profile: {
    type: {
      type: String,
      enum: ['internal', 'external', 'contractor', 'partner', 'freelance'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'terminated', 'retired', 'suspended'],
      default: 'active',
      index: true
    },
    level: {
      type: String,
      enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner'],
      required: true,
      index: true
    },
    department: {
      type: String,
      enum: ['consulting', 'technology', 'strategy', 'operations', 'finance', 'hr', 'marketing', 'sales']
    },
    practiceArea: {
      primary: String,
      secondary: [String]
    },
    jobTitle: {
      type: String,
      required: true
    },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'contract', 'temporary', 'project_based'],
      default: 'full_time'
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: Date,
    yearsOfExperience: {
      type: Number,
      min: 0,
      required: true
    },
    bio: {
      short: {
        type: String,
        maxlength: 500
      },
      detailed: {
        type: String,
        maxlength: 5000
      }
    },
    achievements: [{
      title: String,
      description: String,
      date: Date,
      category: {
        type: String,
        enum: ['award', 'certification', 'publication', 'patent', 'recognition', 'other']
      },
      issuer: String,
      documentUrl: String
    }],
    publications: [{
      title: String,
      type: {
        type: String,
        enum: ['article', 'whitepaper', 'book', 'research', 'case_study', 'blog']
      },
      publisher: String,
      date: Date,
      url: String,
      coAuthors: [String]
    }]
  },

  // ==================== Skills & Expertise ====================
  skills: {
    technical: [{
      skillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConsultantSkill'
      },
      name: {
        type: String,
        required: true
      },
      category: String,
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        required: true
      },
      yearsOfExperience: Number,
      lastUsed: Date,
      verified: {
        type: Boolean,
        default: false
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date,
      endorsements: [{
        endorsedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        endorsedAt: Date,
        comment: String
      }]
    }],
    industry: [{
      name: String,
      yearsOfExperience: Number,
      level: {
        type: String,
        enum: ['familiar', 'experienced', 'expert']
      },
      clients: [String],
      projects: Number
    }],
    functional: [{
      area: String,
      expertise: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'expert']
      },
      certifications: [String]
    }],
    tools: [{
      name: String,
      category: String,
      proficiency: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'expert']
      },
      certified: Boolean,
      lastUsed: Date
    }],
    methodologies: [{
      name: String,
      type: {
        type: String,
        enum: ['agile', 'waterfall', 'lean', 'six_sigma', 'design_thinking', 'other']
      },
      certified: Boolean,
      practitionerLevel: String
    }]
  },

  // ==================== Certifications & Education ====================
  certifications: [{
    certificationId: String,
    name: {
      type: String,
      required: true
    },
    issuingBody: {
      type: String,
      required: true
    },
    certificationNumber: String,
    issueDate: {
      type: Date,
      required: true
    },
    expiryDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'revoked'],
      default: 'active'
    },
    verificationUrl: String,
    documentUrl: String,
    cost: {
      amount: Number,
      currency: String,
      reimbursed: Boolean
    },
    renewalRequired: Boolean,
    renewalDate: Date,
    cpdHours: Number
  }],

  education: [{
    degree: {
      type: String,
      required: true
    },
    field: {
      type: String,
      required: true
    },
    institution: {
      type: String,
      required: true
    },
    location: String,
    graduationDate: Date,
    gpa: Number,
    honors: [String],
    relevantCoursework: [String],
    thesis: String
  }],

  training: [{
    courseName: String,
    provider: String,
    completionDate: Date,
    duration: {
      value: Number,
      unit: {
        type: String,
        enum: ['hours', 'days', 'weeks', 'months']
      }
    },
    type: {
      type: String,
      enum: ['online', 'classroom', 'workshop', 'conference', 'self_study']
    },
    certificateUrl: String,
    skills: [String]
  }],

  // ==================== Billing & Rates ====================
  billing: {
    standardRate: {
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      currency: {
        type: String,
        default: 'USD'
      },
      unit: {
        type: String,
        enum: ['hour', 'day', 'week', 'month', 'project'],
        default: 'hour'
      }
    },
    clientRates: [{
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      rate: Number,
      currency: String,
      unit: String,
      effectiveFrom: Date,
      effectiveTo: Date,
      negotiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    projectRates: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      rate: Number,
      currency: String,
      unit: String,
      discount: Number,
      reason: String
    }],
    overtimeRate: {
      multiplier: {
        type: Number,
        default: 1.5
      },
      threshold: {
        type: Number,
        default: 40
      },
      unit: {
        type: String,
        enum: ['hours_per_week', 'hours_per_day'],
        default: 'hours_per_week'
      }
    },
    expensePolicy: {
      allowedExpenses: [{
        type: String,
        enum: ['travel', 'accommodation', 'meals', 'equipment', 'training', 'other']
      }],
      requiresApproval: Boolean,
      approvalThreshold: Number,
      reimbursementMethod: {
        type: String,
        enum: ['direct_deposit', 'check', 'expense_card', 'petty_cash']
      }
    },
    invoicing: {
      frequency: {
        type: String,
        enum: ['weekly', 'bi_weekly', 'monthly', 'project_completion'],
        default: 'monthly'
      },
      paymentTerms: {
        type: String,
        enum: ['net15', 'net30', 'net45', 'net60', 'immediate'],
        default: 'net30'
      },
      preferredMethod: {
        type: String,
        enum: ['ach', 'wire', 'check', 'paypal', 'crypto']
      }
    },
    bankDetails: {
      accountName: {
        type: String,
        select: false
      },
      accountNumber: {
        type: String,
        select: false
      },
      routingNumber: {
        type: String,
        select: false
      },
      bankName: String,
      swiftCode: String,
      iban: {
        type: String,
        select: false
      },
      taxId: {
        type: String,
        select: false
      }
    },
    costCenter: String,
    profitCenter: String,
    budgetCode: String
  },

  // ==================== Availability & Schedule ====================
  availability: {
    status: {
      type: String,
      enum: ['available', 'partially_available', 'busy', 'on_project', 'on_leave', 'unavailable'],
      default: 'available',
      index: true
    },
    currentUtilization: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    targetUtilization: {
      type: Number,
      min: 0,
      max: 100,
      default: 80
    },
    nextAvailableDate: Date,
    capacity: {
      hoursPerWeek: {
        type: Number,
        default: 40
      },
      daysPerWeek: {
        type: Number,
        default: 5
      },
      maxProjects: {
        type: Number,
        default: 3
      }
    },
    workLocation: {
      type: {
        type: String,
        enum: ['office', 'remote', 'hybrid', 'client_site', 'flexible'],
        default: 'office'
      },
      officeLocation: String,
      remoteSetup: {
        hasHomeOffice: Boolean,
        hasReliableInternet: Boolean,
        equipmentProvided: Boolean
      },
      travelWillingness: {
        type: String,
        enum: ['none', 'local', 'regional', 'national', 'international'],
        default: 'regional'
      },
      travelPercentage: {
        type: Number,
        min: 0,
        max: 100
      }
    },
    calendar: [{
      date: Date,
      type: {
        type: String,
        enum: ['working', 'holiday', 'leave', 'training', 'blocked']
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      hours: Number,
      notes: String
    }],
    plannedAbsences: [{
      startDate: Date,
      endDate: Date,
      type: {
        type: String,
        enum: ['vacation', 'sick', 'personal', 'training', 'conference', 'other']
      },
      status: {
        type: String,
        enum: ['planned', 'approved', 'rejected', 'cancelled'],
        default: 'planned'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notes: String
    }],
    recurringCommitments: [{
      dayOfWeek: {
        type: Number,
        min: 0,
        max: 6
      },
      startTime: String,
      endTime: String,
      type: String,
      description: String
    }]
  },

  // ==================== Engagements & Projects ====================
  engagements: {
    current: [{
      engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engagement'
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      role: String,
      allocation: {
        type: Number,
        min: 0,
        max: 100
      },
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['assigned', 'active', 'on_hold', 'completing', 'completed']
      },
      billable: {
        type: Boolean,
        default: true
      }
    }],
    history: [{
      engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engagement'
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      role: String,
      startDate: Date,
      endDate: Date,
      duration: Number,
      outcome: {
        type: String,
        enum: ['successful', 'partially_successful', 'unsuccessful', 'cancelled']
      },
      clientFeedback: {
        rating: {
          type: Number,
          min: 1,
          max: 5
        },
        comment: String,
        wouldRecommend: Boolean
      },
      deliverables: [String],
      technologies: [String],
      teamSize: Number,
      budget: Number,
      actualCost: Number
    }],
    preferences: {
      industries: [String],
      projectTypes: [String],
      technologies: [String],
      teamSize: {
        min: Number,
        max: Number
      },
      duration: {
        min: Number,
        max: Number,
        unit: String
      },
      clientTypes: [{
        type: String,
        enum: ['startup', 'smb', 'enterprise', 'government', 'non_profit']
      }]
    },
    blacklist: [{
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      reason: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }]
  },

  // ==================== Performance & Reviews ====================
  performance: {
    currentRating: {
      type: Number,
      min: 1,
      max: 5
    },
    lastReviewDate: Date,
    nextReviewDate: Date,
    reviews: [{
      reviewId: String,
      period: {
        start: Date,
        end: Date
      },
      type: {
        type: String,
        enum: ['annual', 'mid_year', 'project', 'probation', '360']
      },
      overallRating: {
        type: Number,
        min: 1,
        max: 5
      },
      ratings: {
        technical: Number,
        communication: Number,
        leadership: Number,
        teamwork: Number,
        innovation: Number,
        clientSatisfaction: Number
      },
      strengths: [String],
      improvements: [String],
      goals: [{
        description: String,
        targetDate: Date,
        status: {
          type: String,
          enum: ['not_started', 'in_progress', 'completed', 'cancelled']
        }
      }],
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      acknowledgedAt: Date,
      comments: String
    }],
    kpis: {
      billableHours: {
        target: Number,
        actual: Number,
        period: String
      },
      utilizationRate: {
        target: Number,
        actual: Number
      },
      clientSatisfaction: {
        score: Number,
        responses: Number
      },
      projectSuccessRate: Number,
      revenueGenerated: Number,
      leadsConverted: Number,
      knowledgeSharing: {
        articles: Number,
        presentations: Number,
        mentoringSessions: Number
      }
    },
    recognition: [{
      type: {
        type: String,
        enum: ['employee_of_month', 'spot_award', 'excellence', 'innovation', 'teamwork', 'client_appreciation']
      },
      title: String,
      description: String,
      awardedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      awardedAt: Date,
      monetary: {
        amount: Number,
        currency: String
      },
      public: {
        type: Boolean,
        default: true
      }
    }],
    improvements: [{
      area: String,
      plan: String,
      targetDate: Date,
      status: {
        type: String,
        enum: ['identified', 'in_progress', 'completed', 'abandoned']
      },
      progress: Number,
      supportRequired: String
    }]
  },

  // ==================== Timesheets & Tracking ====================
  timeTracking: {
    currentPeriod: {
      start: Date,
      end: Date,
      totalHours: {
        type: Number,
        default: 0
      },
      billableHours: {
        type: Number,
        default: 0
      },
      nonBillableHours: {
        type: Number,
        default: 0
      },
      overtimeHours: {
        type: Number,
        default: 0
      }
    },
    timesheets: [{
      timesheetId: String,
      period: {
        start: Date,
        end: Date
      },
      entries: [{
        date: Date,
        projectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project'
        },
        taskId: String,
        hours: Number,
        billable: Boolean,
        description: String,
        approvalStatus: {
          type: String,
          enum: ['draft', 'submitted', 'approved', 'rejected', 'invoiced']
        }
      }],
      totalHours: Number,
      billableHours: Number,
      submittedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      invoiceId: String
    }],
    defaultAllocation: {
      administration: {
        type: Number,
        default: 10
      },
      training: {
        type: Number,
        default: 10
      },
      businessDevelopment: {
        type: Number,
        default: 5
      }
    }
  },

  // ==================== Compensation & Benefits ====================
  compensation: {
    salary: {
      base: {
        type: Number,
        select: false
      },
      currency: {
        type: String,
        default: 'USD'
      },
      frequency: {
        type: String,
        enum: ['hourly', 'weekly', 'bi_weekly', 'monthly', 'annual']
      },
      effectiveDate: Date,
      nextReviewDate: Date
    },
    bonus: {
      target: {
        type: Number,
        select: false
      },
      targetPercentage: Number,
      lastPaid: {
        amount: Number,
        date: Date,
        period: String
      },
      eligibility: {
        type: Boolean,
        default: true
      }
    },
    equity: {
      shares: Number,
      options: Number,
      vestingSchedule: [{
        date: Date,
        amount: Number,
        vested: Boolean
      }],
      strikePrice: Number,
      grantDate: Date
    },
    benefits: {
      healthInsurance: {
        enrolled: Boolean,
        plan: String,
        dependents: Number
      },
      retirement: {
        enrolled: Boolean,
        plan: String,
        contribution: Number,
        employerMatch: Number
      },
      pto: {
        annual: Number,
        used: Number,
        remaining: Number,
        carryOver: Number
      },
      other: [{
        type: String,
        value: String,
        enrolled: Boolean
      }]
    },
    expenses: [{
      expenseId: String,
      date: Date,
      category: String,
      amount: Number,
      currency: String,
      description: String,
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'reimbursed']
      },
      receipt: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reimbursedAt: Date
    }]
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    lifetime: {
      totalProjects: {
        type: Number,
        default: 0
      },
      totalClients: {
        type: Number,
        default: 0
      },
      totalHours: {
        type: Number,
        default: 0
      },
      billableHours: {
        type: Number,
        default: 0
      },
      revenueGenerated: {
        type: Number,
        default: 0
      },
      averageRating: Number,
      projectsCompleted: {
        type: Number,
        default: 0
      },
      repeatClients: {
        type: Number,
        default: 0
      }
    },
    current: {
      activeProjects: {
        type: Number,
        default: 0
      },
      utilization: Number,
      monthlyBillableHours: Number,
      quarterlyRevenue: Number,
      yearToDateRevenue: Number,
      pendingTimesheets: Number,
      upcomingDeadlines: Number
    },
    efficiency: {
      averageProjectDuration: Number,
      onTimeDeliveryRate: Number,
      budgetAdherenceRate: Number,
      reworkRate: Number,
      firstTimeRightRate: Number
    },
    growth: {
      skillsAcquired: Number,
      certificationsEarned: Number,
      promotions: Number,
      salaryGrowth: Number,
      responsibilityIncrease: String
    }
  },

  // ==================== Compliance & Documentation ====================
  compliance: {
    backgroundCheck: {
      completed: Boolean,
      date: Date,
      result: {
        type: String,
        enum: ['clear', 'conditional', 'failed']
      },
      expiryDate: Date,
      provider: String
    },
    drugTest: {
      completed: Boolean,
      date: Date,
      result: {
        type: String,
        enum: ['negative', 'positive', 'inconclusive']
      },
      nextTestDate: Date
    },
    clearances: [{
      type: {
        type: String,
        enum: ['security', 'financial', 'criminal', 'reference', 'credit']
      },
      level: String,
      issueDate: Date,
      expiryDate: Date,
      status: {
        type: String,
        enum: ['active', 'expired', 'revoked', 'pending']
      },
      documentNumber: String
    }],
    agreements: [{
      type: {
        type: String,
        enum: ['employment', 'nda', 'non_compete', 'ip_assignment', 'code_of_conduct']
      },
      signedDate: Date,
      expiryDate: Date,
      documentUrl: String,
      status: {
        type: String,
        enum: ['active', 'expired', 'terminated']
      }
    }],
    trainingsCompleted: [{
      name: String,
      type: {
        type: String,
        enum: ['compliance', 'safety', 'technical', 'soft_skills', 'leadership']
      },
      completedDate: Date,
      expiryDate: Date,
      certificateNumber: String,
      score: Number,
      required: Boolean
    }],
    licenses: [{
      type: String,
      number: String,
      issuingAuthority: String,
      issueDate: Date,
      expiryDate: Date,
      state: String,
      status: {
        type: String,
        enum: ['active', 'expired', 'suspended', 'revoked']
      }
    }]
  },

  // ==================== Notes & Custom Fields ====================
  notes: [{
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['general', 'performance', 'project', 'hr', 'confidential']
    },
    visibility: {
      type: String,
      enum: ['public', 'managers', 'hr', 'private'],
      default: 'managers'
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
    attachments: [String]
  }],

  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // ==================== Social & Professional Networks ====================
  socialProfiles: {
    linkedin: {
      url: String,
      connections: Number,
      verified: Boolean
    },
    github: {
      username: String,
      repositories: Number,
      contributions: Number
    },
    stackoverflow: {
      username: String,
      reputation: Number
    },
    personalWebsite: String,
    blog: String,
    twitter: String
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'integration', 'migration']
    },
    importedAt: Date,
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastSyncedAt: Date,
    tags: [String],
    flags: {
      isKeyResource: {
        type: Boolean,
        default: false
      },
      isExpert: {
        type: Boolean,
        default: false
      },
      requiresAttention: {
        type: Boolean,
        default: false
      },
      isRestricted: {
        type: Boolean,
        default: false
      }
    },
    version: {
      type: Number,
      default: 1
    }
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

// Create schema
const consultantSchema = BaseModel.createSchema(consultantSchemaDefinition, {
  collection: 'consultants',
  timestamps: true
});

// ==================== Indexes ====================
consultantSchema.index({ tenantId: 1, consultantCode: 1 }, { unique: true });
consultantSchema.index({ tenantId: 1, 'contact.email': 1 }, { unique: true });
consultantSchema.index({ tenantId: 1, 'profile.status': 1 });
consultantSchema.index({ tenantId: 1, 'profile.level': 1 });
consultantSchema.index({ tenantId: 1, 'availability.status': 1 });
consultantSchema.index({ tenantId: 1, 'skills.technical.name': 1 });
consultantSchema.index({ tenantId: 1, 'billing.standardRate.amount': 1 });
consultantSchema.index({ tenantId: 1, createdAt: -1 });
consultantSchema.index({ tenantId: 1, isDeleted: 1 });
consultantSchema.index({ tenantId: 1, searchTokens: 1 });

// Text search index
consultantSchema.index({
  'personalInfo.firstName': 'text',
  'personalInfo.lastName': 'text',
  'profile.bio.detailed': 'text',
  'skills.technical.name': 'text'
});

// ==================== Virtual Fields ====================
consultantSchema.virtual('fullName').get(function() {
  const first = this.personalInfo.firstName;
  const last = this.personalInfo.lastName;
  const preferred = this.personalInfo.preferredName;
  
  if (preferred) return preferred;
  return `${first} ${last}`.trim();
});

consultantSchema.virtual('displayName').get(function() {
  const title = this.personalInfo.title;
  const name = this.fullName;
  return title ? `${title} ${name}` : name;
});

consultantSchema.virtual('isAvailable').get(function() {
  return this.availability.status === 'available' && 
         this.availability.currentUtilization < 100 &&
         this.profile.status === 'active';
});

consultantSchema.virtual('yearsWithCompany').get(function() {
  if (!this.profile.startDate) return 0;
  const years = (Date.now() - this.profile.startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  return Math.floor(years);
});

consultantSchema.virtual('utilizationRate').get(function() {
  return this.availability.currentUtilization || 0;
});

// ==================== Pre-save Middleware ====================
consultantSchema.pre('save', async function(next) {
  try {
    // Generate consultant code if not provided
    if (!this.consultantCode && this.isNew) {
      this.consultantCode = await this.constructor.generateConsultantCode();
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate current utilization
    if (this.isModified('engagements.current')) {
      this.calculateUtilization();
    }

    // Update analytics
    if (this.isModified('engagements') || this.isModified('timeTracking')) {
      this.updateAnalytics();
    }

    // Encrypt sensitive data
    if (this.isModified('personalInfo.nationalId') && this.personalInfo.nationalId) {
      this.personalInfo.nationalId = await EncryptionService.encrypt(this.personalInfo.nationalId);
    }

    if (this.isModified('billing.bankDetails.accountNumber') && this.billing.bankDetails.accountNumber) {
      this.billing.bankDetails.accountNumber = await EncryptionService.encrypt(this.billing.bankDetails.accountNumber);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
consultantSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add name tokens
  if (this.personalInfo.firstName) {
    this.personalInfo.firstName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  if (this.personalInfo.lastName) {
    this.personalInfo.lastName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add consultant code
  if (this.consultantCode) {
    tokens.add(this.consultantCode.toLowerCase());
  }
  
  // Add email
  if (this.contact.email) {
    const emailParts = this.contact.email.split('@')[0].split(/[._-]/);
    emailParts.forEach(part => tokens.add(part.toLowerCase()));
  }
  
  // Add skills
  if (this.skills.technical) {
    this.skills.technical.forEach(skill => {
      skill.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    });
  }
  
  this.searchTokens = Array.from(tokens);
};

consultantSchema.methods.calculateUtilization = function() {
  let totalAllocation = 0;
  
  if (this.engagements.current && this.engagements.current.length > 0) {
    totalAllocation = this.engagements.current
      .filter(e => e.status === 'active')
      .reduce((sum, e) => sum + (e.allocation || 0), 0);
  }
  
  this.availability.currentUtilization = Math.min(100, totalAllocation);
  
  // Update availability status based on utilization
  if (totalAllocation >= 100) {
    this.availability.status = 'busy';
  } else if (totalAllocation >= 50) {
    this.availability.status = 'partially_available';
  } else if (totalAllocation > 0) {
    this.availability.status = 'on_project';
  } else {
    this.availability.status = 'available';
  }
};

consultantSchema.methods.updateAnalytics = function() {
  // Update lifetime analytics
  this.analytics.lifetime.totalProjects = this.engagements.history.length;
  this.analytics.lifetime.totalClients = new Set(
    this.engagements.history.map(e => e.clientId?.toString()).filter(Boolean)
  ).size;
  
  // Update current analytics
  this.analytics.current.activeProjects = this.engagements.current.filter(
    e => e.status === 'active'
  ).length;
  
  // Calculate average rating from reviews
  if (this.performance.reviews && this.performance.reviews.length > 0) {
    const ratings = this.performance.reviews.map(r => r.overallRating).filter(r => r > 0);
    if (ratings.length > 0) {
      this.analytics.lifetime.averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }
  }
};

consultantSchema.methods.assignToProject = async function(projectData) {
  const engagement = {
    engagementId: projectData.engagementId,
    projectId: projectData.projectId,
    clientId: projectData.clientId,
    role: projectData.role,
    allocation: projectData.allocation,
    startDate: projectData.startDate || new Date(),
    endDate: projectData.endDate,
    status: 'assigned',
    billable: projectData.billable !== false
  };
  
  // Check if allocation exceeds capacity
  const newUtilization = this.availability.currentUtilization + engagement.allocation;
  if (newUtilization > 100) {
    throw new AppError(`Cannot assign consultant. Allocation would exceed 100% (current: ${this.availability.currentUtilization}%, requested: ${engagement.allocation}%)`, 400);
  }
  
  this.engagements.current.push(engagement);
  this.calculateUtilization();
  
  await this.save();
  return engagement;
};

consultantSchema.methods.completeEngagement = async function(engagementId, outcome) {
  const engagementIndex = this.engagements.current.findIndex(
    e => e.engagementId?.toString() === engagementId.toString()
  );
  
  if (engagementIndex === -1) {
    throw new AppError('Engagement not found', 404);
  }
  
  const engagement = this.engagements.current[engagementIndex];
  
  // Move to history
  const historicalEngagement = {
    ...engagement.toObject(),
    endDate: outcome.endDate || new Date(),
    duration: Math.ceil((new Date() - engagement.startDate) / (1000 * 60 * 60 * 24)),
    outcome: outcome.status || 'successful',
    clientFeedback: outcome.feedback,
    deliverables: outcome.deliverables,
    technologies: outcome.technologies,
    teamSize: outcome.teamSize,
    budget: outcome.budget,
    actualCost: outcome.actualCost
  };
  
  this.engagements.history.push(historicalEngagement);
  this.engagements.current.splice(engagementIndex, 1);
  
  // Update analytics
  this.analytics.lifetime.projectsCompleted += 1;
  if (outcome.revenue) {
    this.analytics.lifetime.revenueGenerated += outcome.revenue;
  }
  
  this.calculateUtilization();
  
  await this.save();
  return historicalEngagement;
};

consultantSchema.methods.updateSkill = async function(skillData, verifiedBy) {
  const existingSkillIndex = this.skills.technical.findIndex(
    s => s.name.toLowerCase() === skillData.name.toLowerCase()
  );
  
  if (existingSkillIndex >= 0) {
    // Update existing skill
    Object.assign(this.skills.technical[existingSkillIndex], {
      level: skillData.level,
      yearsOfExperience: skillData.yearsOfExperience,
      lastUsed: skillData.lastUsed || new Date(),
      verified: verifiedBy ? true : this.skills.technical[existingSkillIndex].verified,
      verifiedBy: verifiedBy || this.skills.technical[existingSkillIndex].verifiedBy,
      verifiedAt: verifiedBy ? new Date() : this.skills.technical[existingSkillIndex].verifiedAt
    });
  } else {
    // Add new skill
    this.skills.technical.push({
      name: skillData.name,
      category: skillData.category,
      level: skillData.level,
      yearsOfExperience: skillData.yearsOfExperience,
      lastUsed: skillData.lastUsed || new Date(),
      verified: !!verifiedBy,
      verifiedBy: verifiedBy,
      verifiedAt: verifiedBy ? new Date() : undefined
    });
  }
  
  await this.save();
  return this.skills.technical[existingSkillIndex >= 0 ? existingSkillIndex : this.skills.technical.length - 1];
};

consultantSchema.methods.submitTimesheet = async function(timesheetData) {
  const timesheet = {
    timesheetId: mongoose.Types.ObjectId().toString(),
    period: timesheetData.period,
    entries: timesheetData.entries,
    totalHours: timesheetData.entries.reduce((sum, e) => sum + e.hours, 0),
    billableHours: timesheetData.entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0),
    submittedAt: new Date(),
    approvalStatus: 'submitted'
  };
  
  this.timeTracking.timesheets.push(timesheet);
  
  // Update current period tracking
  const currentPeriodStart = new Date(timesheet.period.start);
  const currentPeriodEnd = new Date(timesheet.period.end);
  const now = new Date();
  
  if (now >= currentPeriodStart && now <= currentPeriodEnd) {
    this.timeTracking.currentPeriod.totalHours += timesheet.totalHours;
    this.timeTracking.currentPeriod.billableHours += timesheet.billableHours;
    this.timeTracking.currentPeriod.nonBillableHours += (timesheet.totalHours - timesheet.billableHours);
  }
  
  // Update analytics
  this.analytics.lifetime.totalHours += timesheet.totalHours;
  this.analytics.lifetime.billableHours += timesheet.billableHours;
  
  await this.save();
  return timesheet;
};

consultantSchema.methods.calculateCompensation = function(period = 'annual') {
  const compensation = {
    base: 0,
    bonus: 0,
    overtime: 0,
    total: 0
  };
  
  // Calculate base salary for period
  if (this.compensation.salary.base) {
    const multipliers = {
      hourly: { annual: 2080, monthly: 173.33, weekly: 40 },
      weekly: { annual: 52, monthly: 4.33, weekly: 1 },
      bi_weekly: { annual: 26, monthly: 2.17, weekly: 0.5 },
      monthly: { annual: 12, monthly: 1, weekly: 0.23 },
      annual: { annual: 1, monthly: 0.083, weekly: 0.019 }
    };
    
    const frequency = this.compensation.salary.frequency;
    compensation.base = this.compensation.salary.base * multipliers[frequency][period];
  }
  
  // Calculate target bonus
  if (this.compensation.bonus.targetPercentage) {
    compensation.bonus = compensation.base * (this.compensation.bonus.targetPercentage / 100);
  }
  
  // Calculate overtime (simplified)
  if (this.billing.overtimeRate && this.timeTracking.currentPeriod.overtimeHours > 0) {
    const hourlyRate = compensation.base / 2080; // Assuming annual to hourly
    compensation.overtime = this.timeTracking.currentPeriod.overtimeHours * hourlyRate * this.billing.overtimeRate.multiplier;
  }
  
  compensation.total = compensation.base + compensation.bonus + compensation.overtime;
  
  return compensation;
};

consultantSchema.methods.addCertification = async function(certificationData) {
  const certification = {
    certificationId: mongoose.Types.ObjectId().toString(),
    name: certificationData.name,
    issuingBody: certificationData.issuingBody,
    certificationNumber: certificationData.certificationNumber,
    issueDate: certificationData.issueDate,
    expiryDate: certificationData.expiryDate,
    status: 'active',
    verificationUrl: certificationData.verificationUrl,
    documentUrl: certificationData.documentUrl,
    cost: certificationData.cost,
    renewalRequired: !!certificationData.expiryDate,
    renewalDate: certificationData.expiryDate,
    cpdHours: certificationData.cpdHours
  };
  
  this.certifications.push(certification);
  
  // Update analytics
  this.analytics.growth.certificationsEarned = (this.analytics.growth.certificationsEarned || 0) + 1;
  
  await this.save();
  return certification;
};

consultantSchema.methods.recordPerformanceReview = async function(reviewData) {
  const review = {
    reviewId: mongoose.Types.ObjectId().toString(),
    period: reviewData.period,
    type: reviewData.type,
    overallRating: reviewData.overallRating,
    ratings: reviewData.ratings,
    strengths: reviewData.strengths,
    improvements: reviewData.improvements,
    goals: reviewData.goals,
    reviewedBy: reviewData.reviewedBy,
    acknowledgedAt: reviewData.acknowledged ? new Date() : null,
    comments: reviewData.comments
  };
  
  this.performance.reviews.push(review);
  
  // Update current rating
  this.performance.currentRating = review.overallRating;
  this.performance.lastReviewDate = new Date();
  
  // Set next review date (6 months for mid-year, 12 months for annual)
  const monthsUntilNext = review.type === 'mid_year' ? 6 : 12;
  this.performance.nextReviewDate = new Date(Date.now() + (monthsUntilNext * 30 * 24 * 60 * 60 * 1000));
  
  await this.save();
  return review;
};

consultantSchema.methods.checkAvailability = function(startDate, endDate, requiredAllocation = 100) {
  // Check if consultant is active
  if (this.profile.status !== 'active') {
    return { available: false, reason: 'Consultant is not active' };
  }
  
  // Check current utilization
  const availableCapacity = 100 - this.availability.currentUtilization;
  if (availableCapacity < requiredAllocation) {
    return { 
      available: false, 
      reason: `Insufficient capacity. Available: ${availableCapacity}%, Required: ${requiredAllocation}%` 
    };
  }
  
  // Check for conflicts with planned absences
  const hasConflict = this.availability.plannedAbsences.some(absence => {
    return absence.status === 'approved' &&
           ((absence.startDate <= startDate && absence.endDate >= startDate) ||
            (absence.startDate <= endDate && absence.endDate >= endDate) ||
            (absence.startDate >= startDate && absence.endDate <= endDate));
  });
  
  if (hasConflict) {
    return { available: false, reason: 'Conflicts with planned absence' };
  }
  
  // Check for conflicts with existing engagements
  const engagementConflict = this.engagements.current.some(engagement => {
    if (engagement.status !== 'active' && engagement.status !== 'assigned') return false;
    
    return ((engagement.startDate <= startDate && engagement.endDate >= startDate) ||
            (engagement.startDate <= endDate && engagement.endDate >= endDate) ||
            (engagement.startDate >= startDate && engagement.endDate <= endDate)) &&
           (this.availability.currentUtilization + requiredAllocation > 100);
  });
  
  if (engagementConflict) {
    return { available: false, reason: 'Conflicts with existing engagements' };
  }
  
  return { available: true, availableCapacity };
};

// ==================== Static Methods ====================
consultantSchema.statics.generateConsultantCode = async function() {
  const prefix = 'CON';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    code = `${prefix}-${random}`;
    
    const existing = await this.findOne({ consultantCode: code });
    exists = !!existing;
  }
  
  return code;
};

consultantSchema.statics.findAvailableConsultants = async function(tenantId, requirements = {}) {
  const {
    skills = [],
    level,
    startDate,
    endDate,
    allocation = 100,
    location,
    maxRate,
    limit = 20
  } = requirements;
  
  const query = {
    tenantId,
    isDeleted: false,
    'profile.status': 'active',
    'availability.currentUtilization': { $lte: 100 - allocation }
  };
  
  if (skills.length > 0) {
    query['skills.technical.name'] = { $in: skills };
  }
  
  if (level) {
    query['profile.level'] = level;
  }
  
  if (location) {
    query['availability.workLocation.type'] = { $in: ['remote', 'flexible', location] };
  }
  
  if (maxRate) {
    query['billing.standardRate.amount'] = { $lte: maxRate };
  }
  
  const consultants = await this.find(query)
    .limit(limit)
    .sort({ 
      'availability.currentUtilization': 1,
      'performance.currentRating': -1,
      'analytics.lifetime.averageRating': -1
    })
    .select('-searchTokens -auditLog -compensation.salary -billing.bankDetails');
  
  // Further filter by date availability if provided
  if (startDate && endDate) {
    return consultants.filter(consultant => {
      const availability = consultant.checkAvailability(startDate, endDate, allocation);
      return availability.available;
    });
  }
  
  return consultants;
};

consultantSchema.statics.getUtilizationReport = async function(tenantId, period = {}) {
  const match = {
    tenantId,
    isDeleted: false,
    'profile.status': 'active'
  };
  
  const report = await this.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalConsultants: { $sum: 1 },
              avgUtilization: { $avg: '$availability.currentUtilization' },
              fullyUtilized: {
                $sum: { $cond: [{ $gte: ['$availability.currentUtilization', 100] }, 1, 0] }
              },
              underutilized: {
                $sum: { $cond: [{ $lt: ['$availability.currentUtilization', 50] }, 1, 0] }
              },
              available: {
                $sum: { $cond: [{ $eq: ['$availability.status', 'available'] }, 1, 0] }
              }
            }
          }
        ],
        byLevel: [
          {
            $group: {
              _id: '$profile.level',
              count: { $sum: 1 },
              avgUtilization: { $avg: '$availability.currentUtilization' }
            }
          },
          { $sort: { _id: 1 } }
        ],
        byDepartment: [
          {
            $group: {
              _id: '$profile.department',
              count: { $sum: 1 },
              avgUtilization: { $avg: '$availability.currentUtilization' }
            }
          },
          { $sort: { avgUtilization: -1 } }
        ],
        topPerformers: [
          { $sort: { 'performance.currentRating': -1 } },
          { $limit: 10 },
          {
            $project: {
              consultantCode: 1,
              name: { $concat: ['$personalInfo.firstName', ' ', '$personalInfo.lastName'] },
              rating: '$performance.currentRating',
              utilization: '$availability.currentUtilization'
            }
          }
        ]
      }
    }
  ]);
  
  return report[0];
};

// ==================== Create Model ====================
const ConsultantModel = BaseModel.createModel('Consultant', consultantSchema, {
  collection: 'consultants',
  enableTimestamps: true,
  enableAudit: true,
  enableSoftDelete: true
});

module.exports = ConsultantModel;