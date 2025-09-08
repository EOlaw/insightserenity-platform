'use strict';

/**
 * @fileoverview Enhanced project milestone model with comprehensive lifecycle and dependency management
 * @module servers/customer-services/modules/core-business/projects/models/project-milestone-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const stringHelper = require('../../../../../utils/helpers/string-helper');

/**
 * Enhanced milestone schema definition for enterprise project management
 */
const milestoneSchemaDefinition = {
  // ==================== Core Identity ====================
  milestoneCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^MS-[A-Z0-9]{8,}$/,
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
    maxlength: 5000,
    required: true
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

  parentMilestoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectMilestone',
    index: true
  },

  // ==================== Milestone Classification ====================
  classification: {
    type: {
      type: String,
      enum: ['phase_gate', 'deliverable', 'payment', 'review', 'decision_point', 'regulatory', 'external_dependency'],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['technical', 'business', 'financial', 'legal', 'operational', 'quality', 'regulatory'],
      required: true
    },
    phase: {
      type: String,
      enum: ['initiation', 'planning', 'execution', 'monitoring', 'closure'],
      required: true
    },
    criticality: {
      type: String,
      enum: ['critical_path', 'high_priority', 'medium_priority', 'low_priority', 'optional'],
      default: 'medium_priority',
      index: true
    },
    visibility: {
      type: String,
      enum: ['internal', 'client_visible', 'stakeholder_visible', 'public'],
      default: 'internal'
    },
    tags: [String],
    customAttributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Timeline & Scheduling ====================
  timeline: {
    baselineDate: {
      type: Date,
      required: true,
      index: true
    },
    plannedDate: {
      type: Date,
      required: true,
      index: true
    },
    forecastDate: {
      type: Date,
      index: true
    },
    actualDate: {
      type: Date,
      index: true
    },
    earliestStart: Date,
    latestFinish: Date,
    duration: {
      estimated: {
        value: Number,
        unit: {
          type: String,
          enum: ['hours', 'days', 'weeks', 'months']
        }
      },
      actual: {
        value: Number,
        unit: String
      }
    },
    buffer: {
      days: {
        type: Number,
        default: 0
      },
      type: {
        type: String,
        enum: ['project', 'feeding', 'resource', 'capacity']
      }
    },
    scheduling: {
      constraint: {
        type: String,
        enum: ['asap', 'alap', 'must_start_on', 'must_finish_on', 'start_no_earlier_than', 'start_no_later_than', 'finish_no_earlier_than', 'finish_no_later_than'],
        default: 'asap'
      },
      constraintDate: Date,
      workCalendar: String,
      timeZone: {
        type: String,
        default: 'UTC'
      }
    },
    variance: {
      schedule: {
        days: Number,
        percentage: Number
      },
      effort: {
        hours: Number,
        percentage: Number
      },
      cost: {
        amount: Number,
        percentage: Number
      }
    }
  },

  // ==================== Dependencies & Relationships ====================
  dependencies: {
    predecessors: [{
      milestoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectMilestone'
      },
      type: {
        type: String,
        enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
        default: 'finish_to_start'
      },
      lag: {
        value: {
          type: Number,
          default: 0
        },
        unit: {
          type: String,
          enum: ['hours', 'days', 'weeks'],
          default: 'days'
        }
      },
      enforced: {
        type: Boolean,
        default: true
      },
      criticalPath: {
        type: Boolean,
        default: false
      }
    }],
    successors: [{
      milestoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectMilestone'
      },
      type: {
        type: String,
        enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']
      },
      lag: {
        value: Number,
        unit: String
      }
    }],
    external: [{
      type: {
        type: String,
        enum: ['vendor', 'client', 'regulatory', 'third_party', 'internal_system']
      },
      description: String,
      entity: String,
      contactPerson: {
        name: String,
        email: String,
        phone: String
      },
      status: {
        type: String,
        enum: ['pending', 'confirmed', 'at_risk', 'delayed', 'completed']
      },
      expectedDate: Date,
      actualDate: Date,
      notes: String
    }],
    blockedBy: [{
      type: {
        type: String,
        enum: ['dependency', 'resource', 'approval', 'technical', 'external']
      },
      description: String,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      owner: String,
      expectedResolution: Date,
      resolved: Boolean,
      resolvedDate: Date
    }]
  },

  // ==================== Status & Progress ====================
  status: {
    current: {
      type: String,
      enum: ['not_started', 'pending', 'in_progress', 'review', 'completed', 'delayed', 'blocked', 'cancelled', 'skipped'],
      default: 'not_started',
      index: true
    },
    completionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    health: {
      type: String,
      enum: ['on_track', 'at_risk', 'off_track', 'critical'],
      default: 'on_track'
    },
    trend: {
      type: String,
      enum: ['improving', 'stable', 'declining', 'critical']
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
      notes: String,
      evidence: [String]
    }],
    checkpoints: [{
      name: String,
      completed: {
        type: Boolean,
        default: false
      },
      completedAt: Date,
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notes: String
    }],
    readiness: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      criteria: [{
        criterion: String,
        weight: Number,
        score: Number,
        status: {
          type: String,
          enum: ['not_met', 'partial', 'met', 'exceeded']
        }
      }],
      assessment: {
        assessedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        assessedAt: Date,
        comments: String
      }
    }
  },

  // ==================== Deliverables & Outputs ====================
  deliverables: [{
    deliverableId: {
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
      enum: ['document', 'software', 'report', 'presentation', 'training', 'service', 'product', 'other']
    },
    format: String,
    quantity: {
      expected: Number,
      delivered: Number,
      unit: String
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'draft', 'review', 'approved', 'delivered', 'accepted'],
      default: 'pending'
    },
    qualityCriteria: [{
      criterion: String,
      measurement: String,
      target: String,
      actual: String,
      met: Boolean
    }],
    acceptanceCriteria: [{
      criterion: String,
      description: String,
      verificationMethod: String,
      responsible: String,
      accepted: {
        type: Boolean,
        default: false
      },
      acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      acceptedAt: Date,
      comments: String
    }],
    location: {
      type: {
        type: String,
        enum: ['url', 'file_system', 'repository', 'physical', 'email']
      },
      path: String,
      accessInstructions: String
    },
    version: {
      current: String,
      history: [{
        version: String,
        createdAt: Date,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        changes: String,
        location: String
      }]
    },
    reviews: [{
      reviewType: {
        type: String,
        enum: ['peer', 'technical', 'quality', 'client', 'management']
      },
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewDate: Date,
      outcome: {
        type: String,
        enum: ['approved', 'approved_with_conditions', 'requires_revision', 'rejected']
      },
      comments: String,
      actionItems: [String]
    }],
    signoff: {
      required: {
        type: Boolean,
        default: false
      },
      signatories: [{
        role: String,
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        signedOff: {
          type: Boolean,
          default: false
        },
        signedAt: Date,
        signature: String,
        comments: String
      }]
    }
  }],

  // ==================== Financial & Payment ====================
  financial: {
    payment: {
      applicable: {
        type: Boolean,
        default: false
      },
      amount: {
        value: Number,
        currency: {
          type: String,
          default: 'USD'
        }
      },
      percentage: Number,
      condition: {
        type: String,
        enum: ['on_completion', 'on_acceptance', 'on_delivery', 'custom'],
        default: 'on_completion'
      },
      terms: String,
      invoicing: {
        required: Boolean,
        invoiceNumber: String,
        invoiceDate: Date,
        dueDate: Date,
        invoiceStatus: {
          type: String,
          enum: ['pending', 'generated', 'sent', 'received', 'disputed']
        },
        sentTo: [String]
      },
      payment: {
        status: {
          type: String,
          enum: ['pending', 'invoiced', 'paid', 'partial', 'overdue', 'disputed'],
          default: 'pending'
        },
        receivedAmount: Number,
        receivedDate: Date,
        paymentMethod: String,
        transactionReference: String,
        outstanding: Number
      },
      penalties: {
        applicable: Boolean,
        type: {
          type: String,
          enum: ['fixed', 'percentage', 'daily', 'escalating']
        },
        amount: Number,
        conditions: String,
        applied: Boolean,
        appliedAmount: Number
      }
    },
    budget: {
      allocated: {
        labor: Number,
        materials: Number,
        external: Number,
        other: Number,
        total: Number
      },
      consumed: {
        labor: Number,
        materials: Number,
        external: Number,
        other: Number,
        total: Number
      },
      variance: {
        amount: Number,
        percentage: Number,
        reason: String
      },
      forecast: {
        estimateToComplete: Number,
        estimateAtCompletion: Number,
        varianceAtCompletion: Number
      }
    },
    costTracking: [{
      category: String,
      description: String,
      amount: Number,
      date: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reference: String
    }]
  },

  // ==================== Resources & Assignments ====================
  resources: {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    teamLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignments: [{
      resourceId: {
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
      responsibility: String,
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
      skills: [String],
      availability: {
        status: {
          type: String,
          enum: ['available', 'partially_available', 'unavailable', 'on_leave']
        },
        constraints: [String]
      },
      performance: {
        rating: Number,
        feedback: String,
        evaluatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        evaluatedAt: Date
      }
    }],
    effort: {
      estimated: {
        value: Number,
        unit: {
          type: String,
          enum: ['hours', 'days', 'weeks', 'months'],
          default: 'hours'
        }
      },
      actual: {
        value: Number,
        unit: String
      },
      remaining: {
        value: Number,
        unit: String
      },
      tracking: [{
        resourceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        date: Date,
        hours: Number,
        description: String,
        approved: Boolean,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    },
    equipment: [{
      type: String,
      description: String,
      quantity: Number,
      status: {
        type: String,
        enum: ['requested', 'allocated', 'in_use', 'returned']
      },
      cost: Number,
      vendor: String,
      notes: String
    }]
  },

  // ==================== Approval & Governance ====================
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['single', 'sequential', 'parallel', 'voting', 'consensus']
    },
    approvers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        required: true
      },
      sequence: Number,
      required: {
        type: Boolean,
        default: true
      },
      status: {
        type: String,
        enum: ['pending', 'reviewing', 'approved', 'rejected', 'abstained'],
        default: 'pending'
      },
      decision: {
        type: String,
        enum: ['approve', 'approve_with_conditions', 'reject', 'defer']
      },
      decisionDate: Date,
      conditions: [String],
      comments: String,
      delegation: {
        delegatedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        delegatedAt: Date,
        reason: String
      }
    }],
    escalation: {
      required: Boolean,
      level: Number,
      escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      escalatedAt: Date,
      reason: String,
      resolution: String
    },
    finalApproval: {
      approved: {
        type: Boolean,
        default: false
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      documentRef: String,
      conditions: [String],
      validity: {
        from: Date,
        to: Date
      }
    },
    compliance: {
      regulations: [{
        regulation: String,
        applicable: Boolean,
        compliant: Boolean,
        verifiedBy: String,
        verifiedAt: Date,
        evidence: [String]
      }],
      audits: [{
        type: String,
        auditor: String,
        date: Date,
        findings: String,
        actions: [String],
        status: String
      }]
    }
  },

  // ==================== Risk & Issues ====================
  risks: [{
    riskId: String,
    description: String,
    category: {
      type: String,
      enum: ['technical', 'schedule', 'resource', 'external', 'quality', 'financial']
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
    mitigation: {
      strategy: String,
      actions: [{
        action: String,
        owner: String,
        dueDate: Date,
        status: String
      }]
    },
    status: {
      type: String,
      enum: ['identified', 'assessed', 'mitigating', 'monitoring', 'closed', 'realized']
    }
  }],

  issues: [{
    issueId: String,
    description: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    impact: {
      schedule: String,
      cost: String,
      quality: String
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated']
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolution: String,
    resolvedDate: Date
  }],

  // ==================== Communication & Reporting ====================
  communication: {
    stakeholders: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String,
      email: String,
      role: String,
      organization: String,
      notificationPreference: {
        type: String,
        enum: ['all', 'critical_only', 'summary', 'none'],
        default: 'all'
      },
      channels: {
        email: Boolean,
        sms: Boolean,
        slack: Boolean,
        teams: Boolean
      }
    }],
    notifications: {
      settings: {
        enableNotifications: {
          type: Boolean,
          default: true
        },
        notifyOnStart: Boolean,
        notifyOnCompletion: Boolean,
        notifyOnDelay: Boolean,
        notifyOnBlock: Boolean,
        reminderDays: [Number]
      },
      history: [{
        type: {
          type: String,
          enum: ['reminder', 'status_change', 'delay', 'completion', 'escalation']
        },
        sentTo: [String],
        sentAt: Date,
        channel: String,
        subject: String,
        content: String,
        delivered: Boolean,
        read: Boolean
      }]
    },
    meetings: [{
      type: {
        type: String,
        enum: ['planning', 'review', 'gate', 'escalation', 'retrospective']
      },
      scheduledDate: Date,
      actualDate: Date,
      attendees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      agenda: [String],
      minutes: String,
      decisions: [{
        decision: String,
        owner: String,
        dueDate: Date
      }],
      actionItems: [{
        action: String,
        owner: String,
        dueDate: Date,
        status: String
      }],
      recording: {
        url: String,
        duration: Number,
        transcript: String
      }
    }],
    reports: [{
      type: {
        type: String,
        enum: ['status', 'progress', 'exception', 'completion', 'audit']
      },
      generatedAt: Date,
      generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      period: {
        from: Date,
        to: Date
      },
      content: String,
      format: String,
      distribution: [String],
      url: String
    }]
  },

  // ==================== Quality & Performance ====================
  quality: {
    standards: [{
      standard: String,
      version: String,
      applicable: Boolean,
      compliance: {
        type: String,
        enum: ['compliant', 'partial', 'non_compliant', 'not_assessed']
      },
      assessmentDate: Date,
      assessor: String,
      findings: String
    }],
    metrics: [{
      metric: String,
      description: String,
      target: {
        value: Number,
        unit: String
      },
      actual: {
        value: Number,
        unit: String
      },
      variance: Number,
      status: {
        type: String,
        enum: ['exceeding', 'meeting', 'below', 'critical']
      },
      trend: {
        type: String,
        enum: ['improving', 'stable', 'declining']
      },
      lastMeasured: Date,
      measuredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    reviews: [{
      reviewType: {
        type: String,
        enum: ['peer', 'technical', 'gate', 'quality', 'client']
      },
      scheduledDate: Date,
      completedDate: Date,
      reviewers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      checklist: [{
        item: String,
        status: {
          type: String,
          enum: ['pass', 'fail', 'partial', 'not_applicable']
        },
        comments: String
      }],
      findings: {
        strengths: [String],
        weaknesses: [String],
        recommendations: [String],
        actionItems: [{
          action: String,
          priority: String,
          owner: String,
          dueDate: Date
        }]
      },
      outcome: {
        type: String,
        enum: ['approved', 'approved_with_conditions', 'requires_rework', 'rejected']
      },
      followUp: {
        required: Boolean,
        scheduledDate: Date,
        completed: Boolean
      }
    }],
    testing: {
      testPlan: String,
      testCases: [{
        caseId: String,
        description: String,
        expectedResult: String,
        actualResult: String,
        status: {
          type: String,
          enum: ['pending', 'pass', 'fail', 'blocked', 'skipped']
        },
        testedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        testedAt: Date,
        defects: [String]
      }],
      coverage: {
        planned: Number,
        executed: Number,
        passed: Number,
        failed: Number,
        percentage: Number
      }
    }
  },

  // ==================== Documents & Artifacts ====================
  documents: [{
    documentId: String,
    type: {
      type: String,
      enum: ['requirement', 'design', 'plan', 'report', 'approval', 'evidence', 'other']
    },
    name: String,
    description: String,
    version: String,
    location: {
      type: {
        type: String,
        enum: ['url', 'sharepoint', 'drive', 'repository', 'database']
      },
      path: String,
      credentials: String
    },
    size: Number,
    mimeType: String,
    checksum: String,
    classification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    },
    metadata: {
      author: String,
      createdDate: Date,
      modifiedDate: Date,
      keywords: [String],
      language: String
    },
    access: {
      permissions: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        role: String,
        permission: {
          type: String,
          enum: ['read', 'write', 'delete', 'admin']
        }
      }],
      sharedWith: [String],
      expiryDate: Date
    },
    retention: {
      policy: String,
      retainUntil: Date,
      archived: Boolean,
      archivedDate: Date
    }
  }],

  // ==================== Integration & External Systems ====================
  integrations: {
    externalId: {
      jira: String,
      asana: String,
      microsoftProject: String,
      servicenow: String,
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
      status: {
        type: String,
        enum: ['active', 'paused', 'error', 'disabled']
      },
      errors: [{
        date: Date,
        error: String,
        resolved: Boolean
      }]
    },
    webhooks: [{
      url: String,
      events: [String],
      active: Boolean,
      secret: String,
      lastTriggered: Date,
      failureCount: Number
    }],
    apiCalls: [{
      service: String,
      endpoint: String,
      method: String,
      timestamp: Date,
      status: Number,
      responseTime: Number
    }]
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    performance: {
      schedulePerformanceIndex: Number,
      costPerformanceIndex: Number,
      qualityIndex: Number,
      velocityTrend: [Number],
      efficiency: Number
    },
    predictions: {
      completionProbability: Number,
      delayRisk: {
        probability: Number,
        days: Number,
        factors: [String]
      },
      budgetOverrunRisk: {
        probability: Number,
        amount: Number
      },
      successProbability: Number
    },
    insights: [{
      type: {
        type: String,
        enum: ['risk', 'opportunity', 'recommendation', 'warning']
      },
      category: String,
      description: String,
      impact: String,
      suggestedAction: String,
      priority: String,
      generatedAt: Date,
      acknowledged: Boolean,
      actionTaken: String
    }],
    benchmarks: {
      againstBaseline: {
        schedule: Number,
        cost: Number,
        quality: Number
      },
      againstSimilar: {
        percentile: Number,
        ranking: Number,
        total: Number
      },
      industryComparison: {
        category: String,
        performance: String,
        percentile: Number
      }
    }
  },

  // ==================== Lessons Learned ====================
  lessonsLearned: [{
    category: {
      type: String,
      enum: ['planning', 'execution', 'risk', 'quality', 'communication', 'other']
    },
    type: {
      type: String,
      enum: ['success', 'challenge', 'failure', 'best_practice']
    },
    description: String,
    impact: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    rootCause: String,
    recommendation: String,
    applicability: {
      type: String,
      enum: ['specific', 'similar_milestones', 'all_milestones', 'organization_wide']
    },
    preventiveAction: String,
    documentedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    documentedAt: Date,
    validated: Boolean,
    sharedWith: [String]
  }],

  // ==================== Custom Fields & Metadata ====================
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'template', 'clone', 'api', 'integration']
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
      isCriticalPath: {
        type: Boolean,
        default: false
      },
      isContractual: {
        type: Boolean,
        default: false
      },
      requiresClientApproval: {
        type: Boolean,
        default: false
      },
      isRegulatory: {
        type: Boolean,
        default: false
      },
      isPaymentMilestone: {
        type: Boolean,
        default: false
      }
    },
    version: {
      type: Number,
      default: 1
    },
    changeLog: [{
      version: Number,
      changedAt: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changes: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      },
      reason: String
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
    reason: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
};

