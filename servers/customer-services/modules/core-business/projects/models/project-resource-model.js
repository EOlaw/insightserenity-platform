'use strict';

/**
 * @fileoverview Enhanced project resource model with comprehensive allocation and utilization management
 * @module servers/customer-services/modules/core-business/projects/models/project-resource-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const dateHelper = require('../../../../../../shared/lib/utils/helpers/date-helper');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');

/**
 * Enhanced resource schema definition for enterprise project resource management
 */
const resourceSchemaDefinition = {
  // ==================== Core Identity ====================
  resourceCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^RES-[A-Z0-9]{8,}$/,
    index: true,
    immutable: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },

  description: {
    type: String,
    maxlength: 2000
  },

  // ==================== Multi-Tenancy & Ownership ====================
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

  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },

  // ==================== Resource Classification ====================
  classification: {
    type: {
      type: String,
      enum: ['human', 'equipment', 'material', 'facility', 'service', 'financial', 'information'],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['internal', 'external', 'contractor', 'vendor', 'partner', 'client_provided'],
      required: true
    },
    subCategory: String,
    skillLevel: {
      type: String,
      enum: ['entry', 'intermediate', 'senior', 'expert', 'specialist'],
      required: function() { return this.classification.type === 'human'; }
    },
    resourcePool: String,
    costCenter: String,
    department: String,
    location: {
      site: String,
      building: String,
      floor: String,
      room: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    tags: [String],
    customAttributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Human Resource Details ====================
  humanResource: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant',
      index: true
    },
    employeeId: String,
    profile: {
      firstName: String,
      lastName: String,
      email: {
        type: String,
        lowercase: true,
        index: true
      },
      phone: String,
      title: String,
      seniority: {
        type: String,
        enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'executive']
      }
    },
    skills: [{
      skillName: {
        type: String,
        required: true
      },
      category: String,
      proficiency: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'expert'],
        required: true
      },
      yearsExperience: Number,
      certifications: [{
        name: String,
        issuer: String,
        dateObtained: Date,
        expiryDate: Date,
        credentialId: String,
        verificationUrl: String
      }],
      lastUsed: Date,
      projects: Number,
      endorsed: {
        count: Number,
        endorsers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }]
      }
    }],
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['basic', 'conversational', 'professional', 'native']
      }
    }],
    clearance: {
      level: {
        type: String,
        enum: ['none', 'public_trust', 'confidential', 'secret', 'top_secret']
      },
      agency: String,
      expiryDate: Date,
      investigationDate: Date
    },
    workPreferences: {
      remote: Boolean,
      travel: {
        willing: Boolean,
        percentage: Number,
        restrictions: [String]
      },
      overtime: Boolean,
      weekends: Boolean,
      shifts: [String]
    }
  },

  // ==================== Equipment Resource Details ====================
  equipmentResource: {
    assetId: String,
    serialNumber: String,
    model: String,
    manufacturer: String,
    specifications: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    condition: {
      type: String,
      enum: ['new', 'excellent', 'good', 'fair', 'poor', 'maintenance_required']
    },
    maintenanceSchedule: {
      frequency: {
        value: Number,
        unit: {
          type: String,
          enum: ['hours', 'days', 'weeks', 'months', 'uses']
        }
      },
      lastMaintenance: Date,
      nextMaintenance: Date,
      maintenanceHistory: [{
        date: Date,
        type: String,
        description: String,
        cost: Number,
        technician: String,
        nextScheduled: Date
      }]
    },
    warranty: {
      active: Boolean,
      provider: String,
      expiryDate: Date,
      coverage: String,
      contactInfo: String
    },
    calibration: {
      required: Boolean,
      frequency: String,
      lastCalibration: Date,
      nextCalibration: Date,
      certificateNumber: String
    },
    operatorRequirements: {
      certification: String,
      training: String,
      experience: String
    }
  },

  // ==================== Material Resource Details ====================
  materialResource: {
    materialType: String,
    unit: {
      type: String,
      enum: ['piece', 'kg', 'lb', 'meter', 'feet', 'liter', 'gallon', 'box', 'pallet']
    },
    specifications: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    supplier: {
      name: String,
      contact: String,
      leadTime: {
        value: Number,
        unit: String
      }
    },
    storage: {
      location: String,
      conditions: String,
      shelfLife: {
        value: Number,
        unit: String
      },
      expiryDate: Date
    },
    qualityControl: {
      standards: [String],
      inspectionRequired: Boolean,
      batchTracking: Boolean,
      certificates: [{
        type: String,
        number: String,
        issuer: String,
        date: Date
      }]
    },
    hazardous: {
      isHazardous: Boolean,
      classification: String,
      handlingInstructions: String,
      msdsUrl: String
    }
  },

  // ==================== Availability & Calendar ====================
  availability: {
    status: {
      type: String,
      enum: ['available', 'partially_available', 'allocated', 'unavailable', 'maintenance', 'reserved'],
      default: 'available',
      index: true
    },
    calendar: {
      workingDays: {
        type: [String],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      workingHours: {
        start: String,
        end: String,
        timeZone: {
          type: String,
          default: 'UTC'
        }
      },
      holidays: [{
        date: Date,
        name: String,
        type: {
          type: String,
          enum: ['public', 'company', 'personal']
        }
      }],
      exceptions: [{
        date: Date,
        available: Boolean,
        hours: {
          start: String,
          end: String
        },
        reason: String
      }]
    },
    plannedAbsences: [{
      type: {
        type: String,
        enum: ['vacation', 'training', 'conference', 'sick', 'personal', 'other']
      },
      startDate: Date,
      endDate: Date,
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      coverage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectResource'
      },
      notes: String
    }],
    currentUtilization: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      hours: {
        allocated: Number,
        available: Number
      },
      lastUpdated: Date
    },
    futureCommitments: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      taskId: String,
      startDate: Date,
      endDate: Date,
      allocation: Number,
      confirmed: Boolean,
      priority: String
    }]
  },

  // ==================== Allocation & Assignment ====================
  allocation: {
    currentProject: {
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      projectCode: String,
      projectName: String
    },
    allocationPercentage: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
      index: true
    },
    allocationType: {
      type: String,
      enum: ['dedicated', 'shared', 'on_demand', 'backup', 'consultant'],
      required: true
    },
    startDate: {
      type: Date,
      required: true,
      index: true
    },
    endDate: {
      type: Date,
      required: true,
      index: true
    },
    actualStartDate: Date,
    actualEndDate: Date,
    role: {
      type: String,
      required: true
    },
    responsibilities: [String],
    deliverables: [{
      name: String,
      description: String,
      dueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'delayed']
      },
      completedDate: Date
    }],
    tasks: [{
      taskId: String,
      taskName: String,
      effort: {
        estimated: Number,
        actual: Number,
        remaining: Number
      },
      status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed', 'blocked']
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      dependencies: [String]
    }],
    workLocation: {
      type: {
        type: String,
        enum: ['onsite', 'remote', 'hybrid', 'client_site', 'field']
      },
      details: String,
      travelRequired: Boolean,
      travelPercentage: Number
    },
    reportingStructure: {
      reportsTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      functionalManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      dotted: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }
  },

  // ==================== Cost & Billing ====================
  financial: {
    costStructure: {
      type: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly', 'fixed', 'milestone', 'outcome'],
        required: true
      },
      rate: {
        standard: {
          type: Number,
          required: true
        },
        overtime: Number,
        weekend: Number,
        holiday: Number,
        currency: {
          type: String,
          default: 'USD'
        }
      },
      minimumCommitment: {
        value: Number,
        unit: {
          type: String,
          enum: ['hours', 'days', 'weeks', 'months']
        }
      },
      maximumBudget: Number
    },
    billing: {
      billable: {
        type: Boolean,
        default: true
      },
      billablePercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 100
      },
      clientRate: Number,
      markup: Number,
      discounts: [{
        type: {
          type: String,
          enum: ['volume', 'early_payment', 'loyalty', 'promotional']
        },
        percentage: Number,
        amount: Number,
        conditions: String,
        validUntil: Date
      }],
      invoiceFrequency: {
        type: String,
        enum: ['weekly', 'bi_weekly', 'monthly', 'quarterly', 'milestone', 'upon_completion']
      },
      paymentTerms: {
        type: String,
        default: 'Net 30'
      }
    },
    costs: {
      acquisition: Number,
      operational: Number,
      maintenance: Number,
      training: Number,
      overhead: Number,
      total: Number
    },
    budget: {
      allocated: Number,
      consumed: Number,
      committed: Number,
      remaining: Number,
      forecast: Number,
      variance: {
        amount: Number,
        percentage: Number
      }
    },
    profitability: {
      revenue: Number,
      cost: Number,
      margin: Number,
      marginPercentage: Number,
      utilization: Number,
      efficiency: Number
    }
  },

  // ==================== Time Tracking ====================
  timeTracking: {
    timesheets: [{
      week: Date,
      status: {
        type: String,
        enum: ['draft', 'submitted', 'approved', 'rejected', 'processed'],
        default: 'draft'
      },
      entries: [{
        date: Date,
        projectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project'
        },
        taskId: String,
        hours: {
          regular: Number,
          overtime: Number,
          total: Number
        },
        description: String,
        billable: Boolean,
        category: {
          type: String,
          enum: ['development', 'design', 'testing', 'documentation', 'meeting', 'training', 'support', 'admin']
        },
        location: String
      }],
      totalHours: {
        regular: Number,
        overtime: Number,
        billable: Number,
        nonBillable: Number,
        total: Number
      },
      submittedAt: Date,
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      comments: String,
      adjustments: [{
        date: Date,
        originalHours: Number,
        adjustedHours: Number,
        reason: String,
        adjustedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    }],
    summary: {
      totalHours: {
        thisWeek: Number,
        thisMonth: Number,
        thisQuarter: Number,
        thisYear: Number,
        allTime: Number
      },
      billableHours: {
        thisWeek: Number,
        thisMonth: Number,
        thisQuarter: Number,
        thisYear: Number,
        allTime: Number
      },
      utilization: {
        thisWeek: Number,
        thisMonth: Number,
        thisQuarter: Number,
        thisYear: Number,
        average: Number
      },
      overtime: {
        thisMonth: Number,
        thisQuarter: Number,
        thisYear: Number
      }
    },
    targets: {
      billableHours: {
        daily: Number,
        weekly: Number,
        monthly: Number,
        quarterly: Number,
        annual: Number
      },
      utilization: {
        minimum: Number,
        target: Number,
        stretch: Number
      }
    }
  },

  // ==================== Performance & Quality ====================
  performance: {
    ratings: [{
      period: {
        from: Date,
        to: Date
      },
      type: {
        type: String,
        enum: ['project', 'quarterly', 'annual', '360', 'peer', 'self']
      },
      overall: {
        score: {
          type: Number,
          min: 1,
          max: 5
        },
        rating: {
          type: String,
          enum: ['exceptional', 'exceeds', 'meets', 'improvement_needed', 'unsatisfactory']
        }
      },
      categories: [{
        name: String,
        score: Number,
        weight: Number,
        comments: String
      }],
      strengths: [String],
      improvements: [String],
      goals: [{
        goal: String,
        target: String,
        achieved: Boolean,
        notes: String
      }],
      feedback: {
        manager: String,
        peer: [String],
        self: String
      },
      evaluator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      evaluatedAt: Date,
      acknowledged: Boolean,
      acknowledgedAt: Date
    }],
    metrics: {
      productivity: {
        tasksCompleted: Number,
        onTimeDelivery: Number,
        reworkRate: Number,
        defectRate: Number
      },
      quality: {
        codeQuality: Number,
        documentationQuality: Number,
        clientSatisfaction: Number,
        peerReview: Number
      },
      collaboration: {
        teamworkScore: Number,
        communicationScore: Number,
        mentoring: Number,
        knowledgeSharing: Number
      },
      innovation: {
        improvementSuggestions: Number,
        implemented: Number,
        impact: String
      }
    },
    recognition: [{
      type: {
        type: String,
        enum: ['award', 'bonus', 'promotion', 'certification', 'commendation']
      },
      title: String,
      description: String,
      date: Date,
      issuer: String,
      monetary: {
        amount: Number,
        currency: String
      }
    }],
    development: {
      skills: [{
        skill: String,
        currentLevel: String,
        targetLevel: String,
        progress: Number,
        timeline: String
      }],
      training: [{
        course: String,
        provider: String,
        type: {
          type: String,
          enum: ['online', 'classroom', 'workshop', 'conference', 'certification']
        },
        startDate: Date,
        endDate: Date,
        status: {
          type: String,
          enum: ['planned', 'in_progress', 'completed', 'cancelled']
        },
        cost: Number,
        outcome: String,
        certificate: String
      }],
      mentoring: {
        mentor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        startDate: Date,
        endDate: Date,
        objectives: [String],
        progress: String
      },
      careerPath: {
        currentLevel: String,
        nextLevel: String,
        timeline: String,
        requirements: [String],
        progress: Number
      }
    }
  },

  // ==================== Capacity Planning ====================
  capacity: {
    standard: {
      hoursPerDay: {
        type: Number,
        default: 8
      },
      daysPerWeek: {
        type: Number,
        default: 5
      },
      productiveHours: {
        type: Number,
        default: 6.5
      }
    },
    currentLoad: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      taskId: String,
      allocation: Number,
      priority: String,
      startDate: Date,
      endDate: Date,
      effort: {
        estimated: Number,
        actual: Number,
        remaining: Number
      }
    }],
    forecast: [{
      period: {
        from: Date,
        to: Date
      },
      availableHours: Number,
      allocatedHours: Number,
      utilizationPercentage: Number,
      overallocated: Boolean,
      conflicts: [{
        date: Date,
        requested: Number,
        available: Number,
        projects: [String]
      }]
    }],
    constraints: [{
      type: {
        type: String,
        enum: ['skill', 'certification', 'location', 'clearance', 'availability', 'preference']
      },
      description: String,
      impact: String,
      workaround: String
    }],
    optimization: {
      suggestions: [{
        type: {
          type: String,
          enum: ['reallocation', 'training', 'hiring', 'automation', 'process']
        },
        description: String,
        impact: String,
        effort: String,
        priority: String
      }],
      lastAnalyzed: Date,
      nextReview: Date
    }
  },

  // ==================== Risk & Compliance ====================
  riskCompliance: {
    risks: [{
      type: {
        type: String,
        enum: ['availability', 'skill_gap', 'performance', 'retention', 'compliance', 'dependency']
      },
      description: String,
      probability: {
        type: String,
        enum: ['very_low', 'low', 'medium', 'high', 'very_high']
      },
      impact: {
        type: String,
        enum: ['negligible', 'minor', 'moderate', 'major', 'severe']
      },
      mitigation: {
        strategy: String,
        backup: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ProjectResource'
        },
        crossTraining: [String],
        documentation: String
      },
      status: {
        type: String,
        enum: ['identified', 'mitigating', 'monitoring', 'resolved']
      }
    }],
    compliance: {
      requirements: [{
        type: {
          type: String,
          enum: ['certification', 'training', 'clearance', 'insurance', 'license', 'visa']
        },
        description: String,
        required: Boolean,
        status: {
          type: String,
          enum: ['compliant', 'pending', 'non_compliant', 'expired']
        },
        expiryDate: Date,
        renewalDate: Date,
        documentUrl: String
      }],
      audits: [{
        type: String,
        date: Date,
        auditor: String,
        findings: String,
        actions: [{
          action: String,
          owner: String,
          dueDate: Date,
          status: String
        }],
        nextAudit: Date
      }],
      violations: [{
        date: Date,
        type: String,
        description: String,
        severity: String,
        resolution: String,
        preventiveAction: String
      }]
    },
    insurance: {
      policies: [{
        type: String,
        provider: String,
        policyNumber: String,
        coverage: String,
        limit: Number,
        premium: Number,
        effectiveDate: Date,
        expiryDate: Date
      }],
      claims: [{
        date: Date,
        type: String,
        description: String,
        amount: Number,
        status: String,
        resolution: String
      }]
    }
  },

  // ==================== Succession Planning ====================
  succession: {
    critical: {
      type: Boolean,
      default: false
    },
    successors: [{
      resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectResource'
      },
      readiness: {
        type: String,
        enum: ['ready_now', '1_year', '2_years', '3_plus_years']
      },
      developmentNeeded: [String],
      shadowingHours: Number,
      transitionPlan: String
    }],
    documentation: {
      procedures: [{
        name: String,
        documented: Boolean,
        location: String,
        lastUpdated: Date
      }],
      knowledgeTransfer: {
        status: {
          type: String,
          enum: ['not_started', 'in_progress', 'completed']
        },
        sessions: [{
          date: Date,
          topic: String,
          attendees: [String],
          materials: String
        }],
        completionPercentage: Number
      }
    },
    retention: {
      risk: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      factors: [String],
      retentionActions: [{
        action: String,
        implemented: Boolean,
        effectiveness: String
      }],
      lastReview: Date
    }
  },

  // ==================== Vendor/Partner Management ====================
  vendor: {
    vendorId: String,
    companyName: String,
    contractNumber: String,
    contractType: {
      type: String,
      enum: ['fixed_price', 'time_materials', 'retainer', 'sow', 'msa']
    },
    contractValue: Number,
    startDate: Date,
    endDate: Date,
    renewalOptions: [{
      period: String,
      terms: String,
      notice: String
    }],
    sla: {
      metrics: [{
        metric: String,
        target: String,
        measurement: String,
        penalty: String
      }],
      performance: [{
        period: String,
        metric: String,
        achieved: String,
        target: String,
        met: Boolean
      }],
      reviews: [{
        date: Date,
        reviewer: String,
        rating: Number,
        comments: String,
        actions: [String]
      }]
    },
    contacts: [{
      name: String,
      role: String,
      email: String,
      phone: String,
      primary: Boolean
    }],
    invoicing: {
      frequency: String,
      method: String,
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      history: [{
        invoiceNumber: String,
        date: Date,
        amount: Number,
        status: String,
        paidDate: Date
      }]
    }
  },

  // ==================== Integration & External Systems ====================
  integrations: {
    externalId: {
      hris: String,
      erp: String,
      timesheet: String,
      projectManagement: String,
      custom: {
        type: Map,
        of: String
      }
    },
    synchronization: {
      enabled: Boolean,
      frequency: {
        type: String,
        enum: ['realtime', 'hourly', 'daily', 'weekly', 'manual']
      },
      lastSync: Date,
      nextSync: Date,
      fields: [{
        field: String,
        source: String,
        mapping: String,
        transform: String
      }],
      errors: [{
        date: Date,
        field: String,
        error: String,
        resolved: Boolean
      }]
    },
    apis: [{
      name: String,
      endpoint: String,
      method: String,
      authentication: String,
      frequency: String,
      lastCall: Date,
      status: String
    }]
  },

  // ==================== Analytics & Reporting ====================
  analytics: {
    utilization: {
      current: Number,
      average: Number,
      trend: {
        type: String,
        enum: ['increasing', 'stable', 'decreasing']
      },
      history: [{
        period: Date,
        percentage: Number,
        billable: Number,
        nonBillable: Number
      }]
    },
    productivity: {
      score: Number,
      trend: String,
      factors: {
        velocity: Number,
        quality: Number,
        efficiency: Number,
        collaboration: Number
      },
      benchmarks: {
        team: Number,
        department: Number,
        organization: Number,
        industry: Number
      }
    },
    financial: {
      revenue: {
        generated: Number,
        projected: Number,
        perHour: Number
      },
      cost: {
        total: Number,
        perHour: Number,
        overhead: Number
      },
      profitability: {
        margin: Number,
        contribution: Number,
        roi: Number
      }
    },
    predictions: {
      availabilityForecast: [{
        date: Date,
        availability: Number,
        confidence: Number
      }],
      performanceTrend: String,
      retentionRisk: Number,
      optimalAllocation: {
        projects: [{
          projectId: String,
          allocation: Number,
          rationale: String
        }],
        calculatedAt: Date
      }
    },
    insights: [{
      type: {
        type: String,
        enum: ['recommendation', 'warning', 'opportunity', 'risk']
      },
      category: String,
      description: String,
      impact: String,
      action: String,
      priority: String,
      generatedAt: Date
    }]
  },

  // ==================== Notes & Communications ====================
  communications: {
    notes: [{
      date: Date,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      type: {
        type: String,
        enum: ['general', 'performance', 'availability', 'incident', 'feedback']
      },
      content: String,
      visibility: {
        type: String,
        enum: ['private', 'managers', 'team', 'public']
      },
      followUp: {
        required: Boolean,
        date: Date,
        assignedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        completed: Boolean
      }
    }],
    feedback: [{
      from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      date: Date,
      type: {
        type: String,
        enum: ['positive', 'constructive', 'neutral']
      },
      category: String,
      content: String,
      actionable: Boolean,
      actionTaken: String
    }],
    meetings: [{
      type: {
        type: String,
        enum: ['one_on_one', 'team', 'review', 'planning', 'retrospective']
      },
      date: Date,
      attendees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      agenda: [String],
      notes: String,
      actionItems: [{
        item: String,
        owner: String,
        dueDate: Date,
        completed: Boolean
      }]
    }]
  },

  // ==================== Custom Fields & Metadata ====================
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'integration', 'api']
    },
    tags: [String],
    labels: {
      type: Map,
      of: String
    },
    flags: {
      isCritical: {
        type: Boolean,
        default: false
      },
      isKeyResource: {
        type: Boolean,
        default: false
      },
      requiresBackup: {
        type: Boolean,
        default: false
      },
      isContractor: {
        type: Boolean,
        default: false
      }
    },
    version: {
      type: Number,
      default: 1
    }
  },

  // ==================== Status Tracking ====================
  status: {
    current: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'terminated', 'pending', 'blocked'],
      default: 'active',
      index: true
    },
    effectiveDate: Date,
    reason: String,
    history: [{
      status: String,
      from: Date,
      to: Date,
      reason: String,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false,
    index: true
  },

  // ==================== Audit Trail ====================
  auditLog: [{
    action: String,
    entity: String,
    entityId: String,
    changes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: Date,
    ip: String,
    userAgent: String,
    reason: String
  }]
};

