'use strict';

/**
 * @fileoverview Enhanced project timeline model with comprehensive scheduling and critical path management
 * @module servers/customer-services/modules/core-business/projects/models/project-timeline-model
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
 * Enhanced timeline schema definition for enterprise project scheduling
 */
const timelineSchemaDefinition = {
  // ==================== Core Identity ====================
  timelineCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^TL-[A-Z0-9]{8,}$/,
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

  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },

  // ==================== Timeline Configuration ====================
  configuration: {
    type: {
      type: String,
      enum: ['master', 'baseline', 'forecast', 'actual', 'scenario', 'comparison'],
      required: true,
      default: 'master'
    },
    version: {
      major: {
        type: Number,
        default: 1
      },
      minor: {
        type: Number,
        default: 0
      },
      patch: {
        type: Number,
        default: 0
      },
      label: String
    },
    methodology: {
      type: String,
      enum: ['waterfall', 'agile', 'scrum', 'kanban', 'hybrid', 'critical_chain', 'pert'],
      required: true
    },
    scheduling: {
      method: {
        type: String,
        enum: ['forward', 'backward', 'critical_path', 'resource_leveling', 'fast_tracking'],
        default: 'forward'
      },
      autoSchedule: {
        type: Boolean,
        default: true
      },
      constraintHandling: {
        type: String,
        enum: ['honor_all', 'ignore_all', 'flexible', 'strict'],
        default: 'flexible'
      },
      effortDriven: {
        type: Boolean,
        default: true
      },
      updateFrequency: {
        type: String,
        enum: ['realtime', 'hourly', 'daily', 'weekly', 'manual'],
        default: 'daily'
      }
    },
    display: {
      defaultView: {
        type: String,
        enum: ['gantt', 'calendar', 'network', 'timeline', 'kanban', 'list'],
        default: 'gantt'
      },
      timeScale: {
        type: String,
        enum: ['hours', 'days', 'weeks', 'months', 'quarters', 'years'],
        default: 'weeks'
      },
      showDependencies: {
        type: Boolean,
        default: true
      },
      showCriticalPath: {
        type: Boolean,
        default: true
      },
      showResources: {
        type: Boolean,
        default: true
      },
      colorScheme: String,
      customizations: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    }
  },

  // ==================== Schedule Boundaries ====================
  boundaries: {
    projectStart: {
      baseline: {
        type: Date,
        required: true,
        index: true
      },
      planned: {
        type: Date,
        required: true,
        index: true
      },
      forecast: Date,
      actual: Date,
      constraints: {
        mustStartOn: Date,
        startNoEarlierThan: Date,
        startNoLaterThan: Date
      }
    },
    projectEnd: {
      baseline: {
        type: Date,
        required: true,
        index: true
      },
      planned: {
        type: Date,
        required: true,
        index: true
      },
      forecast: Date,
      actual: Date,
      constraints: {
        mustFinishOn: Date,
        finishNoEarlierThan: Date,
        finishNoLaterThan: Date
      }
    },
    phases: [{
      phaseId: String,
      name: String,
      startDate: Date,
      endDate: Date,
      duration: Number,
      status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed', 'on_hold']
      },
      completionPercentage: Number,
      milestones: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectMilestone'
      }]
    }],
    blackoutPeriods: [{
      startDate: Date,
      endDate: Date,
      reason: String,
      type: {
        type: String,
        enum: ['holiday', 'maintenance', 'freeze', 'external', 'other']
      },
      affectedResources: [String],
      workaround: String
    }],
    buffers: {
      project: {
        days: Number,
        type: {
          type: String,
          enum: ['fixed', 'percentage', 'calculated']
        },
        consumption: Number
      },
      feeding: [{
        pathId: String,
        days: Number,
        consumption: Number
      }],
      resource: [{
        resourceId: String,
        days: Number,
        consumption: Number
      }],
      capacity: {
        days: Number,
        consumption: Number
      }
    }
  },

  // ==================== Calendar Management ====================
  calendar: {
    workingCalendar: {
      name: String,
      type: {
        type: String,
        enum: ['standard', 'custom', '24x7', 'night_shift', 'weekend'],
        default: 'standard'
      },
      workingDays: {
        monday: {
          working: { type: Boolean, default: true },
          hours: { start: String, end: String }
        },
        tuesday: {
          working: { type: Boolean, default: true },
          hours: { start: String, end: String }
        },
        wednesday: {
          working: { type: Boolean, default: true },
          hours: { start: String, end: String }
        },
        thursday: {
          working: { type: Boolean, default: true },
          hours: { start: String, end: String }
        },
        friday: {
          working: { type: Boolean, default: true },
          hours: { start: String, end: String }
        },
        saturday: {
          working: { type: Boolean, default: false },
          hours: { start: String, end: String }
        },
        sunday: {
          working: { type: Boolean, default: false },
          hours: { start: String, end: String }
        }
      },
      hoursPerDay: {
        type: Number,
        default: 8
      },
      daysPerWeek: {
        type: Number,
        default: 5
      },
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
        enum: ['public', 'company', 'regional', 'religious', 'custom']
      },
      recurring: {
        type: Boolean,
        default: false
      },
      affectedLocations: [String],
      observance: {
        type: String,
        enum: ['full_day', 'half_day', 'optional']
      }
    }],
    exceptions: [{
      date: Date,
      type: {
        type: String,
        enum: ['working', 'non_working', 'half_day', 'extended']
      },
      hours: {
        start: String,
        end: String
      },
      reason: String,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    resourceCalendars: [{
      resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectResource'
      },
      customCalendar: Boolean,
      exceptions: [{
        date: Date,
        available: Boolean,
        hours: Number,
        reason: String
      }]
    }]
  },

  // ==================== Tasks & Activities ====================
  tasks: [{
    taskId: {
      type: String,
      required: true,
      unique: true
    },
    wbsCode: {
      type: String,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    type: {
      type: String,
      enum: ['summary', 'task', 'milestone', 'recurring', 'hammock'],
      default: 'task'
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium'
    },
    effort: {
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
      },
      remaining: {
        value: Number,
        unit: String
      },
      effortDriven: Boolean
    },
    duration: {
      estimated: Number,
      actual: Number,
      remaining: Number,
      unit: {
        type: String,
        enum: ['hours', 'days', 'weeks', 'months'],
        default: 'days'
      }
    },
    schedule: {
      earlyStart: Date,
      earlyFinish: Date,
      lateStart: Date,
      lateFinish: Date,
      plannedStart: Date,
      plannedFinish: Date,
      actualStart: Date,
      actualFinish: Date,
      baselineStart: Date,
      baselineFinish: Date,
      constraints: {
        type: {
          type: String,
          enum: ['asap', 'alap', 'must_start_on', 'must_finish_on', 'start_no_earlier_than', 'start_no_later_than', 'finish_no_earlier_than', 'finish_no_later_than']
        },
        date: Date
      }
    },
    progress: {
      percentageComplete: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      physicalPercentComplete: Number,
      earnedValue: Number,
      actualCost: Number,
      remainingCost: Number
    },
    dependencies: {
      predecessors: [{
        taskId: String,
        type: {
          type: String,
          enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
          default: 'finish_to_start'
        },
        lag: {
          value: Number,
          unit: String
        },
        driving: Boolean
      }],
      successors: [{
        taskId: String,
        type: {
          type: String,
          enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']
        },
        lag: {
          value: Number,
          unit: String
        }
      }]
    },
    resources: [{
      resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProjectResource'
      },
      allocation: Number,
      role: String,
      effort: Number,
      cost: Number
    }],
    deliverables: [{
      name: String,
      type: String,
      dueDate: Date,
      status: String
    }],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }],

  // ==================== Critical Path Analysis ====================
  criticalPath: {
    paths: [{
      pathId: String,
      tasks: [String],
      totalDuration: Number,
      totalFloat: Number,
      isCritical: Boolean,
      probability: Number,
      risk: {
        level: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        },
        factors: [String]
      }
    }],
    analysis: {
      method: {
        type: String,
        enum: ['cpm', 'pert', 'monte_carlo', 'ccpm'],
        default: 'cpm'
      },
      lastCalculated: Date,
      totalPaths: Number,
      criticalPathCount: Number,
      nearCriticalThreshold: {
        type: Number,
        default: 5
      },
      nearCriticalPaths: Number,
      longestPath: {
        pathId: String,
        duration: Number,
        tasks: Number
      },
      sensitivity: [{
        taskId: String,
        impact: Number,
        criticality: Number
      }]
    },
    floatAnalysis: {
      totalFloat: [{
        taskId: String,
        float: Number,
        category: {
          type: String,
          enum: ['critical', 'near_critical', 'normal', 'high_float']
        }
      }],
      freeFloat: [{
        taskId: String,
        float: Number
      }],
      projectFloat: Number,
      consumedFloat: Number
    },
    optimization: {
      opportunities: [{
        type: {
          type: String,
          enum: ['fast_tracking', 'crashing', 'resource_optimization', 'scope_reduction']
        },
        description: String,
        impact: {
          duration: Number,
          cost: Number,
          risk: String
        },
        recommended: Boolean
      }],
      appliedOptimizations: [{
        type: String,
        appliedDate: Date,
        impact: {
          before: Number,
          after: Number,
          saved: Number
        },
        appliedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    }
  },

  // ==================== Resource Leveling ====================
  resourceLeveling: {
    enabled: {
      type: Boolean,
      default: false
    },
    method: {
      type: String,
      enum: ['automatic', 'manual', 'priority_based', 'critical_chain'],
      default: 'automatic'
    },
    settings: {
      resolveOverallocations: Boolean,
      levelingOrder: {
        type: String,
        enum: ['standard', 'priority_then_standard', 'id_only'],
        default: 'standard'
      },
      levelingRange: {
        type: String,
        enum: ['entire_project', 'date_range', 'selected_tasks'],
        default: 'entire_project'
      },
      canSplitTasks: Boolean,
      canDelayTasks: Boolean,
      honorConstraints: Boolean,
      maxDelay: {
        value: Number,
        unit: String
      }
    },
    results: {
      lastLeveled: Date,
      overallocations: [{
        resourceId: String,
        date: Date,
        allocated: Number,
        available: Number,
        overallocation: Number
      }],
      adjustments: [{
        taskId: String,
        originalStart: Date,
        leveledStart: Date,
        delay: Number,
        reason: String
      }],
      impact: {
        originalDuration: Number,
        leveledDuration: Number,
        extension: Number,
        affectedTasks: Number
      }
    },
    conflicts: [{
      resourceId: String,
      conflictDates: [Date],
      conflictingTasks: [String],
      resolution: {
        type: String,
        enum: ['delay', 'split', 'reassign', 'overtime', 'unresolved']
      },
      resolvedDate: Date
    }]
  },

  // ==================== Schedule Variance Analysis ====================
  variance: {
    schedule: {
      daysBehind: Number,
      daysAhead: Number,
      percentageVariance: Number,
      schedulePerformanceIndex: Number,
      scheduleVariance: Number,
      trend: {
        type: String,
        enum: ['improving', 'stable', 'deteriorating', 'critical']
      }
    },
    effort: {
      plannedHours: Number,
      actualHours: Number,
      remainingHours: Number,
      effortVariance: Number,
      effortPerformanceIndex: Number
    },
    cost: {
      budgetedCost: Number,
      actualCost: Number,
      earnedValue: Number,
      costVariance: Number,
      costPerformanceIndex: Number,
      estimateAtCompletion: Number,
      estimateToComplete: Number,
      varianceAtCompletion: Number
    },
    milestones: {
      total: Number,
      onTime: Number,
      delayed: Number,
      completed: Number,
      upcoming: Number,
      atRisk: Number
    },
    tasks: {
      total: Number,
      completed: Number,
      inProgress: Number,
      notStarted: Number,
      delayed: Number,
      critical: Number
    }
  },

  // ==================== Risk Analysis ====================
  riskAnalysis: {
    schedule: {
      confidence: {
        p50: Date,
        p80: Date,
        p90: Date,
        p95: Date
      },
      monteCarlo: {
        simulations: Number,
        results: [{
          percentile: Number,
          date: Date,
          probability: Number
        }],
        criticalityIndex: [{
          taskId: String,
          index: Number
        }]
      },
      riskFactors: [{
        factor: String,
        impact: {
          type: String,
          enum: ['low', 'medium', 'high', 'very_high']
        },
        probability: Number,
        mitigation: String
      }]
    },
    triggers: [{
      type: {
        type: String,
        enum: ['milestone_delay', 'resource_shortage', 'dependency_delay', 'scope_change', 'external']
      },
      description: String,
      threshold: String,
      currentValue: String,
      status: {
        type: String,
        enum: ['normal', 'warning', 'triggered']
      },
      response: String
    }],
    contingency: {
      schedule: {
        days: Number,
        percentage: Number,
        consumed: Number,
        remaining: Number
      },
      effort: {
        hours: Number,
        percentage: Number,
        consumed: Number,
        remaining: Number
      },
      triggers: [{
        condition: String,
        action: String,
        owner: String
      }]
    }
  },

  // ==================== Baseline Management ====================
  baselines: [{
    baselineId: String,
    name: String,
    type: {
      type: String,
      enum: ['initial', 'revised', 'approved', 'interim'],
      default: 'initial'
    },
    createdDate: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalDate: Date,
    startDate: Date,
    endDate: Date,
    duration: Number,
    totalEffort: Number,
    totalCost: Number,
    tasks: [{
      taskId: String,
      startDate: Date,
      endDate: Date,
      duration: Number,
      effort: Number,
      cost: Number
    }],
    active: Boolean,
    locked: Boolean,
    notes: String
  }],

  // ==================== Change Management ====================
  changes: [{
    changeId: String,
    type: {
      type: String,
      enum: ['scope', 'schedule', 'resource', 'dependency', 'constraint', 'other']
    },
    description: String,
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestDate: Date,
    impact: {
      schedule: {
        days: Number,
        critical: Boolean
      },
      effort: {
        hours: Number
      },
      cost: {
        amount: Number
      },
      resources: [String],
      tasks: [String]
    },
    status: {
      type: String,
      enum: ['pending', 'analyzing', 'approved', 'rejected', 'implemented'],
      default: 'pending'
    },
    analysis: {
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedDate: Date,
      findings: String,
      alternatives: [{
        option: String,
        impact: String,
        recommendation: Boolean
      }]
    },
    approval: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvalDate: Date,
      conditions: [String],
      comments: String
    },
    implementation: {
      implementedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      implementedDate: Date,
      actualImpact: {
        schedule: Number,
        effort: Number,
        cost: Number
      },
      lessonsLearned: String
    }
  }],

  // ==================== Reporting & Analytics ====================
  reporting: {
    dashboards: [{
      name: String,
      type: {
        type: String,
        enum: ['executive', 'project_manager', 'team', 'stakeholder', 'custom']
      },
      widgets: [{
        type: String,
        position: {
          x: Number,
          y: Number,
          width: Number,
          height: Number
        },
        configuration: {
          type: Map,
          of: mongoose.Schema.Types.Mixed
        }
      }],
      filters: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      },
      refreshRate: Number
    }],
    reports: [{
      type: {
        type: String,
        enum: ['status', 'variance', 'forecast', 'resource', 'milestone', 'critical_path']
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'bi_weekly', 'monthly', 'on_demand']
      },
      lastGenerated: Date,
      nextScheduled: Date,
      recipients: [String],
      format: {
        type: String,
        enum: ['pdf', 'excel', 'powerpoint', 'html', 'json']
      },
      template: String,
      content: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    }],
    metrics: {
      scheduleHealth: {
        score: Number,
        trend: String,
        factors: {
          onTimeStarts: Number,
          onTimeCompletions: Number,
          averageDelay: Number,
          criticalTasksOnTrack: Number
        }
      },
      resourceUtilization: {
        average: Number,
        peak: Number,
        underutilized: Number,
        overallocated: Number
      },
      progressTracking: {
        plannedProgress: Number,
        actualProgress: Number,
        earnedValueProgress: Number,
        velocityTrend: [Number]
      },
      quality: {
        defects: Number,
        rework: Number,
        firstTimeRight: Number,
        customerSatisfaction: Number
      }
    },
    forecasts: {
      completion: {
        optimistic: Date,
        mostLikely: Date,
        pessimistic: Date,
        confidence: Number
      },
      effort: {
        remaining: Number,
        atCompletion: Number,
        efficiency: Number
      },
      cost: {
        atCompletion: Number,
        variance: Number,
        overrunRisk: Number
      }
    }
  },

  // ==================== Integration & Sync ====================
  integration: {
    externalSystems: [{
      system: {
        type: String,
        enum: ['ms_project', 'primavera', 'jira', 'asana', 'monday', 'smartsheet']
      },
      connectionId: String,
      lastSync: Date,
      nextSync: Date,
      syncDirection: {
        type: String,
        enum: ['import', 'export', 'bidirectional']
      },
      mapping: [{
        sourceField: String,
        targetField: String,
        transform: String
      }],
      status: {
        type: String,
        enum: ['active', 'paused', 'error', 'disabled']
      },
      errors: [{
        date: Date,
        error: String,
        resolved: Boolean
      }]
    }],
    dataExchange: {
      imports: [{
        date: Date,
        source: String,
        format: String,
        records: Number,
        status: String,
        errors: Number
      }],
      exports: [{
        date: Date,
        destination: String,
        format: String,
        records: Number,
        status: String
      }]
    },
    webhooks: [{
      url: String,
      events: [String],
      active: Boolean,
      secret: String,
      lastTriggered: Date,
      failureCount: Number
    }]
  },

  // ==================== Collaboration Features ====================
  collaboration: {
    comments: [{
      taskId: String,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      content: String,
      attachments: [String],
      mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      createdAt: Date,
      edited: Boolean,
      editedAt: Date,
      replies: [{
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        content: String,
        createdAt: Date
      }]
    }],
    updates: [{
      type: {
        type: String,
        enum: ['progress', 'schedule_change', 'resource_change', 'risk', 'issue']
      },
      taskId: String,
      description: String,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      date: Date,
      impact: String,
      visibility: {
        type: String,
        enum: ['team', 'stakeholders', 'all']
      }
    }],
    notifications: {
      settings: {
        scheduleChanges: Boolean,
        taskAssignments: Boolean,
        milestoneApproaching: Boolean,
        overdueTasks: Boolean,
        resourceConflicts: Boolean
      },
      rules: [{
        condition: String,
        action: String,
        recipients: [String],
        template: String
      }]
    }
  },

  // ==================== Status & Health ====================
  status: {
    current: {
      type: String,
      enum: ['draft', 'planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived'],
      default: 'draft',
      index: true
    },
    health: {
      overall: {
        type: String,
        enum: ['healthy', 'at_risk', 'critical', 'blocked'],
        default: 'healthy'
      },
      schedule: {
        type: String,
        enum: ['on_track', 'minor_delay', 'major_delay', 'critical_delay']
      },
      resource: {
        type: String,
        enum: ['optimal', 'manageable', 'constrained', 'critical']
      },
      budget: {
        type: String,
        enum: ['under_budget', 'on_budget', 'over_budget', 'critical_overrun']
      }
    },
    lastUpdated: Date,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revision_required'],
      default: 'pending'
    },
    approvals: [{
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: String,
      decision: String,
      date: Date,
      comments: String
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
      enum: ['manual', 'import', 'template', 'clone', 'integration']
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
      isLocked: {
        type: Boolean,
        default: false
      },
      requiresApproval: {
        type: Boolean,
        default: false
      },
      autoUpdate: {
        type: Boolean,
        default: true
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
    rollbackable: Boolean
  }]
};