// Create schema
const milestoneSchema = BaseModel.createSchema(milestoneSchemaDefinition, {
  collection: 'project_milestones',
  timestamps: true
});

// ==================== Indexes ====================
milestoneSchema.index({ tenantId: 1, milestoneCode: 1 }, { unique: true });
milestoneSchema.index({ tenantId: 1, projectId: 1, 'status.current': 1 });
milestoneSchema.index({ tenantId: 1, projectId: 1, 'timeline.plannedDate': 1 });
milestoneSchema.index({ tenantId: 1, 'resources.owner': 1 });
milestoneSchema.index({ tenantId: 1, 'classification.criticality': 1 });
milestoneSchema.index({ tenantId: 1, 'status.current': 1, 'status.health': 1 });
milestoneSchema.index({ tenantId: 1, 'financial.payment.status': 1 });
milestoneSchema.index({ tenantId: 1, searchTokens: 1 });
milestoneSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
milestoneSchema.index({
  name: 'text',
  description: 'text',
  'deliverables.name': 'text',
  'deliverables.description': 'text'
});

// ==================== Virtual Fields ====================
milestoneSchema.virtual('daysUntilDue').get(function() {
  if (this.timeline.plannedDate) {
    const days = Math.floor((this.timeline.plannedDate - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  }
  return null;
});

milestoneSchema.virtual('isOverdue').get(function() {
  return this.timeline.plannedDate < new Date() && this.status.current !== 'completed';
});

milestoneSchema.virtual('slippage').get(function() {
  if (this.timeline.forecastDate && this.timeline.plannedDate) {
    const days = Math.floor((this.timeline.forecastDate - this.timeline.plannedDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }
  return 0;
});

milestoneSchema.virtual('effortVariance').get(function() {
  if (this.resources.effort.estimated.value && this.resources.effort.actual.value) {
    return ((this.resources.effort.actual.value - this.resources.effort.estimated.value) / 
            this.resources.effort.estimated.value) * 100;
  }
  return 0;
});

milestoneSchema.virtual('costVariance').get(function() {
  if (this.financial.budget.allocated.total && this.financial.budget.consumed.total) {
    return ((this.financial.budget.consumed.total - this.financial.budget.allocated.total) / 
            this.financial.budget.allocated.total) * 100;
  }
  return 0;
});

milestoneSchema.virtual('completedDeliverables').get(function() {
  return this.deliverables.filter(d => d.status === 'accepted').length;
});

milestoneSchema.virtual('totalDeliverables').get(function() {
  return this.deliverables.length;
});

milestoneSchema.virtual('deliverableCompletionRate').get(function() {
  if (this.totalDeliverables > 0) {
    return (this.completedDeliverables / this.totalDeliverables) * 100;
  }
  return 0;
});

// ==================== Pre-save Middleware ====================
milestoneSchema.pre('save', async function(next) {
  try {
    // Generate milestone code if not provided
    if (!this.milestoneCode && this.isNew) {
      this.milestoneCode = await this.constructor.generateMilestoneCode(this.tenantId, this.projectId);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate completion percentage
    if (this.isModified('deliverables') || this.isModified('status.checkpoints')) {
      this.calculateCompletionPercentage();
    }

    // Update milestone health
    if (this.isModified('status') || this.isModified('timeline') || this.isModified('risks')) {
      this.updateMilestoneHealth();
    }

    // Calculate financial variance
    if (this.isModified('financial.budget')) {
      this.calculateFinancialVariance();
    }

    // Update analytics
    if (this.isModified('status') || this.isModified('timeline') || this.isModified('resources')) {
      this.updateAnalytics();
    }

    // Check for critical path
    if (this.isModified('dependencies')) {
      await this.updateCriticalPath();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
milestoneSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add milestone name tokens
  if (this.name) {
    this.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add milestone code
  if (this.milestoneCode) {
    tokens.add(this.milestoneCode.toLowerCase());
  }
  
  // Add tags
  if (this.classification.tags) {
    this.classification.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  // Add deliverable names
  this.deliverables.forEach(d => {
    if (d.name) {
      d.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
  });
  
  this.searchTokens = Array.from(tokens);
};

milestoneSchema.methods.calculateCompletionPercentage = function() {
  let totalWeight = 0;
  let completedWeight = 0;
  
  // Weight deliverables (60%)
  if (this.deliverables.length > 0) {
    const deliverableWeight = 60;
    const completedDeliverables = this.deliverables.filter(d => d.status === 'accepted').length;
    completedWeight += (completedDeliverables / this.deliverables.length) * deliverableWeight;
    totalWeight += deliverableWeight;
  }
  
  // Weight checkpoints (40%)
  if (this.status.checkpoints && this.status.checkpoints.length > 0) {
    const checkpointWeight = 40;
    const completedCheckpoints = this.status.checkpoints.filter(c => c.completed).length;
    completedWeight += (completedCheckpoints / this.status.checkpoints.length) * checkpointWeight;
    totalWeight += checkpointWeight;
  }
  
  this.status.completionPercentage = totalWeight > 0 
    ? Math.round((completedWeight / totalWeight) * 100)
    : 0;
};

milestoneSchema.methods.updateMilestoneHealth = function() {
  let healthScore = 100;
  
  // Schedule health (40% weight)
  if (this.isOverdue) {
    healthScore -= 40;
  } else if (this.daysUntilDue < 7 && this.status.completionPercentage < 80) {
    healthScore -= 25;
  } else if (this.slippage > 0) {
    healthScore -= Math.min(20, this.slippage * 2);
  }
  
  // Deliverable health (30% weight)
  if (this.deliverableCompletionRate < 50 && this.daysUntilDue < 14) {
    healthScore -= 30;
  } else if (this.deliverableCompletionRate < 75 && this.daysUntilDue < 7) {
    healthScore -= 20;
  }
  
  // Risk health (20% weight)
  const highRisks = this.risks.filter(r => 
    (r.probability === 'high' || r.probability === 'very_high') && 
    r.status !== 'closed'
  ).length;
  if (highRisks > 2) {
    healthScore -= 20;
  } else if (highRisks > 0) {
    healthScore -= 10;
  }
  
  // Issue health (10% weight)
  const criticalIssues = this.issues.filter(i => 
    i.severity === 'critical' && i.status !== 'resolved'
  ).length;
  if (criticalIssues > 0) {
    healthScore -= 10;
  }
  
  // Determine health status
  if (healthScore >= 85) {
    this.status.health = 'on_track';
  } else if (healthScore >= 70) {
    this.status.health = 'at_risk';
  } else if (healthScore >= 50) {
    this.status.health = 'off_track';
  } else {
    this.status.health = 'critical';
  }
};

milestoneSchema.methods.calculateFinancialVariance = function() {
  const budget = this.financial.budget;
  
  if (budget.allocated.total > 0) {
    budget.variance.amount = budget.consumed.total - budget.allocated.total;
    budget.variance.percentage = (budget.variance.amount / budget.allocated.total) * 100;
  }
  
  // Update forecast
  if (this.status.completionPercentage > 0) {
    const burnRate = budget.consumed.total / this.status.completionPercentage;
    budget.forecast.estimateAtCompletion = burnRate * 100;
    budget.forecast.estimateToComplete = budget.forecast.estimateAtCompletion - budget.consumed.total;
    budget.forecast.varianceAtCompletion = budget.forecast.estimateAtCompletion - budget.allocated.total;
  }
};

milestoneSchema.methods.updateAnalytics = function() {
  // Calculate Schedule Performance Index (SPI)
  if (this.timeline.plannedDate && this.timeline.baselineDate) {
    const plannedDuration = Math.floor((this.timeline.plannedDate - this.timeline.baselineDate) / (1000 * 60 * 60 * 24));
    const actualDuration = Math.floor((new Date() - this.timeline.baselineDate) / (1000 * 60 * 60 * 24));
    
    if (actualDuration > 0) {
      this.analytics.performance.schedulePerformanceIndex = 
        (this.status.completionPercentage / 100) / (actualDuration / plannedDuration);
    }
  }
  
  // Calculate Cost Performance Index (CPI)
  if (this.financial.budget.allocated.total > 0 && this.financial.budget.consumed.total > 0) {
    this.analytics.performance.costPerformanceIndex = 
      (this.status.completionPercentage / 100) * this.financial.budget.allocated.total / 
      this.financial.budget.consumed.total;
  }
  
  // Calculate Quality Index
  if (this.quality.metrics.length > 0) {
    const metricScores = this.quality.metrics.map(m => {
      if (m.target.value && m.actual.value) {
        return Math.min(100, (m.actual.value / m.target.value) * 100);
      }
      return 100;
    });
    this.analytics.performance.qualityIndex = 
      metricScores.reduce((a, b) => a + b, 0) / metricScores.length;
  }
  
  // Update predictions
  this.updatePredictions();
};

milestoneSchema.methods.updatePredictions = function() {
  // Completion probability
  let completionProb = 100;
  
  if (this.isOverdue) {
    completionProb -= 30;
  }
  
  if (this.status.health === 'critical') {
    completionProb -= 25;
  } else if (this.status.health === 'off_track') {
    completionProb -= 15;
  }
  
  const blockers = this.dependencies.blockedBy.filter(b => !b.resolved).length;
  completionProb -= blockers * 10;
  
  this.analytics.predictions.completionProbability = Math.max(0, Math.min(100, completionProb));
  
  // Delay risk
  if (this.slippage > 0 || this.status.health === 'off_track' || this.status.health === 'critical') {
    this.analytics.predictions.delayRisk.probability = 
      this.status.health === 'critical' ? 80 : 
      this.status.health === 'off_track' ? 60 : 30;
    
    this.analytics.predictions.delayRisk.days = Math.ceil(this.slippage * 1.5);
  }
  
  // Budget overrun risk
  if (this.costVariance > 10) {
    this.analytics.predictions.budgetOverrunRisk.probability = Math.min(90, this.costVariance * 2);
    this.analytics.predictions.budgetOverrunRisk.amount = 
      this.financial.budget.forecast.varianceAtCompletion || 0;
  }
};

milestoneSchema.methods.updateCriticalPath = async function() {
  // This would typically involve complex graph algorithms
  // Simplified version for demonstration
  const hasCriticalDependencies = this.dependencies.predecessors.some(p => p.criticalPath);
  
  if (hasCriticalDependencies || this.classification.criticality === 'critical_path') {
    this.metadata.flags.isCriticalPath = true;
  }
};

milestoneSchema.methods.addDeliverable = async function(deliverableData) {
  const deliverable = {
    deliverableId: `DEL-${this.deliverables.length + 1}`,
    name: deliverableData.name,
    description: deliverableData.description,
    type: deliverableData.type,
    format: deliverableData.format,
    quantity: deliverableData.quantity,
    status: 'pending',
    qualityCriteria: deliverableData.qualityCriteria,
    acceptanceCriteria: deliverableData.acceptanceCriteria,
    version: {
      current: '1.0',
      history: [{
        version: '1.0',
        createdAt: new Date(),
        createdBy: deliverableData.createdBy,
        changes: 'Initial version'
      }]
    }
  };
  
  this.deliverables.push(deliverable);
  
  await this.save();
  
  logger.info('Deliverable added to milestone', {
    milestoneId: this._id,
    deliverableId: deliverable.deliverableId
  });
  
  return deliverable;
};

milestoneSchema.methods.updateDeliverable = async function(deliverableId, updates, userId) {
  const deliverable = this.deliverables.find(d => d.deliverableId === deliverableId);
  
  if (!deliverable) {
    throw new AppError('Deliverable not found', 404, 'DELIVERABLE_NOT_FOUND');
  }
  
  // Track version if content changed
  if (updates.name || updates.description || updates.acceptanceCriteria) {
    const currentVersion = deliverable.version.current;
    const versionParts = currentVersion.split('.');
    versionParts[1] = parseInt(versionParts[1]) + 1;
    
    deliverable.version.history.push({
      version: deliverable.version.current,
      createdAt: new Date(),
      createdBy: userId,
      changes: updates.changeDescription || 'Updated'
    });
    
    deliverable.version.current = versionParts.join('.');
  }
  
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key !== 'changeDescription') {
      deliverable[key] = updates[key];
    }
  });
  
  await this.save();
  
  return deliverable;
};

milestoneSchema.methods.requestApproval = async function(approverId, role) {
  if (!this.approval.required) {
    this.approval.required = true;
  }
  
  const approver = {
    userId: approverId,
    role: role,
    status: 'pending',
    required: true
  };
  
  this.approval.approvers.push(approver);
  
  await this.save();
  
  logger.info('Approval requested for milestone', {
    milestoneId: this._id,
    approverId: approverId
  });
  
  return approver;
};

milestoneSchema.methods.approve = async function(approverId, decision, comments, conditions) {
  const approver = this.approval.approvers.find(a => 
    a.userId.toString() === approverId.toString() && a.status === 'pending'
  );
  
  if (!approver) {
    throw new AppError('Approver not found or already decided', 404, 'APPROVER_NOT_FOUND');
  }
  
  approver.status = decision === 'approve' ? 'approved' : 'rejected';
  approver.decision = decision;
  approver.decisionDate = new Date();
  approver.comments = comments;
  approver.conditions = conditions || [];
  
  // Check if all required approvers have approved
  const allApproved = this.approval.approvers
    .filter(a => a.required)
    .every(a => a.status === 'approved');
  
  if (allApproved) {
    this.approval.finalApproval.approved = true;
    this.approval.finalApproval.approvedAt = new Date();
    this.approval.finalApproval.conditions = this.approval.approvers
      .filter(a => a.conditions && a.conditions.length > 0)
      .flatMap(a => a.conditions);
  }
  
  await this.save();
  
  logger.info('Milestone approval recorded', {
    milestoneId: this._id,
    approverId: approverId,
    decision: decision
  });
  
  return this.approval;
};

milestoneSchema.methods.complete = async function(completionData, userId) {
  if (this.status.current === 'completed') {
    throw new AppError('Milestone already completed', 400, 'MILESTONE_ALREADY_COMPLETED');
  }
  
  // Validate all deliverables are accepted
  const unacceptedDeliverables = this.deliverables.filter(d => d.status !== 'accepted');
  if (unacceptedDeliverables.length > 0) {
    throw new AppError('Cannot complete milestone with unaccepted deliverables', 400, 'UNACCEPTED_DELIVERABLES');
  }
  
  // Update status
  this.status.current = 'completed';
  this.status.completionPercentage = 100;
  this.timeline.actualDate = new Date();
  
  // Record status change
  this.status.statusHistory.push({
    status: 'completed',
    changedFrom: this.status.current,
    changedTo: 'completed',
    changedAt: new Date(),
    changedBy: userId,
    reason: 'Milestone completed',
    notes: completionData.notes,
    evidence: completionData.evidence || []
  });
  
  // Update effort tracking
  if (completionData.actualEffort) {
    this.resources.effort.actual = completionData.actualEffort;
  }
  
  // Calculate final metrics
  this.updateAnalytics();
  
  await this.save();
  
  logger.info('Milestone completed', {
    milestoneId: this._id,
    milestoneCode: this.milestoneCode,
    completedBy: userId
  });
  
  return true;
};

milestoneSchema.methods.generateReport = async function() {
  const report = {
    milestoneCode: this.milestoneCode,
    name: this.name,
    status: this.status.current,
    health: this.status.health,
    completionPercentage: this.status.completionPercentage,
    timeline: {
      planned: this.timeline.plannedDate,
      forecast: this.timeline.forecastDate,
      actual: this.timeline.actualDate,
      daysUntilDue: this.daysUntilDue,
      isOverdue: this.isOverdue,
      slippage: this.slippage
    },
    deliverables: {
      total: this.totalDeliverables,
      completed: this.completedDeliverables,
      completionRate: this.deliverableCompletionRate
    },
    financial: {
      allocated: this.financial.budget.allocated.total,
      consumed: this.financial.budget.consumed.total,
      variance: this.financial.budget.variance,
      payment: this.financial.payment
    },
    risks: {
      total: this.risks.length,
      high: this.risks.filter(r => r.probability === 'high' || r.impact === 'severe').length,
      open: this.risks.filter(r => r.status !== 'closed').length
    },
    issues: {
      total: this.issues.length,
      critical: this.issues.filter(i => i.severity === 'critical').length,
      open: this.issues.filter(i => i.status !== 'resolved').length
    },
    analytics: this.analytics,
    approval: this.approval.finalApproval
  };
  
  return report;
};

// ==================== Static Methods ====================
milestoneSchema.statics.generateMilestoneCode = async function(tenantId, projectId) {
  const project = await mongoose.model('Project').findById(projectId).select('projectCode');
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }
  
  const count = await this.countDocuments({ tenantId, projectId });
  const sequence = (count + 1).toString().padStart(3, '0');
  
  return `MS-${project.projectCode}-${sequence}`;
};

milestoneSchema.statics.findByProject = async function(projectId, options = {}) {
  const {
    status,
    criticality,
    phase,
    dateRange,
    limit = 50,
    skip = 0,
    sort = { 'timeline.plannedDate': 1 }
  } = options;
  
  const query = { projectId };
  
  if (status) {
    query['status.current'] = status;
  }
  
  if (criticality) {
    query['classification.criticality'] = criticality;
  }
  
  if (phase) {
    query['classification.phase'] = phase;
  }
  
  if (dateRange) {
    query['timeline.plannedDate'] = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }
  
  const [milestones, total] = await Promise.all([
    this.find(query)
      .populate('resources.owner', 'profile.firstName profile.lastName email')
      .populate('resources.assignments.resourceId', 'profile.firstName profile.lastName')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -auditLog'),
    this.countDocuments(query)
  ]);
  
  return {
    milestones,
    total,
    hasMore: total > skip + milestones.length
  };
};

milestoneSchema.statics.getCriticalPath = async function(projectId) {
  const milestones = await this.find({ 
    projectId,
    'metadata.flags.isCriticalPath': true,
    'status.current': { $ne: 'completed' }
  })
  .sort({ 'timeline.plannedDate': 1 })
  .select('milestoneCode name timeline.plannedDate status.current dependencies.predecessors');
  
  // Build dependency graph and calculate critical path
  // This is a simplified version - real implementation would use CPM algorithm
  
  return milestones;
};

milestoneSchema.statics.getUpcomingMilestones = async function(tenantId, days = 30) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return await this.find({
    tenantId,
    'timeline.plannedDate': {
      $gte: new Date(),
      $lte: endDate
    },
    'status.current': { $nin: ['completed', 'cancelled'] }
  })
  .populate('projectId', 'projectCode name')
  .populate('resources.owner', 'profile.firstName profile.lastName email')
  .sort({ 'timeline.plannedDate': 1 })
  .select('milestoneCode name timeline.plannedDate status classification.criticality');
};

// ==================== Create Model ====================
const ProjectMilestoneModel = BaseModel.createModel('ProjectMilestone', milestoneSchema, {
  collection: 'project_milestones',
  enableTimestamps: true,
  enableAudit: true
});

module.exports = ProjectMilestoneModel;