// Create schema
const resourceSchema = BaseModel.createSchema(resourceSchemaDefinition, {
  collection: 'project_resources',
  timestamps: true
});

// ==================== Indexes ====================
resourceSchema.index({ tenantId: 1, resourceCode: 1 }, { unique: true });
resourceSchema.index({ tenantId: 1, projectId: 1, 'status.current': 1 });
resourceSchema.index({ tenantId: 1, 'classification.type': 1 });
resourceSchema.index({ tenantId: 1, 'humanResource.userId': 1 });
resourceSchema.index({ tenantId: 1, 'humanResource.consultantId': 1 });
resourceSchema.index({ tenantId: 1, 'allocation.allocationPercentage': 1 });
resourceSchema.index({ tenantId: 1, 'availability.status': 1 });
resourceSchema.index({ tenantId: 1, 'allocation.startDate': 1, 'allocation.endDate': 1 });
resourceSchema.index({ tenantId: 1, searchTokens: 1 });

// Text search index
resourceSchema.index({
  name: 'text',
  description: 'text',
  'humanResource.skills.skillName': 'text',
  'allocation.role': 'text'
});

// ==================== Virtual Fields ====================
resourceSchema.virtual('isAvailable').get(function() {
  return this.availability.status === 'available' && 
         this.availability.currentUtilization.percentage < 100;
});