// Create schema
const timelineSchema = BaseModel.createSchema(timelineSchemaDefinition, {
  collection: 'project_timelines',
  timestamps: true
});

// ==================== Indexes ====================
timelineSchema.index({ tenantId: 1, timelineCode: 1 }, { unique: true });
timelineSchema.index({ tenantId: 1, projectId: 1, 'configuration.type': 1 });
timelineSchema.index({ tenantId: 1, 'status.current': 1 });
timelineSchema.index({ tenantId: 1, 'boundaries.projectStart.planned': 1 });
timelineSchema.index({ tenantId: 1, 'boundaries.projectEnd.planned': 1 });
timelineSchema.index({ tenantId: 1, 'tasks.taskId': 1 });
timelineSchema.index({ tenantId: 1, searchTokens: 1 });

// Text search index
timelineSchema.index({
  name: 'text',
  description: 'text',
  'tasks.name': 'text',
  'tasks.description': 'text'
});

// ==================== Virtual Fields ====================
timelineSchema.virtual('duration').get(function() {
  if (this.boundaries.projectEnd.planned && this.boundaries.projectStart.planned) {
    return Math.floor((this.boundaries.projectEnd.planned - this.boundaries.projectStart.planned) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

timelineSchema.virtual('remainingDuration').get(function() {
  if (this.boundaries.projectEnd.planned) {
    const remaining = Math.floor((this.boundaries.projectEnd.planned - new Date()) / (1000 * 60 * 60 * 24));
    return Math.max(0, remaining);
  }
  return 0;
});

timelineSchema.virtual('completionPercentage').get(function() {
  if (this.tasks.length === 0) return 0;
  
  const totalWeight = this.tasks.reduce((sum, task) => sum + (task.effort?.estimated?.value || 1), 0);
  const completedWeight = this.tasks.reduce((sum, task) => {
    const weight = task.effort?.estimated?.value || 1;
    return sum + (weight * (task.progress?.percentageComplete || 0) / 100);
  }, 0);
  
  return Math.round((completedWeight / totalWeight) * 100);
});

timelineSchema.virtual('criticalTaskCount').get(function() {
  if (!this.criticalPath.paths || this.criticalPath.paths.length === 0) return 0;
  
  const criticalTasks = new Set();
  this.criticalPath.paths
    .filter(path => path.isCritical)
    .forEach(path => {
      path.tasks.forEach(taskId => criticalTasks.add(taskId));
    });
  
  return criticalTasks.size;
});

timelineSchema.virtual('scheduleEfficiency').get(function() {
  if (this.variance.schedule.schedulePerformanceIndex) {
    return this.variance.schedule.schedulePerformanceIndex;
  }
  return 1;
});

// ==================== Pre-save Middleware ====================
timelineSchema.pre('save', async function(next) {
  try {
    // Generate timeline code if not provided
    if (!this.timelineCode && this.isNew) {
      this.timelineCode = await this.constructor.generateTimelineCode(this.tenantId, this.projectId);
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate critical path if tasks modified
    if (this.isModified('tasks')) {
      await this.calculateCriticalPath();
    }

    // Update variance metrics
    if (this.isModified('tasks') || this.isModified('boundaries')) {
      this.updateVarianceMetrics();
    }

    // Check resource conflicts
    if (this.isModified('tasks') && this.resourceLeveling.enabled) {
      await this.checkResourceConflicts();
    }

    // Update timeline health
    this.updateTimelineHealth();

    // Update version
    if (!this.isNew) {
      this.metadata.version++;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
timelineSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add timeline name tokens
  if (this.name) {
    this.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add timeline code
  if (this.timelineCode) {
    tokens.add(this.timelineCode.toLowerCase());
  }
  
  // Add task names
  this.tasks.forEach(task => {
    if (task.name) {
      task.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
  });
  
  // Add tags
  if (this.metadata.tags) {
    this.metadata.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

timelineSchema.methods.calculateCriticalPath = async function() {
  // Simplified CPM algorithm implementation
  const tasks = new Map();
  
  // Initialize tasks
  this.tasks.forEach(task => {
    tasks.set(task.taskId, {
      ...task.toObject(),
      earlyStart: 0,
      earlyFinish: 0,
      lateStart: Infinity,
      lateFinish: Infinity,
      totalFloat: 0
    });
  });
  
  // Forward pass - calculate early start and finish
  const calculateEarlyDates = (taskId) => {
    const task = tasks.get(taskId);
    if (!task) return;
    
    if (!task.dependencies.predecessors || task.dependencies.predecessors.length === 0) {
      task.earlyStart = 0;
    } else {
      let maxEarlyFinish = 0;
      task.dependencies.predecessors.forEach(pred => {
        const predTask = tasks.get(pred.taskId);
        if (predTask) {
          calculateEarlyDates(pred.taskId);
          maxEarlyFinish = Math.max(maxEarlyFinish, predTask.earlyFinish + (pred.lag?.value || 0));
        }
      });
      task.earlyStart = maxEarlyFinish;
    }
    
    task.earlyFinish = task.earlyStart + (task.duration.estimated || 0);
  };
  
  // Calculate early dates for all tasks
  tasks.forEach((task, taskId) => {
    calculateEarlyDates(taskId);
  });
  
  // Find project end date
  let projectEnd = 0;
  tasks.forEach(task => {
    projectEnd = Math.max(projectEnd, task.earlyFinish);
  });
  
  // Backward pass - calculate late start and finish
  const calculateLateDates = (taskId) => {
    const task = tasks.get(taskId);
    if (!task) return;
    
    if (!task.dependencies.successors || task.dependencies.successors.length === 0) {
      task.lateFinish = projectEnd;
    } else {
      let minLateStart = Infinity;
      task.dependencies.successors.forEach(succ => {
        const succTask = tasks.get(succ.taskId);
        if (succTask) {
          calculateLateDates(succ.taskId);
          minLateStart = Math.min(minLateStart, succTask.lateStart - (succ.lag?.value || 0));
        }
      });
      task.lateFinish = minLateStart;
    }
    
    task.lateStart = task.lateFinish - (task.duration.estimated || 0);
    task.totalFloat = task.lateStart - task.earlyStart;
  };
  
  // Calculate late dates for all tasks
  tasks.forEach((task, taskId) => {
    calculateLateDates(taskId);
  });
  
  // Identify critical paths
  const criticalTasks = [];
  tasks.forEach((task, taskId) => {
    if (Math.abs(task.totalFloat) < 0.01) {
      criticalTasks.push(taskId);
      task.isCritical = true;
    }
  });
  
  // Update critical path analysis
  this.criticalPath.analysis.lastCalculated = new Date();
  this.criticalPath.analysis.criticalPathCount = criticalTasks.length;
  
  // Store updated task schedules
  this.tasks.forEach(task => {
    const calculatedTask = tasks.get(task.taskId);
    if (calculatedTask) {
      task.schedule.earlyStart = new Date(this.boundaries.projectStart.planned.getTime() + calculatedTask.earlyStart * 24 * 60 * 60 * 1000);
      task.schedule.earlyFinish = new Date(this.boundaries.projectStart.planned.getTime() + calculatedTask.earlyFinish * 24 * 60 * 60 * 1000);
      task.schedule.lateStart = new Date(this.boundaries.projectStart.planned.getTime() + calculatedTask.lateStart * 24 * 60 * 60 * 1000);
      task.schedule.lateFinish = new Date(this.boundaries.projectStart.planned.getTime() + calculatedTask.lateFinish * 24 * 60 * 60 * 1000);
    }
  });
};

timelineSchema.methods.updateVarianceMetrics = function() {
  const now = new Date();
  
  // Schedule variance
  const plannedTasks = this.tasks.filter(t => t.schedule.plannedFinish <= now);
  const completedTasks = this.tasks.filter(t => t.progress.percentageComplete === 100);
  
  this.variance.tasks.total = this.tasks.length;
  this.variance.tasks.completed = completedTasks.length;
  this.variance.tasks.inProgress = this.tasks.filter(t => 
    t.progress.percentageComplete > 0 && t.progress.percentageComplete < 100
  ).length;
  this.variance.tasks.notStarted = this.tasks.filter(t => 
    t.progress.percentageComplete === 0
  ).length;
  
  // Calculate SPI
  if (plannedTasks.length > 0) {
    this.variance.schedule.schedulePerformanceIndex = 
      completedTasks.length / plannedTasks.length;
  }
  
  // Determine trend
  if (this.variance.schedule.schedulePerformanceIndex >= 0.95) {
    this.variance.schedule.trend = 'stable';
  } else if (this.variance.schedule.schedulePerformanceIndex >= 0.85) {
    this.variance.schedule.trend = 'deteriorating';
  } else {
    this.variance.schedule.trend = 'critical';
  }
};

timelineSchema.methods.checkResourceConflicts = async function() {
  const resourceAllocations = new Map();
  
  // Build resource allocation map
  this.tasks.forEach(task => {
    if (task.resources && task.resources.length > 0) {
      task.resources.forEach(resource => {
        const resourceId = resource.resourceId.toString();
        if (!resourceAllocations.has(resourceId)) {
          resourceAllocations.set(resourceId, []);
        }
        
        resourceAllocations.get(resourceId).push({
          taskId: task.taskId,
          start: task.schedule.plannedStart,
          end: task.schedule.plannedFinish,
          allocation: resource.allocation
        });
      });
    }
  });
  
  // Check for overallocations
  const conflicts = [];
  resourceAllocations.forEach((allocations, resourceId) => {
    // Sort allocations by start date
    allocations.sort((a, b) => a.start - b.start);
    
    // Check for overlaps
    for (let i = 0; i < allocations.length - 1; i++) {
      for (let j = i + 1; j < allocations.length; j++) {
        if (allocations[i].end > allocations[j].start) {
          const totalAllocation = allocations[i].allocation + allocations[j].allocation;
          if (totalAllocation > 100) {
            conflicts.push({
              resourceId,
              conflictDates: [allocations[j].start],
              conflictingTasks: [allocations[i].taskId, allocations[j].taskId],
              resolution: 'unresolved'
            });
          }
        }
      }
    }
  });
  
  this.resourceLeveling.conflicts = conflicts;
};

timelineSchema.methods.updateTimelineHealth = function() {
  let healthScore = 100;
  
  // Schedule health (40% weight)
  if (this.variance.schedule.schedulePerformanceIndex < 0.9) {
    healthScore -= 40 * (1 - this.variance.schedule.schedulePerformanceIndex);
  }
  
  // Task completion health (30% weight)
  const completionRate = this.completionPercentage;
  const expectedCompletion = this.duration > 0 ? 
    ((this.duration - this.remainingDuration) / this.duration) * 100 : 0;
  
  if (completionRate < expectedCompletion * 0.9) {
    healthScore -= 30 * ((expectedCompletion - completionRate) / expectedCompletion);
  }
  
  // Resource health (20% weight)
  if (this.resourceLeveling.conflicts && this.resourceLeveling.conflicts.length > 0) {
    healthScore -= Math.min(20, this.resourceLeveling.conflicts.length * 5);
  }
  
  // Risk health (10% weight)
  const criticalRisks = this.riskAnalysis.triggers.filter(t => t.status === 'triggered').length;
  if (criticalRisks > 0) {
    healthScore -= Math.min(10, criticalRisks * 5);
  }
  
  // Determine overall health status
  if (healthScore >= 85) {
    this.status.health.overall = 'healthy';
  } else if (healthScore >= 70) {
    this.status.health.overall = 'at_risk';
  } else if (healthScore >= 50) {
    this.status.health.overall = 'critical';
  } else {
    this.status.health.overall = 'blocked';
  }
};

timelineSchema.methods.addTask = async function(taskData) {
  const task = {
    taskId: `TSK-${this.tasks.length + 1}`,
    wbsCode: taskData.wbsCode || `${this.tasks.length + 1}`,
    name: taskData.name,
    description: taskData.description,
    type: taskData.type || 'task',
    priority: taskData.priority || 'medium',
    effort: taskData.effort,
    duration: taskData.duration,
    schedule: {
      plannedStart: taskData.plannedStart,
      plannedFinish: taskData.plannedFinish,
      baselineStart: taskData.plannedStart,
      baselineFinish: taskData.plannedFinish
    },
    progress: {
      percentageComplete: 0
    },
    dependencies: taskData.dependencies || { predecessors: [], successors: [] },
    resources: taskData.resources || []
  };
  
  this.tasks.push(task);
  
  // Recalculate critical path
  await this.calculateCriticalPath();
  
  await this.save();
  
  logger.info('Task added to timeline', {
    timelineId: this._id,
    taskId: task.taskId
  });
  
  return task;
};

timelineSchema.methods.updateTaskProgress = async function(taskId, progress) {
  const task = this.tasks.find(t => t.taskId === taskId);
  
  if (!task) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }
  
  task.progress.percentageComplete = progress.percentageComplete;
  
  if (progress.actualStart) {
    task.schedule.actualStart = progress.actualStart;
  }
  
  if (progress.percentageComplete === 100) {
    task.schedule.actualFinish = new Date();
  }
  
  if (progress.actualEffort) {
    task.effort.actual = progress.actualEffort;
  }
  
  // Update variance metrics
  this.updateVarianceMetrics();
  
  await this.save();
  
  return task;
};

timelineSchema.methods.levelResources = async function() {
  if (!this.resourceLeveling.enabled) {
    throw new AppError('Resource leveling not enabled', 400, 'LEVELING_DISABLED');
  }
  
  // Check for conflicts
  await this.checkResourceConflicts();
  
  if (this.resourceLeveling.conflicts.length === 0) {
    logger.info('No resource conflicts found');
    return { adjustments: [] };
  }
  
  const adjustments = [];
  
  // Simple leveling algorithm - delay conflicting tasks
  this.resourceLeveling.conflicts.forEach(conflict => {
    conflict.conflictingTasks.forEach((taskId, index) => {
      if (index > 0) {
        const task = this.tasks.find(t => t.taskId === taskId);
        if (task && this.resourceLeveling.settings.canDelayTasks) {
          const delayDays = 5; // Simplified delay calculation
          const originalStart = task.schedule.plannedStart;
          
          task.schedule.plannedStart = new Date(
            originalStart.getTime() + delayDays * 24 * 60 * 60 * 1000
          );
          task.schedule.plannedFinish = new Date(
            task.schedule.plannedFinish.getTime() + delayDays * 24 * 60 * 60 * 1000
          );
          
          adjustments.push({
            taskId,
            originalStart,
            leveledStart: task.schedule.plannedStart,
            delay: delayDays,
            reason: 'Resource conflict resolution'
          });
        }
      }
    });
  });
  
  this.resourceLeveling.results.lastLeveled = new Date();
  this.resourceLeveling.results.adjustments = adjustments;
  
  await this.save();
  
  logger.info('Resource leveling completed', {
    timelineId: this._id,
    adjustments: adjustments.length
  });
  
  return { adjustments };
};

timelineSchema.methods.createBaseline = async function(name, userId) {
  const baseline = {
    baselineId: `BL-${this.baselines.length + 1}`,
    name: name || `Baseline ${this.baselines.length + 1}`,
    type: this.baselines.length === 0 ? 'initial' : 'revised',
    createdDate: new Date(),
    createdBy: userId,
    startDate: this.boundaries.projectStart.planned,
    endDate: this.boundaries.projectEnd.planned,
    duration: this.duration,
    totalEffort: this.tasks.reduce((sum, t) => sum + (t.effort?.estimated?.value || 0), 0),
    totalCost: this.tasks.reduce((sum, t) => sum + (t.resources?.reduce((s, r) => s + (r.cost || 0), 0) || 0), 0),
    tasks: this.tasks.map(t => ({
      taskId: t.taskId,
      startDate: t.schedule.plannedStart,
      endDate: t.schedule.plannedFinish,
      duration: t.duration.estimated,
      effort: t.effort?.estimated?.value,
      cost: t.resources?.reduce((sum, r) => sum + (r.cost || 0), 0)
    })),
    active: true,
    locked: false
  };
  
  // Deactivate previous baselines
  this.baselines.forEach(bl => {
    bl.active = false;
  });
  
  this.baselines.push(baseline);
  
  await this.save();
  
  logger.info('Baseline created', {
    timelineId: this._id,
    baselineId: baseline.baselineId
  });
  
  return baseline;
};

timelineSchema.methods.generateGanttData = function() {
  const ganttData = {
    project: {
      name: this.name,
      startDate: this.boundaries.projectStart.planned,
      endDate: this.boundaries.projectEnd.planned,
      duration: this.duration,
      progress: this.completionPercentage
    },
    tasks: this.tasks.map(task => ({
      id: task.taskId,
      name: task.name,
      start: task.schedule.plannedStart,
      end: task.schedule.plannedFinish,
      progress: task.progress.percentageComplete,
      dependencies: task.dependencies.predecessors.map(p => p.taskId),
      type: task.type,
      critical: this.criticalPath.paths.some(path => 
        path.isCritical && path.tasks.includes(task.taskId)
      ),
      resources: task.resources.map(r => r.resourceId),
      color: task.type === 'milestone' ? '#FF0000' : 
             task.priority === 'critical' ? '#FFA500' : '#0000FF'
    })),
    milestones: this.tasks
      .filter(t => t.type === 'milestone')
      .map(m => ({
        id: m.taskId,
        name: m.name,
        date: m.schedule.plannedStart
      })),
    resources: [],
    dependencies: []
  };
  
  // Build dependency list
  this.tasks.forEach(task => {
    task.dependencies.predecessors.forEach(pred => {
      ganttData.dependencies.push({
        from: pred.taskId,
        to: task.taskId,
        type: pred.type,
        lag: pred.lag?.value || 0
      });
    });
  });
  
  return ganttData;
};

// ==================== Static Methods ====================
timelineSchema.statics.generateTimelineCode = async function(tenantId, projectId) {
  const project = await mongoose.model('Project').findById(projectId).select('projectCode');
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }
  
  const count = await this.countDocuments({ tenantId, projectId });
  const sequence = (count + 1).toString().padStart(2, '0');
  
  return `TL-${project.projectCode}-${sequence}`;
};

timelineSchema.statics.findByProject = async function(projectId, options = {}) {
  const {
    type,
    status,
    limit = 10,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = { projectId };
  
  if (type) {
    query['configuration.type'] = type;
  }
  
  if (status) {
    query['status.current'] = status;
  }
  
  const [timelines, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-tasks -auditLog -searchTokens'),
    this.countDocuments(query)
  ]);
  
  return {
    timelines,
    total,
    hasMore: total > skip + timelines.length
  };
};

timelineSchema.statics.getActiveTimeline = async function(projectId) {
  return await this.findOne({
    projectId,
    'configuration.type': 'master',
    'status.current': 'active'
  });
};

// ==================== Create Model ====================
const ProjectTimelineModel = BaseModel.createModel('ProjectTimeline', timelineSchema, {
  collection: 'project_timelines',
  enableTimestamps: true,
  enableAudit: true
});

module.exports = ProjectTimelineModel;