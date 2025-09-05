'use strict';

/**
 * @fileoverview Enhanced project model with comprehensive lifecycle management and enterprise features
 * @module servers/customer-services/modules/core-business/projects/models/project-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../../shared/lib/utils/helpers/date-helper');

/**
 * Enhanced project schema definition for enterprise project management
 */
const projectSchemaDefinition = {
  // ==================== Core Identity ====================
  projectCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^PRJ-[A-Z0-9]{6,}$/,
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
    maxlength: 5000
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

  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },

  parentProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },

  subProjects: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    type: {
      type: String,
      enum: ['phase', 'workstream', 'component', 'subcontract']
    },
    dependency: {
      type: String,
      enum: ['blocking', 'non_blocking', 'parallel']
    }
  }],

  // ==================== Project Classification ====================
  classification: {
    type: {
      type: String,
      enum: ['fixed_price', 'time_materials', 'retainer', 'milestone', 'hybrid'],
      required: true
    },
    category: {
      type: String,
      enum: ['consulting', 'implementation', 'development', 'support', 'training', 'research', 'audit'],
      required: true
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
      index: true
    },
    complexity: {
      type: String,
      enum: ['simple', 'moderate', 'complex', 'highly_complex'],
      default: 'moderate'
    },
    methodology: {
      type: String,
      enum: ['waterfall', 'agile', 'scrum', 'kanban', 'hybrid', 'custom']
    },
    industry: String,
    technology: [String],
    tags: [String],
    customAttributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Project Timeline ====================
  timeline: {
    plannedStartDate: {
      type: Date,
      required: true,
      index: true
    },
    plannedEndDate: {
      type: Date,
      required: true,
      index: true
    },
    actualStartDate: Date,
    actualEndDate: Date,
    estimatedDuration: {
      value: Number,
      unit: {
        type: String,
        enum: ['hours', 'days', 'weeks', 'months']
      }
    },
    actualDuration: {
      value: Number,
      unit: String
    },
    criticalPath: [{
      taskId: String,
      taskName: String,
      duration: Number,
      slack: Number
    }],
    schedule: {
      workingDays: {
        type: [String],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      holidays: [{
        date: Date,
        name: String
      }],
      blackoutDates: [{
        startDate: Date,
        endDate: Date,
        reason: String
      }]
    },
    variance: {
      schedule: Number,
      effort: Number,
      cost: Number
    }
  },

  // ==================== Project Status & Lifecycle ====================
  status: {
    current: {
      type: String,
      enum: ['draft', 'proposal', 'planning', 'approved', 'in_progress', 'on_hold', 'completed', 'cancelled', 'archived'],
      default: 'draft',
      index: true
    },
    phase: {
      type: String,
      enum: ['initiation', 'planning', 'execution', 'monitoring', 'closure']
    },
    health: {
      type: String,
      enum: ['on_track', 'at_risk', 'off_track', 'critical'],
      default: 'on_track'
    },
    completionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    statusHistory: [{
      status: String,
      changedFrom: String,
      changedTo: String,
      changedAt: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String,
      notes: String
    }],
    approval: {
      required: {
        type: Boolean,
        default: false
      },
      approvers: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        role: String,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected']
        },
        approvedAt: Date,
        comments: String
      }],
      finalApproval: {
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        approvedAt: Date,
        approvalDocument: String
      }
    }
  },

  // ==================== Milestones & Deliverables ====================
  milestones: [{
    milestoneId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    type: {
      type: String,
      enum: ['phase_gate', 'deliverable', 'payment', 'review', 'decision_point']
    },
    plannedDate: {
      type: Date,
      required: true
    },
    actualDate: Date,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'delayed', 'cancelled'],
      default: 'pending'
    },
    dependencies: [{
      milestoneId: String,
      type: {
        type: String,
        enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']
      }
    }],
    deliverables: [{
      name: String,
      description: String,
      status: String,
      acceptanceCriteria: [String],
      signoffRequired: Boolean,
      signedOffBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      signedOffAt: Date
    }],
    payment: {
      amount: Number,
      currency: String,
      condition: String,
      invoiced: Boolean,
      paid: Boolean
    },
    completion: {
      percentage: Number,
      evidence: [String],
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date
    }
  }],

  // ==================== Team & Resources ====================
  team: {
    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    technicalLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    businessAnalyst: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    members: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant'
      },
      role: {
        type: String,
        required: true
      },
      responsibilities: [String],
      allocation: {
        percentage: {
          type: Number,
          min: 0,
          max: 100
        },
        hours: Number,
        startDate: Date,
        endDate: Date
      },
      rateCard: {
        rate: Number,
        currency: String,
        rateType: {
          type: String,
          enum: ['hourly', 'daily', 'weekly', 'monthly', 'fixed']
        }
      },
      skills: [String],
      performance: {
        rating: Number,
        feedback: String,
        lastReviewDate: Date
      },
      joinedAt: Date,
      leftAt: Date,
      status: {
        type: String,
        enum: ['active', 'inactive', 'rolled_off', 'pending'],
        default: 'active'
      }
    }],
    stakeholders: [{
      name: String,
      email: String,
      organization: String,
      role: String,
      type: {
        type: String,
        enum: ['sponsor', 'champion', 'influencer', 'end_user', 'observer']
      },
      influence: {
        type: String,
        enum: ['high', 'medium', 'low']
      },
      engagement: {
        type: String,
        enum: ['supportive', 'neutral', 'resistant']
      }
    }],
    committees: [{
      name: String,
      type: {
        type: String,
        enum: ['steering', 'technical', 'change_advisory', 'risk']
      },
      members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      meetingSchedule: String,
      responsibilities: [String]
    }]
  },

  // ==================== Budget & Financial ====================
  budget: {
    approved: {
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'USD'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date
    },
    allocated: {
      labor: Number,
      materials: Number,
      travel: Number,
      equipment: Number,
      contingency: Number,
      other: Number
    },
    spent: {
      labor: {
        type: Number,
        default: 0
      },
      materials: {
        type: Number,
        default: 0
      },
      travel: {
        type: Number,
        default: 0
      },
      equipment: {
        type: Number,
        default: 0
      },
      other: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        default: 0
      }
    },
    committed: {
      amount: {
        type: Number,
        default: 0
      },
      details: [{
        type: String,
        amount: Number,
        date: Date
      }]
    },
    forecast: {
      estimateAtCompletion: Number,
      estimateToComplete: Number,
      varianceAtCompletion: Number,
      lastUpdated: Date
    },
    billing: {
      type: {
        type: String,
        enum: ['milestone', 'monthly', 'upon_completion', 'custom']
      },
      totalBilled: {
        type: Number,
        default: 0
      },
      totalPaid: {
        type: Number,
        default: 0
      },
      outstanding: {
        type: Number,
        default: 0
      },
      invoices: [{
        invoiceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Invoice'
        },
        invoiceNumber: String,
        amount: Number,
        issuedDate: Date,
        dueDate: Date,
        paidDate: Date,
        status: String
      }]
    },
    profitability: {
      revenue: Number,
      cost: Number,
      margin: Number,
      marginPercentage: Number,
      roi: Number
    },
    changeOrders: [{
      changeOrderId: String,
      description: String,
      amount: Number,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      impact: {
        budget: Number,
        schedule: Number,
        scope: String
      }
    }]
  },

  // ==================== Scope & Requirements ====================
  scope: {
    statement: {
      type: String,
      required: true,
      maxlength: 10000
    },
    objectives: [{
      objective: String,
      priority: {
        type: String,
        enum: ['must_have', 'should_have', 'nice_to_have']
      },
      measurable: Boolean,
      successCriteria: [String]
    }],
    inclusions: [String],
    exclusions: [String],
    assumptions: [String],
    constraints: [String],
    dependencies: [{
      type: String,
      description: String,
      owner: String,
      status: {
        type: String,
        enum: ['identified', 'confirmed', 'resolved', 'blocked']
      }
    }],
    requirements: [{
      requirementId: String,
      category: {
        type: String,
        enum: ['functional', 'non_functional', 'technical', 'business', 'regulatory']
      },
      description: String,
      priority: {
        type: String,
        enum: ['critical', 'high', 'medium', 'low']
      },
      status: {
        type: String,
        enum: ['draft', 'approved', 'in_progress', 'completed', 'deferred']
      },
      owner: String,
      acceptanceCriteria: [String],
      traceability: String
    }],
    changeRequests: [{
      requestId: String,
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      requestDate: Date,
      description: String,
      impact: {
        scope: String,
        schedule: String,
        budget: String,
        risk: String
      },
      status: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'rejected', 'implemented']
      },
      approvalDate: Date,
      implementationDate: Date
    }]
  },

  // ==================== Risk Management ====================
  risks: [{
    riskId: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['technical', 'financial', 'operational', 'strategic', 'compliance', 'external']
    },
    probability: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high']
    },
    impact: {
      type: String,
      enum: ['negligible', 'minor', 'moderate', 'major', 'severe']
    },
    score: Number,
    status: {
      type: String,
      enum: ['identified', 'assessed', 'mitigating', 'monitoring', 'closed', 'realized'],
      default: 'identified'
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    identifiedDate: Date,
    targetResolutionDate: Date,
    actualResolutionDate: Date,
    mitigation: {
      strategy: {
        type: String,
        enum: ['avoid', 'transfer', 'mitigate', 'accept']
      },
      plan: String,
      actions: [{
        action: String,
        responsible: String,
        dueDate: Date,
        status: String
      }]
    },
    contingency: {
      plan: String,
      trigger: String,
      budget: Number
    },
    residualRisk: {
      probability: String,
      impact: String,
      acceptable: Boolean
    }
  }],

  // ==================== Issues & Actions ====================
  issues: [{
    issueId: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    category: {
      type: String,
      enum: ['technical', 'resource', 'schedule', 'quality', 'stakeholder', 'other']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'],
      default: 'open'
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    raisedDate: Date,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    targetResolutionDate: Date,
    actualResolutionDate: Date,
    resolution: String,
    escalation: {
      escalated: Boolean,
      escalatedTo: String,
      escalatedDate: Date,
      reason: String
    },
    relatedRisks: [String],
    impact: {
      schedule: String,
      budget: String,
      quality: String
    }
  }],

  actionItems: [{
    actionId: String,
    description: String,
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dueDate: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'completed', 'cancelled', 'overdue'],
      default: 'open'
    },
    completedDate: Date,
    notes: String,
    relatedTo: {
      type: {
        type: String,
        enum: ['risk', 'issue', 'milestone', 'decision']
      },
      id: String
    }
  }],

  // ==================== Quality & Performance ====================
  quality: {
    standards: [{
      standard: String,
      compliance: {
        type: String,
        enum: ['compliant', 'partial', 'non_compliant', 'not_applicable']
      }
    }],
    metrics: [{
      metric: String,
      target: Number,
      actual: Number,
      unit: String,
      status: {
        type: String,
        enum: ['meeting', 'below', 'exceeding']
      },
      lastMeasured: Date
    }],
    reviews: [{
      type: {
        type: String,
        enum: ['gate', 'peer', 'technical', 'quality', 'client']
      },
      scheduledDate: Date,
      completedDate: Date,
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      findings: String,
      recommendations: [String],
      outcome: {
        type: String,
        enum: ['approved', 'approved_with_conditions', 'requires_rework', 'rejected']
      },
      followUpRequired: Boolean
    }],
    defects: [{
      defectId: String,
      description: String,
      severity: {
        type: String,
        enum: ['cosmetic', 'minor', 'major', 'critical']
      },
      status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed', 'deferred']
      },
      foundDate: Date,
      resolvedDate: Date,
      rootCause: String
    }],
    testing: {
      testPlan: String,
      testCases: Number,
      executed: Number,
      passed: Number,
      failed: Number,
      blocked: Number,
      coverage: Number
    },
    clientSatisfaction: {
      score: Number,
      surveyDate: Date,
      feedback: String,
      areas: {
        communication: Number,
        quality: Number,
        timeliness: Number,
        value: Number,
        overall: Number
      }
    }
  },

  // ==================== Communications & Reporting ====================
  communications: {
    plan: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'bi_weekly', 'monthly', 'ad_hoc']
      },
      channels: [{
        type: String,
        audience: String,
        frequency: String,
        format: String
      }],
      escalationPath: [{
        level: Number,
        role: String,
        trigger: String,
        timeframe: String
      }]
    },
    meetings: [{
      type: {
        type: String,
        enum: ['kickoff', 'status', 'steering', 'technical', 'retrospective', 'closure']
      },
      scheduledDate: Date,
      actualDate: Date,
      duration: Number,
      attendees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      agenda: [String],
      minutes: String,
      actionItems: [String],
      decisions: [String],
      recordingUrl: String
    }],
    reports: [{
      type: {
        type: String,
        enum: ['status', 'progress', 'financial', 'risk', 'quality', 'executive']
      },
      frequency: String,
      lastGenerated: Date,
      recipients: [String],
      format: String,
      automated: Boolean,
      template: String
    }],
    notifications: {
      emailList: [String],
      slackChannel: String,
      teamsChannel: String,
      webhooks: [{
        url: String,
        events: [String],
        active: Boolean
      }]
    }
  },

  // ==================== Documents & Artifacts ====================
  documents: [{
    documentId: String,
    type: {
      type: String,
      enum: ['charter', 'plan', 'requirement', 'design', 'test', 'report', 'presentation', 'contract', 'other']
    },
    name: String,
    description: String,
    version: String,
    url: String,
    size: Number,
    mimeType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: Date,
    lastModified: Date,
    tags: [String],
    approval: {
      required: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date
    },
    retention: {
      policy: String,
      deleteAfter: Date
    }
  }],

  artifacts: [{
    type: {
      type: String,
      enum: ['code', 'documentation', 'diagram', 'mockup', 'dataset', 'model', 'other']
    },
    name: String,
    description: String,
    location: String,
    version: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: Date
  }],

  // ==================== Integration & External Systems ====================
  integrations: {
    externalProjectId: {
      jira: String,
      asana: String,
      monday: String,
      trello: String,
      microsoftProject: String,
      custom: {
        type: Map,
        of: String
      }
    },
    repositories: [{
      type: {
        type: String,
        enum: ['github', 'gitlab', 'bitbucket', 'azure_devops', 'other']
      },
      url: String,
      branch: String,
      lastCommit: String,
      lastSync: Date
    }],
    cicd: {
      pipeline: String,
      lastBuild: {
        number: String,
        status: String,
        date: Date
      },
      deployments: [{
        environment: String,
        version: String,
        date: Date,
        status: String
      }]
    },
    monitoring: {
      dashboardUrl: String,
      alerts: [{
        type: String,
        threshold: Number,
        recipients: [String]
      }]
    }
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    performance: {
      schedulePerformanceIndex: Number,
      costPerformanceIndex: Number,
      earnedValue: Number,
      plannedValue: Number,
      actualCost: Number,
      scheduleVariance: Number,
      costVariance: Number
    },
    productivity: {
      velocityTrend: [Number],
      burndownRate: Number,
      resourceUtilization: Number,
      defectDensity: Number,
      reworkPercentage: Number
    },
    trends: {
      scopeCreep: Number,
      budgetTrend: String,
      scheduleTrend: String,
      riskTrend: String,
      qualityTrend: String
    },
    forecasts: {
      completionDate: Date,
      finalCost: Number,
      remainingWork: Number,
      confidence: Number
    },
    benchmarks: {
      industryComparison: {
        cost: String,
        schedule: String,
        quality: String
      },
      historicalComparison: {
        vsAverage: Number,
        ranking: Number,
        percentile: Number
      }
    }
  },

  // ==================== Lessons Learned ====================
  lessonsLearned: [{
    category: {
      type: String,
      enum: ['process', 'technical', 'management', 'communication', 'risk', 'other']
    },
    description: String,
    impact: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    recommendation: String,
    applicability: {
      type: String,
      enum: ['project_specific', 'department', 'organization_wide']
    },
    documentedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    documentedAt: Date,
    validated: Boolean
  }],

  // ==================== Closure & Handover ====================
  closure: {
    completed: {
      type: Boolean,
      default: false
    },
    completedDate: Date,
    acceptedBy: {
      client: {
        name: String,
        title: String,
        signature: String,
        date: Date
      },
      internal: {
        name: String,
        title: String,
        signature: String,
        date: Date
      }
    },
    handover: {
      completed: Boolean,
      recipient: String,
      documents: [String],
      training: {
        required: Boolean,
        completed: Boolean,
        sessions: [{
          topic: String,
          date: Date,
          attendees: [String]
        }]
      },
      support: {
        period: Number,
        endDate: Date,
        type: String
      }
    },
    finalReport: {
      generated: Boolean,
      url: String,
      summary: String,
      achievements: [String],
      challenges: [String],
      recommendations: [String]
    },
    archive: {
      archived: Boolean,
      archivedDate: Date,
      location: String,
      retentionPeriod: Number
    }
  },

  // ==================== Custom Fields & Metadata ====================
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'template', 'clone', 'api']
    },
    template: {
      templateId: String,
      templateName: String,
      version: String
    },
    tags: [String],
    labels: {
      type: Map,
      of: String
    },
    flags: {
      isTemplate: {
        type: Boolean,
        default: false
      },
      isConfidential: {
        type: Boolean,
        default: false
      },
      requiresNda: {
        type: Boolean,
        default: false
      },
      isStrategic: {
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
const projectSchema = BaseModel.createSchema(projectSchemaDefinition, {
  collection: 'projects',
  timestamps: true
});

// ==================== Indexes ====================
projectSchema.index({ tenantId: 1, projectCode: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, 'status.current': 1 });
projectSchema.index({ tenantId: 1, 'team.projectManager': 1 });
projectSchema.index({ tenantId: 1, 'timeline.plannedStartDate': 1 });
projectSchema.index({ tenantId: 1, 'timeline.plannedEndDate': 1 });
projectSchema.index({ tenantId: 1, 'status.current': 1, 'status.health': 1 });
projectSchema.index({ tenantId: 1, 'classification.priority': 1 });
projectSchema.index({ tenantId: 1, 'budget.approved.amount': -1 });
projectSchema.index({ tenantId: 1, searchTokens: 1 });
projectSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
projectSchema.index({
  name: 'text',
  description: 'text',
  'scope.statement': 'text',
  'notes.content': 'text'
});

// ==================== Virtual Fields ====================
projectSchema.virtual('duration').get(function() {
  if (this.timeline.actualEndDate && this.timeline.actualStartDate) {
    return Math.floor((this.timeline.actualEndDate - this.timeline.actualStartDate) / (1000 * 60 * 60 * 24));
  }
  if (this.timeline.plannedEndDate && this.timeline.plannedStartDate) {
    return Math.floor((this.timeline.plannedEndDate - this.timeline.plannedStartDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

projectSchema.virtual('daysRemaining').get(function() {
  if (this.timeline.plannedEndDate) {
    const remaining = Math.floor((this.timeline.plannedEndDate - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, remaining);
  }
  return null;
});

projectSchema.virtual('isOverdue').get(function() {
  return this.timeline.plannedEndDate < new Date() && this.status.current !== 'completed';
});

projectSchema.virtual('budgetUtilization').get(function() {
  if (this.budget.approved.amount > 0) {
    return (this.budget.spent.total / this.budget.approved.amount) * 100;
  }
  return 0;
});

projectSchema.virtual('profitMargin').get(function() {
  if (this.budget.billing.totalBilled > 0) {
    return ((this.budget.billing.totalBilled - this.budget.spent.total) / this.budget.billing.totalBilled) * 100;
  }
  return 0;
});

projectSchema.virtual('teamSize').get(function() {
  return this.team.members.filter(m => m.status === 'active').length;
});

projectSchema.virtual('openRisks').get(function() {
  return this.risks.filter(r => ['identified', 'assessed', 'mitigating', 'monitoring'].includes(r.status)).length;
});

projectSchema.virtual('openIssues').get(function() {
  return this.issues.filter(i => ['open', 'in_progress', 'escalated'].includes(i.status)).length;
});

// ==================== Pre-save Middleware ====================
projectSchema.pre('save', async function(next) {
  try {
    // Generate project code if not provided
    if (!this.projectCode && this.isNew) {
      this.projectCode = await this.constructor.generateProjectCode(this.tenantId);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate completion percentage
    if (this.isModified('milestones')) {
      this.calculateCompletionPercentage();
    }

    // Update budget totals
    if (this.isModified('budget.spent')) {
      this.updateBudgetTotals();
    }

    // Update project health
    if (this.isModified('status') || this.isModified('budget') || this.isModified('timeline')) {
      this.updateProjectHealth();
    }

    // Calculate analytics
    if (this.isModified('budget') || this.isModified('timeline')) {
      this.calculateAnalytics();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
projectSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add project name tokens
  if (this.name) {
    this.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add project code
  if (this.projectCode) {
    tokens.add(this.projectCode.toLowerCase());
  }
  
  // Add tags
  if (this.classification.tags) {
    this.classification.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  // Add technology
  if (this.classification.technology) {
    this.classification.technology.forEach(tech => tokens.add(tech.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

projectSchema.methods.calculateCompletionPercentage = function() {
  if (!this.milestones || this.milestones.length === 0) {
    this.status.completionPercentage = 0;
    return;
  }
  
  const totalMilestones = this.milestones.length;
  const completedMilestones = this.milestones.filter(m => m.status === 'completed').length;
  
  this.status.completionPercentage = Math.round((completedMilestones / totalMilestones) * 100);
};

projectSchema.methods.updateBudgetTotals = function() {
  const spent = this.budget.spent;
  spent.total = (spent.labor || 0) + (spent.materials || 0) + 
                (spent.travel || 0) + (spent.equipment || 0) + 
                (spent.other || 0);
  
  // Update budget variance
  if (this.budget.approved.amount > 0) {
    this.timeline.variance.cost = ((spent.total - this.budget.approved.amount) / this.budget.approved.amount) * 100;
  }
};

projectSchema.methods.updateProjectHealth = function() {
  let healthScore = 100;
  
  // Schedule health (30% weight)
  if (this.isOverdue) {
    healthScore -= 30;
  } else if (this.daysRemaining < 7 && this.status.completionPercentage < 90) {
    healthScore -= 20;
  }
  
  // Budget health (30% weight)
  const budgetUtil = this.budgetUtilization;
  if (budgetUtil > 100) {
    healthScore -= 30;
  } else if (budgetUtil > 90 && this.status.completionPercentage < 90) {
    healthScore -= 20;
  }
  
  // Risk health (20% weight)
  const highRisks = this.risks.filter(r => r.probability === 'high' || r.probability === 'very_high').length;
  if (highRisks > 5) {
    healthScore -= 20;
  } else if (highRisks > 2) {
    healthScore -= 10;
  }
  
  // Issue health (20% weight)
  const criticalIssues = this.issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length;
  if (criticalIssues > 0) {
    healthScore -= 20;
  } else if (this.openIssues > 10) {
    healthScore -= 10;
  }
  
  // Determine health status
  if (healthScore >= 80) {
    this.status.health = 'on_track';
  } else if (healthScore >= 60) {
    this.status.health = 'at_risk';
  } else if (healthScore >= 40) {
    this.status.health = 'off_track';
  } else {
    this.status.health = 'critical';
  }
};

projectSchema.methods.calculateAnalytics = function() {
  // Calculate Earned Value Management metrics
  const now = new Date();
  const projectDuration = this.duration;
  const daysElapsed = this.timeline.actualStartDate 
    ? Math.floor((now - this.timeline.actualStartDate) / (1000 * 60 * 60 * 24))
    : 0;
  
  if (projectDuration > 0) {
    // Planned Value (PV)
    const percentageElapsed = Math.min(100, (daysElapsed / projectDuration) * 100);
    this.analytics.performance.plannedValue = (this.budget.approved.amount * percentageElapsed) / 100;
    
    // Earned Value (EV)
    this.analytics.performance.earnedValue = (this.budget.approved.amount * this.status.completionPercentage) / 100;
    
    // Actual Cost (AC)
    this.analytics.performance.actualCost = this.budget.spent.total;
    
    // Schedule Variance (SV)
    this.analytics.performance.scheduleVariance = this.analytics.performance.earnedValue - this.analytics.performance.plannedValue;
    
    // Cost Variance (CV)
    this.analytics.performance.costVariance = this.analytics.performance.earnedValue - this.analytics.performance.actualCost;
    
    // Schedule Performance Index (SPI)
    if (this.analytics.performance.plannedValue > 0) {
      this.analytics.performance.schedulePerformanceIndex = 
        this.analytics.performance.earnedValue / this.analytics.performance.plannedValue;
    }
    
    // Cost Performance Index (CPI)
    if (this.analytics.performance.actualCost > 0) {
      this.analytics.performance.costPerformanceIndex = 
        this.analytics.performance.earnedValue / this.analytics.performance.actualCost;
    }
  }
};

projectSchema.methods.addTeamMember = async function(memberData) {
  const member = {
    userId: memberData.userId,
    consultantId: memberData.consultantId,
    role: memberData.role,
    responsibilities: memberData.responsibilities,
    allocation: memberData.allocation,
    rateCard: memberData.rateCard,
    skills: memberData.skills,
    joinedAt: new Date(),
    status: 'active'
  };
  
  // Check if member already exists
  const existingMember = this.team.members.find(m => 
    (m.userId && m.userId.toString() === memberData.userId?.toString()) ||
    (m.consultantId && m.consultantId.toString() === memberData.consultantId?.toString())
  );
  
  if (existingMember) {
    throw new AppError('Team member already exists', 409, 'MEMBER_EXISTS');
  }
  
  this.team.members.push(member);
  
  await this.save();
  return member;
};

projectSchema.methods.updateMilestone = async function(milestoneId, updates) {
  const milestone = this.milestones.find(m => m.milestoneId === milestoneId);
  
  if (!milestone) {
    throw new AppError('Milestone not found', 404, 'MILESTONE_NOT_FOUND');
  }
  
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      milestone[key] = updates[key];
    }
  });
  
  // Update project completion if milestone completed
  if (updates.status === 'completed') {
    milestone.actualDate = new Date();
    this.calculateCompletionPercentage();
  }
  
  await this.save();
  return milestone;
};

projectSchema.methods.addRisk = async function(riskData, userId) {
  const risk = {
    riskId: `RISK-${this.risks.length + 1}`,
    description: riskData.description,
    category: riskData.category,
    probability: riskData.probability,
    impact: riskData.impact,
    status: 'identified',
    owner: riskData.owner || userId,
    identifiedDate: new Date(),
    mitigation: riskData.mitigation,
    contingency: riskData.contingency
  };
  
  // Calculate risk score
  const probabilityScores = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
  const impactScores = { negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5 };
  risk.score = probabilityScores[risk.probability] * impactScores[risk.impact];
  
  this.risks.push(risk);
  
  // Update project health if high risk
  if (risk.score >= 12) {
    this.updateProjectHealth();
  }
  
  await this.save();
  return risk;
};

projectSchema.methods.addIssue = async function(issueData, userId) {
  const issue = {
    issueId: `ISS-${this.issues.length + 1}`,
    title: issueData.title,
    description: issueData.description,
    category: issueData.category,
    severity: issueData.severity,
    status: 'open',
    raisedBy: userId,
    raisedDate: new Date(),
    assignedTo: issueData.assignedTo,
    targetResolutionDate: issueData.targetResolutionDate,
    relatedRisks: issueData.relatedRisks,
    impact: issueData.impact
  };
  
  this.issues.push(issue);
  
  // Update project health if critical issue
  if (issue.severity === 'critical') {
    this.updateProjectHealth();
  }
  
  await this.save();
  return issue;
};

projectSchema.methods.recordChangeRequest = async function(changeData, userId) {
  const changeRequest = {
    requestId: `CHG-${this.scope.changeRequests.length + 1}`,
    requestedBy: userId,
    requestDate: new Date(),
    description: changeData.description,
    impact: changeData.impact,
    status: 'pending'
  };
  
  this.scope.changeRequests.push(changeRequest);
  
  await this.save();
  
  logger.info('Change request recorded', {
    projectId: this._id,
    changeRequestId: changeRequest.requestId,
    requestedBy: userId
  });
  
  return changeRequest;
};

projectSchema.methods.approveChangeRequest = async function(requestId, userId, comments) {
  const changeRequest = this.scope.changeRequests.find(cr => cr.requestId === requestId);
  
  if (!changeRequest) {
    throw new AppError('Change request not found', 404, 'CHANGE_REQUEST_NOT_FOUND');
  }
  
  changeRequest.status = 'approved';
  changeRequest.approvalDate = new Date();
  changeRequest.approvedBy = userId;
  changeRequest.approvalComments = comments;
  
  await this.save();
  
  logger.info('Change request approved', {
    projectId: this._id,
    changeRequestId: requestId,
    approvedBy: userId
  });
  
  return changeRequest;
};

projectSchema.methods.generateStatusReport = async function() {
  const report = {
    projectName: this.name,
    projectCode: this.projectCode,
    reportDate: new Date(),
    status: this.status.current,
    health: this.status.health,
    completionPercentage: this.status.completionPercentage,
    timeline: {
      plannedStart: this.timeline.plannedStartDate,
      plannedEnd: this.timeline.plannedEndDate,
      daysRemaining: this.daysRemaining,
      isOverdue: this.isOverdue
    },
    budget: {
      approved: this.budget.approved.amount,
      spent: this.budget.spent.total,
      remaining: this.budget.approved.amount - this.budget.spent.total,
      utilization: this.budgetUtilization
    },
    milestones: {
      total: this.milestones.length,
      completed: this.milestones.filter(m => m.status === 'completed').length,
      upcoming: this.milestones.filter(m => m.status === 'pending' && m.plannedDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length
    },
    risks: {
      total: this.risks.length,
      high: this.risks.filter(r => r.probability === 'high' || r.impact === 'severe').length,
      open: this.openRisks
    },
    issues: {
      total: this.issues.length,
      critical: this.issues.filter(i => i.severity === 'critical').length,
      open: this.openIssues
    },
    team: {
      size: this.teamSize,
      projectManager: this.team.projectManager
    },
    keyMetrics: this.analytics.performance
  };
  
  return report;
};

projectSchema.methods.closeProject = async function(closureData, userId) {
  if (this.status.current === 'completed') {
    throw new AppError('Project already closed', 400, 'PROJECT_ALREADY_CLOSED');
  }
  
  // Validate all milestones are complete
  const incompleteMilestones = this.milestones.filter(m => m.status !== 'completed');
  if (incompleteMilestones.length > 0) {
    throw new AppError('Cannot close project with incomplete milestones', 400, 'INCOMPLETE_MILESTONES');
  }
  
  // Update project status
  this.status.current = 'completed';
  this.timeline.actualEndDate = new Date();
  
  // Record closure details
  this.closure = {
    completed: true,
    completedDate: new Date(),
    acceptedBy: closureData.acceptedBy,
    handover: closureData.handover,
    finalReport: closureData.finalReport
  };
  
  // Calculate final metrics
  this.calculateAnalytics();
  
  // Record in status history
  this.status.statusHistory.push({
    status: 'completed',
    changedFrom: this.status.current,
    changedTo: 'completed',
    changedAt: new Date(),
    changedBy: userId,
    reason: 'Project closure',
    notes: closureData.notes
  });
  
  await this.save();
  
  logger.info('Project closed', {
    projectId: this._id,
    projectCode: this.projectCode,
    closedBy: userId
  });
  
  return true;
};

// ==================== Static Methods ====================
projectSchema.statics.generateProjectCode = async function(tenantId) {
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  // Find the last project code for this tenant and month
  const lastProject = await this.findOne({
    tenantId,
    projectCode: new RegExp(`^PRJ-${year}${month}`)
  }).sort({ projectCode: -1 });
  
  let sequence = 1;
  if (lastProject) {
    const lastSequence = parseInt(lastProject.projectCode.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `PRJ-${year}${month}${sequence.toString().padStart(4, '0')}`;
};

projectSchema.statics.findByTenant = async function(tenantId, options = {}) {
  const {
    status,
    priority,
    projectManager,
    clientId,
    dateRange,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = { tenantId };
  
  if (status) {
    query['status.current'] = status;
  }
  
  if (priority) {
    query['classification.priority'] = priority;
  }
  
  if (projectManager) {
    query['team.projectManager'] = projectManager;
  }
  
  if (clientId) {
    query.clientId = clientId;
  }
  
  if (dateRange) {
    query['timeline.plannedStartDate'] = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }
  
  const [projects, total] = await Promise.all([
    this.find(query)
      .populate('clientId', 'companyName clientCode')
      .populate('team.projectManager', 'profile.firstName profile.lastName email')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    projects,
    total,
    hasMore: total > skip + projects.length
  };
};

projectSchema.statics.getProjectStatistics = async function(tenantId, options = {}) {
  const { dateRange, clientId, projectManager } = options;
  
  const match = { tenantId };
  
  if (dateRange) {
    match.createdAt = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }
  
  if (clientId) {
    match.clientId = clientId;
  }
  
  if (projectManager) {
    match['team.projectManager'] = projectManager;
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
                $sum: { $cond: [{ $eq: ['$status.current', 'in_progress'] }, 1, 0] }
              },
              completed: {
                $sum: { $cond: [{ $eq: ['$status.current', 'completed'] }, 1, 0] }
              },
              onHold: {
                $sum: { $cond: [{ $eq: ['$status.current', 'on_hold'] }, 1, 0] }
              },
              totalBudget: { $sum: '$budget.approved.amount' },
              totalSpent: { $sum: '$budget.spent.total' },
              totalBilled: { $sum: '$budget.billing.totalBilled' },
              avgCompletion: { $avg: '$status.completionPercentage' }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$status.current',
              count: { $sum: 1 },
              value: { $sum: '$budget.approved.amount' }
            }
          }
        ],
        byHealth: [
          {
            $group: {
              _id: '$status.health',
              count: { $sum: 1 }
            }
          }
        ],
        byPriority: [
          {
            $group: {
              _id: '$classification.priority',
              count: { $sum: 1 },
              avgCompletion: { $avg: '$status.completionPercentage' }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: '$classification.category',
              count: { $sum: 1 },
              totalValue: { $sum: '$budget.approved.amount' }
            }
          }
        ],
        timeline: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$timeline.plannedStartDate' } },
              starting: { $sum: 1 },
              value: { $sum: '$budget.approved.amount' }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: 12 }
        ],
        topProjects: [
          { $sort: { 'budget.approved.amount': -1 } },
          { $limit: 10 },
          {
            $project: {
              projectCode: 1,
              name: 1,
              value: '$budget.approved.amount',
              completion: '$status.completionPercentage',
              health: '$status.health'
            }
          }
        ],
        atRiskProjects: [
          { $match: { 'status.health': { $in: ['off_track', 'critical'] } } },
          { $limit: 10 },
          {
            $project: {
              projectCode: 1,
              name: 1,
              health: '$status.health',
              completion: '$status.completionPercentage',
              daysOverdue: {
                $divide: [
                  { $subtract: [new Date(), '$timeline.plannedEndDate'] },
                  1000 * 60 * 60 * 24
                ]
              }
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
      completed: 0,
      onHold: 0,
      totalBudget: 0,
      totalSpent: 0,
      totalBilled: 0,
      avgCompletion: 0
    },
    distribution: {
      byStatus: result.byStatus,
      byHealth: result.byHealth,
      byPriority: result.byPriority,
      byCategory: result.byCategory
    },
    timeline: result.timeline,
    insights: {
      topProjects: result.topProjects,
      atRiskProjects: result.atRiskProjects
    }
  };
};

// ==================== Create Model ====================
const ProjectModel = BaseModel.createModel('Project', projectSchema, {
  collection: 'projects',
  enableTimestamps: true,
  enableAudit: true
});

module.exports = ProjectModel;