resourceSchema.virtual('remainingCapacity').get(function() {
  return Math.max(0, 100 - this.availability.currentUtilization.percentage);
});

resourceSchema.virtual('isOverallocated').get(function() {
  return this.availability.currentUtilization.percentage > 100;
});

resourceSchema.virtual('daysUntilAvailable').get(function() {
  if (this.allocation.endDate) {
    const days = Math.ceil((this.allocation.endDate - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }
  return 0;
});

resourceSchema.virtual('billableUtilization').get(function() {
  if (this.timeTracking.summary.totalHours.thisMonth > 0) {
    return (this.timeTracking.summary.billableHours.thisMonth / 
            this.timeTracking.summary.totalHours.thisMonth) * 100;
  }
  return 0;
});

resourceSchema.virtual('costEfficiency').get(function() {
  if (this.financial.costs.total > 0 && this.financial.profitability.revenue > 0) {
    return this.financial.profitability.revenue / this.financial.costs.total;
  }
  return 0;
});

// ==================== Pre-save Middleware ====================
resourceSchema.pre('save', async function(next) {
  try {
    // Generate resource code if not provided
    if (!this.resourceCode && this.isNew) {
      this.resourceCode = await this.constructor.generateResourceCode(this.tenantId, this.classification.type);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate utilization
    if (this.isModified('allocation') || this.isModified('timeTracking')) {
      this.calculateUtilization();
    }

    // Update financial metrics
    if (this.isModified('financial') || this.isModified('timeTracking')) {
      this.updateFinancialMetrics();
    }

    // Update availability status
    if (this.isModified('allocation')) {
      this.updateAvailabilityStatus();
    }

    // Calculate performance metrics
    if (this.isModified('performance') || this.isModified('timeTracking')) {
      this.calculatePerformanceMetrics();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
resourceSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add resource name tokens
  if (this.name) {
    this.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add resource code
  if (this.resourceCode) {
    tokens.add(this.resourceCode.toLowerCase());
  }
  
  // Add skills
  if (this.humanResource && this.humanResource.skills) {
    this.humanResource.skills.forEach(skill => {
      skill.skillName.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    });
  }
  
  // Add tags
  if (this.classification.tags) {
    this.classification.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  // Add role
  if (this.allocation.role) {
    this.allocation.role.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  this.searchTokens = Array.from(tokens);
};

resourceSchema.methods.calculateUtilization = function() {
  const now = new Date();
  const standardHours = this.capacity.standard.hoursPerDay * this.capacity.standard.daysPerWeek * 4; // Monthly
  
  if (this.timeTracking.summary.totalHours.thisMonth && standardHours > 0) {
    this.availability.currentUtilization.percentage = 
      Math.round((this.timeTracking.summary.totalHours.thisMonth / standardHours) * 100);
  }
  
  // Update utilization history
  this.analytics.utilization.current = this.availability.currentUtilization.percentage;
  
  // Calculate average utilization
  if (this.analytics.utilization.history.length > 0) {
    const sum = this.analytics.utilization.history.reduce((acc, h) => acc + h.percentage, 0);
    this.analytics.utilization.average = Math.round(sum / this.analytics.utilization.history.length);
  }
  
  // Determine trend
  if (this.analytics.utilization.history.length >= 3) {
    const recent = this.analytics.utilization.history.slice(-3);
    const trend = recent[2].percentage - recent[0].percentage;
    
    if (trend > 5) {
      this.analytics.utilization.trend = 'increasing';
    } else if (trend < -5) {
      this.analytics.utilization.trend = 'decreasing';
    } else {
      this.analytics.utilization.trend = 'stable';
    }
  }
};

resourceSchema.methods.updateFinancialMetrics = function() {
  // Calculate costs
  const costs = this.financial.costs;
  costs.total = (costs.acquisition || 0) + (costs.operational || 0) + 
                (costs.maintenance || 0) + (costs.training || 0) + 
                (costs.overhead || 0);
  
  // Calculate revenue
  if (this.financial.billing.billable && this.timeTracking.summary.billableHours.thisMonth) {
    const rate = this.financial.billing.clientRate || this.financial.costStructure.rate.standard;
    this.financial.profitability.revenue = 
      this.timeTracking.summary.billableHours.thisMonth * rate;
  }
  
  // Calculate profitability
  if (this.financial.profitability.revenue > 0) {
    this.financial.profitability.cost = costs.total;
    this.financial.profitability.margin = 
      this.financial.profitability.revenue - this.financial.profitability.cost;
    this.financial.profitability.marginPercentage = 
      (this.financial.profitability.margin / this.financial.profitability.revenue) * 100;
  }
  
  // Update analytics
  this.analytics.financial.revenue.generated = this.financial.profitability.revenue;
  this.analytics.financial.cost.total = costs.total;
  this.analytics.financial.profitability.margin = this.financial.profitability.marginPercentage;
};

resourceSchema.methods.updateAvailabilityStatus = function() {
  const now = new Date();
  const utilization = this.availability.currentUtilization.percentage;
  
  if (this.status.current === 'inactive' || this.status.current === 'terminated') {
    this.availability.status = 'unavailable';
  } else if (this.status.current === 'on_leave') {
    this.availability.status = 'unavailable';
  } else if (utilization >= 100) {
    this.availability.status = 'allocated';
  } else if (utilization > 0) {
    this.availability.status = 'partially_available';
  } else {
    this.availability.status = 'available';
  }
};

resourceSchema.methods.calculatePerformanceMetrics = function() {
  // Calculate productivity score
  const metrics = this.performance.metrics;
  let productivityScore = 0;
  let factorCount = 0;
  
  if (metrics.productivity.onTimeDelivery) {
    productivityScore += metrics.productivity.onTimeDelivery;
    factorCount++;
  }
  
  if (metrics.productivity.tasksCompleted) {
    productivityScore += (metrics.productivity.tasksCompleted / 10) * 100;
    factorCount++;
  }
  
  if (metrics.quality.clientSatisfaction) {
    productivityScore += metrics.quality.clientSatisfaction;
    factorCount++;
  }
  
  if (factorCount > 0) {
    this.analytics.productivity.score = Math.round(productivityScore / factorCount);
  }
  
  // Determine productivity trend
  if (this.analytics.productivity.history && this.analytics.productivity.history.length >= 3) {
    const recent = this.analytics.productivity.history.slice(-3);
    const trend = recent[2].percentage - recent[0].percentage;
    
    if (trend > 5) {
      this.analytics.productivity.trend = 'increasing';
    } else if (trend < -5) {
      this.analytics.productivity.trend = 'decreasing';
    } else {
      this.analytics.productivity.trend = 'stable';
    }
  }
  
  // Calculate efficiency
  if (this.timeTracking.summary.totalHours.thisMonth > 0) {
    const targetHours = this.capacity.standard.hoursPerDay * 20; // Monthly target
    this.analytics.productivity.factors.efficiency = 
      (this.timeTracking.summary.billableHours.thisMonth / targetHours) * 100;
  }
  
  // Update benchmarks
  this.analytics.productivity.benchmarks.team = this.analytics.productivity.score;
};

resourceSchema.methods.allocateToProject = async function(allocationData) {
  // Validate availability
  if (this.availability.status === 'unavailable') {
    throw new AppError('Resource is unavailable', 400, 'RESOURCE_UNAVAILABLE');
  }
  
  // Check for overallocation
  const newAllocation = allocationData.allocationPercentage;
  const currentAllocation = this.availability.currentUtilization.percentage;
  
  if (currentAllocation + newAllocation > 100) {
    throw new AppError(
      `Resource would be overallocated: ${currentAllocation + newAllocation}%`,
      400,
      'RESOURCE_OVERALLOCATION'
    );
  }
  
  // Update allocation
  this.allocation = {
    currentProject: {
      projectId: allocationData.projectId,
      projectCode: allocationData.projectCode,
      projectName: allocationData.projectName
    },
    allocationPercentage: newAllocation,
    allocationType: allocationData.allocationType,
    startDate: allocationData.startDate,
    endDate: allocationData.endDate,
    role: allocationData.role,
    responsibilities: allocationData.responsibilities || [],
    deliverables: allocationData.deliverables || [],
    tasks: allocationData.tasks || [],
    workLocation: allocationData.workLocation,
    reportingStructure: allocationData.reportingStructure
  };
  
  // Update availability
  this.availability.currentUtilization.percentage = currentAllocation + newAllocation;
  this.updateAvailabilityStatus();
  
  // Add to future commitments
  this.availability.futureCommitments.push({
    projectId: allocationData.projectId,
    startDate: allocationData.startDate,
    endDate: allocationData.endDate,
    allocation: newAllocation,
    confirmed: true,
    priority: allocationData.priority || 'normal'
  });
  
  await this.save();
  
  logger.info('Resource allocated to project', {
    resourceId: this._id,
    projectId: allocationData.projectId,
    allocation: newAllocation
  });
  
  return this.allocation;
};

resourceSchema.methods.updateTimesheet = async function(timesheetData) {
  const weekStart = dateHelper.getWeekStart(timesheetData.week);
  
  // Find or create timesheet for the week
  let timesheet = this.timeTracking.timesheets.find(ts => 
    ts.week.getTime() === weekStart.getTime()
  );
  
  if (!timesheet) {
    timesheet = {
      week: weekStart,
      status: 'draft',
      entries: [],
      totalHours: {
        regular: 0,
        overtime: 0,
        billable: 0,
        nonBillable: 0,
        total: 0
      }
    };
    this.timeTracking.timesheets.push(timesheet);
  }
  
  // Add or update entries
  if (timesheetData.entries) {
    timesheetData.entries.forEach(entry => {
      const existingEntry = timesheet.entries.find(e => 
        e.date.getTime() === entry.date.getTime() && 
        e.taskId === entry.taskId
      );
      
      if (existingEntry) {
        Object.assign(existingEntry, entry);
      } else {
        timesheet.entries.push(entry);
      }
    });
  }
  
  // Calculate totals
  timesheet.totalHours = {
    regular: 0,
    overtime: 0,
    billable: 0,
    nonBillable: 0,
    total: 0
  };
  
  timesheet.entries.forEach(entry => {
    timesheet.totalHours.regular += entry.hours.regular || 0;
    timesheet.totalHours.overtime += entry.hours.overtime || 0;
    timesheet.totalHours.total += entry.hours.total || 0;
    
    if (entry.billable) {
      timesheet.totalHours.billable += entry.hours.total || 0;
    } else {
      timesheet.totalHours.nonBillable += entry.hours.total || 0;
    }
  });
  
  // Update summary
  this.updateTimesheetSummary();
  
  await this.save();
  
  return timesheet;
};

resourceSchema.methods.submitTimesheet = async function(week, userId) {
  const timesheet = this.timeTracking.timesheets.find(ts => 
    ts.week.getTime() === week.getTime()
  );
  
  if (!timesheet) {
    throw new AppError('Timesheet not found', 404, 'TIMESHEET_NOT_FOUND');
  }
  
  if (timesheet.status !== 'draft') {
    throw new AppError('Timesheet already submitted', 400, 'TIMESHEET_ALREADY_SUBMITTED');
  }
  
  timesheet.status = 'submitted';
  timesheet.submittedAt = new Date();
  timesheet.submittedBy = userId;
  
  await this.save();
  
  logger.info('Timesheet submitted', {
    resourceId: this._id,
    week: week
  });
  
  return timesheet;
};

resourceSchema.methods.approveTimesheet = async function(week, approverId, comments) {
  const timesheet = this.timeTracking.timesheets.find(ts => 
    ts.week.getTime() === week.getTime()
  );
  
  if (!timesheet) {
    throw new AppError('Timesheet not found', 404, 'TIMESHEET_NOT_FOUND');
  }
  
  if (timesheet.status !== 'submitted') {
    throw new AppError('Timesheet not in submitted status', 400, 'INVALID_TIMESHEET_STATUS');
  }
  
  timesheet.status = 'approved';
  timesheet.approvedAt = new Date();
  timesheet.approvedBy = approverId;
  timesheet.comments = comments;
  
  // Update summary with approved hours
  this.updateTimesheetSummary();
  
  await this.save();
  
  logger.info('Timesheet approved', {
    resourceId: this._id,
    week: week,
    approvedBy: approverId
  });
  
  return timesheet;
};

resourceSchema.methods.updateTimesheetSummary = function() {
  const now = new Date();
  const thisWeekStart = dateHelper.getWeekStart(now);
  const thisMonthStart = dateHelper.getMonthStart(now);
  const thisQuarterStart = dateHelper.getQuarterStart(now);
  const thisYearStart = dateHelper.getYearStart(now);
  
  // Reset summary
  this.timeTracking.summary = {
    totalHours: {
      thisWeek: 0,
      thisMonth: 0,
      thisQuarter: 0,
      thisYear: 0,
      allTime: 0
    },
    billableHours: {
      thisWeek: 0,
      thisMonth: 0,
      thisQuarter: 0,
      thisYear: 0,
      allTime: 0
    },
    utilization: {
      thisWeek: 0,
      thisMonth: 0,
      thisQuarter: 0,
      thisYear: 0,
      average: 0
    },
    overtime: {
      thisMonth: 0,
      thisQuarter: 0,
      thisYear: 0
    }
  };
  
  // Calculate summary from approved timesheets
  this.timeTracking.timesheets
    .filter(ts => ts.status === 'approved' || ts.status === 'processed')
    .forEach(timesheet => {
      const weekDate = timesheet.week;
      
      // All time
      this.timeTracking.summary.totalHours.allTime += timesheet.totalHours.total;
      this.timeTracking.summary.billableHours.allTime += timesheet.totalHours.billable;
      
      // This year
      if (weekDate >= thisYearStart) {
        this.timeTracking.summary.totalHours.thisYear += timesheet.totalHours.total;
        this.timeTracking.summary.billableHours.thisYear += timesheet.totalHours.billable;
        this.timeTracking.summary.overtime.thisYear += timesheet.totalHours.overtime;
      }
      
      // This quarter
      if (weekDate >= thisQuarterStart) {
        this.timeTracking.summary.totalHours.thisQuarter += timesheet.totalHours.total;
        this.timeTracking.summary.billableHours.thisQuarter += timesheet.totalHours.billable;
        this.timeTracking.summary.overtime.thisQuarter += timesheet.totalHours.overtime;
      }
      
      // This month
      if (weekDate >= thisMonthStart) {
        this.timeTracking.summary.totalHours.thisMonth += timesheet.totalHours.total;
        this.timeTracking.summary.billableHours.thisMonth += timesheet.totalHours.billable;
        this.timeTracking.summary.overtime.thisMonth += timesheet.totalHours.overtime;
      }
      
      // This week
      if (weekDate.getTime() === thisWeekStart.getTime()) {
        this.timeTracking.summary.totalHours.thisWeek = timesheet.totalHours.total;
        this.timeTracking.summary.billableHours.thisWeek = timesheet.totalHours.billable;
      }
    });
  
  // Calculate utilization
  const standardHours = {
    week: this.capacity.standard.hoursPerDay * this.capacity.standard.daysPerWeek,
    month: this.capacity.standard.hoursPerDay * this.capacity.standard.daysPerWeek * 4,
    quarter: this.capacity.standard.hoursPerDay * this.capacity.standard.daysPerWeek * 13,
    year: this.capacity.standard.hoursPerDay * this.capacity.standard.daysPerWeek * 52
  };
  
  if (standardHours.week > 0) {
    this.timeTracking.summary.utilization.thisWeek = 
      Math.round((this.timeTracking.summary.billableHours.thisWeek / standardHours.week) * 100);
  }
  
  if (standardHours.month > 0) {
    this.timeTracking.summary.utilization.thisMonth = 
      Math.round((this.timeTracking.summary.billableHours.thisMonth / standardHours.month) * 100);
  }
  
  if (standardHours.quarter > 0) {
    this.timeTracking.summary.utilization.thisQuarter = 
      Math.round((this.timeTracking.summary.billableHours.thisQuarter / standardHours.quarter) * 100);
  }
  
  if (standardHours.year > 0) {
    this.timeTracking.summary.utilization.thisYear = 
      Math.round((this.timeTracking.summary.billableHours.thisYear / standardHours.year) * 100);
  }
  
  // Calculate average utilization
  const utilizationValues = [
    this.timeTracking.summary.utilization.thisWeek,
    this.timeTracking.summary.utilization.thisMonth,
    this.timeTracking.summary.utilization.thisQuarter,
    this.timeTracking.summary.utilization.thisYear
  ].filter(v => v > 0);
  
  if (utilizationValues.length > 0) {
    this.timeTracking.summary.utilization.average = 
      Math.round(utilizationValues.reduce((a, b) => a + b, 0) / utilizationValues.length);
  }
};

resourceSchema.methods.recordPerformance = async function(performanceData) {
  const rating = {
    period: performanceData.period,
    type: performanceData.type,
    overall: performanceData.overall,
    categories: performanceData.categories || [],
    strengths: performanceData.strengths || [],
    improvements: performanceData.improvements || [],
    goals: performanceData.goals || [],
    feedback: performanceData.feedback || {},
    evaluator: performanceData.evaluator,
    evaluatedAt: new Date(),
    acknowledged: false
  };
  
  this.performance.ratings.push(rating);
  
  // Update metrics based on latest rating
  if (performanceData.metrics) {
    Object.assign(this.performance.metrics, performanceData.metrics);
  }
  
  // Calculate performance metrics
  this.calculatePerformanceMetrics();
  
  await this.save();
  
  logger.info('Performance recorded', {
    resourceId: this._id,
    type: performanceData.type,
    evaluator: performanceData.evaluator
  });
  
  return rating;
};

resourceSchema.methods.planCapacity = async function(period) {
  const forecast = [];
  const startDate = period.from;
  const endDate = period.to;
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const weekStart = dateHelper.getWeekStart(currentDate);
    const weekEnd = dateHelper.getWeekEnd(currentDate);
    
    // Calculate available hours for the week
    const workingDays = this.availability.calendar.workingDays.length;
    const hoursPerDay = this.capacity.standard.hoursPerDay;
    const productiveHours = this.capacity.standard.productiveHours;
    
    let availableHours = workingDays * productiveHours;
    
    // Subtract planned absences
    const absences = this.availability.plannedAbsences.filter(absence => 
      absence.startDate <= weekEnd && absence.endDate >= weekStart
    );
    
    absences.forEach(absence => {
      const absenceDays = Math.min(
        Math.floor((absence.endDate - absence.startDate) / (1000 * 60 * 60 * 24)) + 1,
        workingDays
      );
      availableHours -= absenceDays * productiveHours;
    });
    
    // Calculate allocated hours
    let allocatedHours = 0;
    this.capacity.currentLoad.forEach(load => {
      if (load.startDate <= weekEnd && load.endDate >= weekStart) {
        allocatedHours += (load.allocation / 100) * availableHours;
      }
    });
    
    // Check for conflicts
    const conflicts = [];
    if (allocatedHours > availableHours) {
      conflicts.push({
        date: weekStart,
        requested: allocatedHours,
        available: availableHours,
        projects: this.capacity.currentLoad
          .filter(load => load.startDate <= weekEnd && load.endDate >= weekStart)
          .map(load => load.projectId)
      });
    }
    
    forecast.push({
      period: {
        from: weekStart,
        to: weekEnd
      },
      availableHours: Math.max(0, availableHours),
      allocatedHours: allocatedHours,
      utilizationPercentage: availableHours > 0 
        ? Math.round((allocatedHours / availableHours) * 100)
        : 0,
      overallocated: allocatedHours > availableHours,
      conflicts: conflicts
    });
    
    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  this.capacity.forecast = forecast;
  
  await this.save();
  
  return forecast;
};

resourceSchema.methods.checkCompliance = async function() {
  const complianceIssues = [];
  const now = new Date();
  
  this.riskCompliance.compliance.requirements.forEach(requirement => {
    if (requirement.required) {
      // Check expiry
      if (requirement.expiryDate && requirement.expiryDate < now) {
        requirement.status = 'expired';
        complianceIssues.push({
          type: requirement.type,
          issue: 'Expired',
          severity: 'high',
          action: 'Renewal required'
        });
      }
      
      // Check renewal date
      else if (requirement.renewalDate && requirement.renewalDate < now) {
        requirement.status = 'pending';
        complianceIssues.push({
          type: requirement.type,
          issue: 'Renewal due',
          severity: 'medium',
          action: 'Schedule renewal'
        });
      }
      
      // Check non-compliance
      else if (requirement.status === 'non_compliant') {
        complianceIssues.push({
          type: requirement.type,
          issue: 'Non-compliant',
          severity: 'critical',
          action: 'Immediate action required'
        });
      }
    }
  });
  
  // Update compliance status
  if (complianceIssues.length > 0) {
    logger.warn('Compliance issues detected', {
      resourceId: this._id,
      issues: complianceIssues
    });
  }
  
  await this.save();
  
  return {
    compliant: complianceIssues.length === 0,
    issues: complianceIssues
  };
};

resourceSchema.methods.generateUtilizationReport = function(period) {
  const report = {
    resource: {
      resourceCode: this.resourceCode,
      name: this.name,
      type: this.classification.type,
      role: this.allocation.role
    },
    period: period,
    utilization: {
      current: this.availability.currentUtilization.percentage,
      average: this.analytics.utilization.average,
      trend: this.analytics.utilization.trend,
      target: this.timeTracking.targets.utilization.target
    },
    hours: {
      total: this.timeTracking.summary.totalHours[period] || 0,
      billable: this.timeTracking.summary.billableHours[period] || 0,
      nonBillable: this.timeTracking.summary.totalHours[period] - 
                   this.timeTracking.summary.billableHours[period] || 0,
      overtime: this.timeTracking.summary.overtime[period] || 0
    },
    financial: {
      revenue: this.analytics.financial.revenue.generated,
      cost: this.analytics.financial.cost.total,
      margin: this.analytics.financial.profitability.margin,
      efficiency: this.costEfficiency
    },
    performance: {
      productivity: this.analytics.productivity.score,
      quality: this.performance.metrics.quality,
      collaboration: this.performance.metrics.collaboration
    },
    allocation: {
      project: this.allocation.currentProject,
      percentage: this.allocation.allocationPercentage,
      startDate: this.allocation.startDate,
      endDate: this.allocation.endDate
    },
    capacity: {
      available: this.remainingCapacity,
      futureCommitments: this.availability.futureCommitments.length,
      constraints: this.capacity.constraints
    }
  };
  
  return report;
};

resourceSchema.methods.releaseFromProject = async function(releaseData) {
  if (!this.allocation.currentProject) {
    throw new AppError('Resource not allocated to any project', 400, 'NO_ALLOCATION');
  }
  
  // Update allocation end date
  this.allocation.actualEndDate = releaseData.releaseDate || new Date();
  
  // Update availability
  this.availability.currentUtilization.percentage -= this.allocation.allocationPercentage;
  this.availability.status = 'available';
  
  // Record in history
  if (!this.status.history) {
    this.status.history = [];
  }
  
  this.status.history.push({
    status: 'released',
    from: this.allocation.startDate,
    to: this.allocation.actualEndDate,
    reason: releaseData.reason,
    changedBy: releaseData.releasedBy
  });
  
  // Clear current allocation
  this.allocation.currentProject = null;
  this.allocation.allocationPercentage = 0;
  
  // Update future commitments
  this.availability.futureCommitments = this.availability.futureCommitments.filter(
    commitment => commitment.projectId.toString() !== releaseData.projectId
  );
  
  await this.save();
  
  logger.info('Resource released from project', {
    resourceId: this._id,
    projectId: releaseData.projectId,
    releaseDate: this.allocation.actualEndDate
  });
  
  return true;
};

// ==================== Static Methods ====================
resourceSchema.statics.generateResourceCode = async function(tenantId, resourceType) {
  const typePrefix = {
    human: 'HUM',
    equipment: 'EQP',
    material: 'MAT',
    facility: 'FAC',
    service: 'SVC',
    financial: 'FIN',
    information: 'INF'
  };
  
  const prefix = typePrefix[resourceType] || 'RES';
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  // Find the last resource code for this tenant and type
  const lastResource = await this.findOne({
    tenantId,
    resourceCode: new RegExp(`^RES-${prefix}-${year}${month}`)
  }).sort({ resourceCode: -1 });
  
  let sequence = 1;
  if (lastResource) {
    const lastSequence = parseInt(lastResource.resourceCode.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `RES-${prefix}-${year}${month}${sequence.toString().padStart(4, '0')}`;
};

resourceSchema.statics.findAvailableResources = async function(criteria) {
  const {
    tenantId,
    skills,
    availability,
    location,
    dateRange,
    minAvailability = 20,
    resourceType = 'human',
    limit = 50,
    skip = 0
  } = criteria;
  
  const query = {
    tenantId,
    'classification.type': resourceType,
    'status.current': 'active',
    'availability.status': { $in: ['available', 'partially_available'] }
  };
  
  // Filter by availability percentage
  query['availability.currentUtilization.percentage'] = { $lte: 100 - minAvailability };
  
  // Filter by skills if specified
  if (skills && skills.length > 0) {
    query['humanResource.skills.skillName'] = { $in: skills };
  }
  
  // Filter by location if specified
  if (location) {
    query['classification.location.site'] = location;
  }
  
  // Check availability for date range
  if (dateRange) {
    query.$and = [
      {
        $or: [
          { 'allocation.endDate': { $lte: dateRange.start } },
          { 'allocation.startDate': { $gte: dateRange.end } },
          { 'allocation.currentProject': null }
        ]
      }
    ];
  }
  
  const [resources, total] = await Promise.all([
    this.find(query)
      .populate('humanResource.userId', 'profile.firstName profile.lastName email')
      .populate('humanResource.consultantId', 'profile.firstName profile.lastName')
      .limit(limit)
      .skip(skip)
      .sort({ 'availability.currentUtilization.percentage': 1 })
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    resources,
    total,
    hasMore: total > skip + resources.length
  };
};

resourceSchema.statics.getResourceUtilization = async function(tenantId, options = {}) {
  const {
    resourceType,
    dateRange,
    groupBy = 'week'
  } = options;
  
  const match = { tenantId };
  
  if (resourceType) {
    match['classification.type'] = resourceType;
  }
  
  if (dateRange) {
    match['timeTracking.timesheets.week'] = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }
  
  const utilization = await this.aggregate([
    { $match: match },
    { $unwind: '$timeTracking.timesheets' },
    {
      $group: {
        _id: {
          resource: '$_id',
          period: {
            $dateToString: {
              format: groupBy === 'week' ? '%Y-W%V' : '%Y-%m',
              date: '$timeTracking.timesheets.week'
            }
          }
        },
        totalHours: { $sum: '$timeTracking.timesheets.totalHours.total' },
        billableHours: { $sum: '$timeTracking.timesheets.totalHours.billable' },
        overtime: { $sum: '$timeTracking.timesheets.totalHours.overtime' }
      }
    },
    {
      $group: {
        _id: '$_id.period',
        resources: { $sum: 1 },
        totalHours: { $sum: '$totalHours' },
        billableHours: { $sum: '$billableHours' },
        overtime: { $sum: '$overtime' },
        avgUtilization: { $avg: { $divide: ['$billableHours', '$totalHours'] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return utilization;
};

resourceSchema.statics.getCapacityForecast = async function(tenantId, period) {
  const resources = await this.find({
    tenantId,
    'status.current': 'active',
    'classification.type': 'human'
  });
  
  const forecast = {
    period: period,
    totalCapacity: 0,
    allocatedCapacity: 0,
    availableCapacity: 0,
    utilizationPercentage: 0,
    resourceBreakdown: [],
    constraints: [],
    recommendations: []
  };
  
  for (const resource of resources) {
    const resourceForecast = await resource.planCapacity(period);
    
    const resourceSummary = {
      resourceId: resource._id,
      resourceName: resource.name,
      totalHours: resourceForecast.reduce((sum, f) => sum + f.availableHours, 0),
      allocatedHours: resourceForecast.reduce((sum, f) => sum + f.allocatedHours, 0),
      utilization: 0
    };
    
    if (resourceSummary.totalHours > 0) {
      resourceSummary.utilization = 
        Math.round((resourceSummary.allocatedHours / resourceSummary.totalHours) * 100);
    }
    
    forecast.totalCapacity += resourceSummary.totalHours;
    forecast.allocatedCapacity += resourceSummary.allocatedHours;
    forecast.resourceBreakdown.push(resourceSummary);
    
    // Identify constraints
    if (resourceSummary.utilization > 90) {
      forecast.constraints.push({
        type: 'high_utilization',
        resourceId: resource._id,
        utilization: resourceSummary.utilization,
        impact: 'Limited flexibility for new work'
      });
    }
  }
  
  forecast.availableCapacity = forecast.totalCapacity - forecast.allocatedCapacity;
  
  if (forecast.totalCapacity > 0) {
    forecast.utilizationPercentage = 
      Math.round((forecast.allocatedCapacity / forecast.totalCapacity) * 100);
  }
  
  // Generate recommendations
  if (forecast.utilizationPercentage > 85) {
    forecast.recommendations.push({
      type: 'capacity',
      message: 'Consider adding resources to handle upcoming demand',
      priority: 'high'
    });
  } else if (forecast.utilizationPercentage < 60) {
    forecast.recommendations.push({
      type: 'optimization',
      message: 'Underutilized capacity - consider reallocation or training',
      priority: 'medium'
    });
  }
  
  return forecast;
};

resourceSchema.statics.getResourcePerformance = async function(tenantId, options = {}) {
  const {
    period,
    resourceType,
    minRating
  } = options;
  
  const match = { tenantId };
  
  if (resourceType) {
    match['classification.type'] = resourceType;
  }
  
  if (period) {
    match['performance.ratings.period.from'] = { $gte: period.from };
    match['performance.ratings.period.to'] = { $lte: period.to };
  }
  
  const performance = await this.aggregate([
    { $match: match },
    { $unwind: '$performance.ratings' },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$performance.ratings.overall.score' },
        totalResources: { $addToSet: '$_id' },
        topPerformers: {
          $push: {
            $cond: [
              { $gte: ['$performance.ratings.overall.score', minRating || 4] },
              {
                resourceId: '$_id',
                name: '$name',
                rating: '$performance.ratings.overall.score'
              },
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        avgRating: 1,
        totalResources: { $size: '$totalResources' },
        topPerformers: {
          $filter: {
            input: '$topPerformers',
            cond: { $ne: ['$$this', null] }
          }
        }
      }
    }
  ]);
  
  return performance[0] || {
    avgRating: 0,
    totalResources: 0,
    topPerformers: []
  };
};

// ==================== Create Model ====================
const ProjectResourceModel = BaseModel.createModel('ProjectResource', resourceSchema, {
  collection: 'project_resources',
  enableTimestamps: true,
  enableAudit: true
});

module.exports = ProjectResourceModel;