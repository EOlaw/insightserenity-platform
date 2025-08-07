'use strict';

/**
 * @fileoverview Maintenance window and operations validation rules
 * @module servers/admin-server/modules/platform-management/validators/maintenance-validators
 * @requires joi
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const Joi = require('joi');
const commonValidators = require('../../../../../shared/lib/utils/validators/common-validators');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const { ErrorCodes } = require('../../../../../shared/lib/utils/constants/error-codes');
const logger = require('../../../../../shared/lib/utils/logger');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * Custom validation messages for maintenance operations
 */
const VALIDATION_MESSAGES = {
  MAINTENANCE_ID_REQUIRED: 'Maintenance ID is required',
  MAINTENANCE_ID_INVALID: 'Invalid maintenance ID format',
  MAINTENANCE_TYPE_INVALID: 'Invalid maintenance type',
  MAINTENANCE_STATUS_INVALID: 'Invalid maintenance status',
  START_TIME_REQUIRED: 'Start time is required',
  END_TIME_REQUIRED: 'End time is required',
  START_TIME_PAST: 'Start time cannot be in the past',
  END_TIME_BEFORE_START: 'End time must be after start time',
  DURATION_EXCEEDED: 'Maintenance window duration exceeds maximum allowed',
  REASON_REQUIRED: 'Reason for maintenance is required',
  AFFECTED_SERVICES_REQUIRED: 'At least one affected service must be specified',
  NOTIFICATION_LEAD_TIME_INVALID: 'Notification lead time must be at least 15 minutes',
  APPROVAL_REQUIRED: 'Approval is required for this maintenance type',
  HANDLER_ID_INVALID: 'Invalid handler ID format',
  TASK_ID_INVALID: 'Invalid task ID format',
  TEMPLATE_ID_INVALID: 'Invalid template ID format',
  RECURRENCE_PATTERN_INVALID: 'Invalid recurrence pattern',
  MAX_TASKS_EXCEEDED: 'Maximum number of maintenance tasks exceeded',
  CONFIRMATION_REQUIRED: 'Confirmation is required for this operation',
  EXTENSION_DURATION_INVALID: 'Extension duration must be between 15 minutes and 4 hours',
  ROLLBACK_PLAN_REQUIRED: 'Rollback plan is required for critical maintenance',
  TEAM_MEMBER_REQUIRED: 'At least one team member must be assigned'
};

/**
 * Common validation schemas for maintenance operations
 */
const commonSchemas = {
  maintenanceId: Joi.string()
    .pattern(/^maint-[a-zA-Z0-9]{8,32}$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.MAINTENANCE_ID_INVALID,
      'any.required': VALIDATION_MESSAGES.MAINTENANCE_ID_REQUIRED
    }),

  maintenanceType: Joi.string()
    .valid(
      'scheduled',
      'emergency',
      'routine',
      'upgrade',
      'security',
      'performance',
      'database',
      'network',
      'hardware',
      'software'
    )
    .messages({
      'any.only': VALIDATION_MESSAGES.MAINTENANCE_TYPE_INVALID
    }),

  maintenanceStatus: Joi.string()
    .valid(
      'draft',
      'scheduled',
      'pending_approval',
      'approved',
      'in_progress',
      'paused',
      'completed',
      'cancelled',
      'failed'
    )
    .messages({
      'any.only': VALIDATION_MESSAGES.MAINTENANCE_STATUS_INVALID
    }),

  maintenanceWindow: Joi.object({
    startTime: Joi.date().iso().greater('now').required()
      .messages({
        'date.greater': VALIDATION_MESSAGES.START_TIME_PAST,
        'any.required': VALIDATION_MESSAGES.START_TIME_REQUIRED
      }),
    endTime: Joi.date().iso().greater(Joi.ref('startTime')).required()
      .messages({
        'date.greater': VALIDATION_MESSAGES.END_TIME_BEFORE_START,
        'any.required': VALIDATION_MESSAGES.END_TIME_REQUIRED
      }),
    timezone: Joi.string().default('UTC'),
    duration: Joi.number().min(15).max(1440) // 15 minutes to 24 hours
  }),

  affectedServices: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid('full', 'partial', 'readonly').default('full'),
        expectedDowntime: Joi.number().min(0),
        components: Joi.array().items(Joi.string())
      })
    )
    .min(1)
    .messages({
      'array.min': VALIDATION_MESSAGES.AFFECTED_SERVICES_REQUIRED
    }),

  notificationSettings: Joi.object({
    enabled: Joi.boolean().default(true),
    leadTime: Joi.number().min(15).max(10080).default(1440), // 15 minutes to 7 days
    channels: Joi.array().items(
      Joi.string().valid('email', 'sms', 'slack', 'teams', 'webhook', 'in-app')
    ),
    recipients: Joi.object({
      users: Joi.array().items(Joi.string()),
      groups: Joi.array().items(Joi.string()),
      roles: Joi.array().items(Joi.string()),
      external: Joi.array().items(Joi.string().email())
    }),
    template: Joi.string(),
    customMessage: Joi.string().max(1000)
  }),

  taskDefinition: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().max(500),
    type: Joi.string().valid('manual', 'automated', 'verification', 'rollback').required(),
    order: Joi.number().integer().min(1),
    dependencies: Joi.array().items(Joi.string()),
    estimatedDuration: Joi.number().min(1),
    required: Joi.boolean().default(true),
    script: Joi.when('type', {
      is: 'automated',
      then: Joi.string().required()
    }),
    assignee: Joi.string(),
    checkpoints: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        criteria: Joi.string().required(),
        type: Joi.string().valid('manual', 'automated').default('manual')
      })
    )
  }),

  impactAssessment: Joi.object({
    severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
    scope: Joi.string().valid('global', 'regional', 'local', 'isolated').required(),
    estimatedUsers: Joi.number().integer().min(0),
    estimatedRevenueLoss: Joi.number().min(0),
    businessImpact: Joi.string().max(1000),
    technicalImpact: Joi.string().max(1000),
    mitigationStrategies: Joi.array().items(Joi.string())
  }),

  approvalRequirements: Joi.object({
    required: Joi.boolean().default(true),
    minimumApprovers: Joi.number().integer().min(1).default(1),
    approvers: Joi.array().items(
      Joi.object({
        user: Joi.string().required(),
        role: Joi.string(),
        required: Joi.boolean().default(false)
      })
    ),
    deadline: Joi.date().iso(),
    escalationPath: Joi.array().items(
      Joi.object({
        level: Joi.number().integer().min(1).required(),
        users: Joi.array().items(Joi.string()).required(),
        timeout: Joi.number().min(15).max(1440) // minutes
      })
    )
  }),

  rollbackPlan: Joi.object({
    strategy: Joi.string().valid('automatic', 'manual', 'checkpoint').required(),
    trigger: Joi.object({
      conditions: Joi.array().items(
        Joi.object({
          metric: Joi.string().required(),
          threshold: Joi.number().required(),
          operator: Joi.string().valid('gt', 'gte', 'lt', 'lte', 'eq', 'neq').required()
        })
      ),
      manualApproval: Joi.boolean().default(false)
    }),
    steps: Joi.array().items(
      Joi.object({
        order: Joi.number().integer().min(1).required(),
        action: Joi.string().required(),
        automated: Joi.boolean().default(false),
        script: Joi.string(),
        timeout: Joi.number().min(1).max(60)
      })
    ),
    verificationSteps: Joi.array().items(Joi.string()),
    estimatedTime: Joi.number().min(1)
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().default('-scheduledAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

/**
 * Maintenance scheduling validators
 */
const maintenanceSchedulingValidators = {
  /**
   * Validate schedule maintenance window request
   */
  scheduleMaintenanceWindow: {
    body: Joi.object({
      title: Joi.string().min(5).max(200).required(),
      description: Joi.string().max(2000).required(),
      type: commonSchemas.maintenanceType.required(),
      priority: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
      window: commonSchemas.maintenanceWindow,
      affectedServices: commonSchemas.affectedServices,
      impactAssessment: commonSchemas.impactAssessment.required(),
      tasks: Joi.array().items(commonSchemas.taskDefinition).max(50),
      rollbackPlan: Joi.when('type', {
        is: Joi.valid('upgrade', 'critical', 'database'),
        then: commonSchemas.rollbackPlan.required()
      }),
      notifications: commonSchemas.notificationSettings,
      approval: commonSchemas.approvalRequirements,
      team: Joi.array().items(
        Joi.object({
          userId: Joi.string().required(),
          role: Joi.string().valid('lead', 'engineer', 'observer').required(),
          responsibilities: Joi.array().items(Joi.string())
        })
      ).min(1).messages({
        'array.min': VALIDATION_MESSAGES.TEAM_MEMBER_REQUIRED
      }),
      changeRequest: Joi.object({
        ticketId: Joi.string(),
        system: Joi.string().valid('jira', 'servicenow', 'internal'),
        link: Joi.string().uri()
      }),
      testPlan: Joi.object({
        preChecks: Joi.array().items(Joi.string()),
        postChecks: Joi.array().items(Joi.string()),
        acceptanceCriteria: Joi.array().items(Joi.string())
      }),
      metadata: Joi.object(),
      tags: Joi.array().items(Joi.string().max(50)).max(10)
    }).unknown(false)
  },

  /**
   * Validate schedule recurring maintenance request
   */
  scheduleRecurringMaintenance: {
    body: Joi.object({
      baseConfiguration: Joi.object({
        title: Joi.string().min(5).max(200).required(),
        description: Joi.string().max(2000).required(),
        type: commonSchemas.maintenanceType.required(),
        priority: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
        duration: Joi.number().min(15).max(480).required(), // minutes
        affectedServices: commonSchemas.affectedServices,
        tasks: Joi.array().items(commonSchemas.taskDefinition).max(50),
        team: Joi.array().items(
          Joi.object({
            userId: Joi.string().required(),
            role: Joi.string().valid('lead', 'engineer', 'observer').required()
          })
        ).min(1)
      }).required(),
      recurrence: Joi.object({
        pattern: Joi.string().valid('daily', 'weekly', 'monthly', 'custom').required(),
        interval: Joi.number().integer().min(1).max(12).default(1),
        daysOfWeek: Joi.when('pattern', {
          is: 'weekly',
          then: Joi.array().items(Joi.number().min(0).max(6)).min(1).required()
        }),
        dayOfMonth: Joi.when('pattern', {
          is: 'monthly',
          then: Joi.number().min(1).max(31).required()
        }),
        time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
        timezone: Joi.string().default('UTC'),
        customCron: Joi.when('pattern', {
          is: 'custom',
          then: Joi.string().required()
        })
      }).required(),
      schedule: Joi.object({
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().greater(Joi.ref('startDate')),
        occurrences: Joi.number().integer().min(1).max(100),
        blackoutDates: Joi.array().items(Joi.date().iso())
      }).required(),
      notifications: commonSchemas.notificationSettings,
      autoApprove: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate schedule emergency maintenance request
   */
  scheduleEmergencyMaintenance: {
    body: Joi.object({
      title: Joi.string().min(5).max(200).required(),
      reason: Joi.string().min(10).max(2000).required(),
      severity: Joi.string().valid('critical', 'high').required(),
      startTime: Joi.date().iso().required(),
      estimatedDuration: Joi.number().min(5).max(240).required(), // minutes
      affectedServices: commonSchemas.affectedServices,
      immediateActions: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          responsible: Joi.string().required(),
          status: Joi.string().valid('pending', 'in-progress', 'completed').default('pending')
        })
      ).min(1).required(),
      incidentId: Joi.string(),
      approvedBy: Joi.string().required(),
      notifications: Joi.object({
        sendImmediately: Joi.boolean().default(true),
        channels: Joi.array().items(
          Joi.string().valid('email', 'sms', 'slack', 'pagerduty')
        ).default(['email', 'sms', 'slack']),
        customMessage: Joi.string().max(500)
      }),
      postMortem: Joi.object({
        scheduled: Joi.boolean().default(true),
        date: Joi.date().iso().greater('now')
      })
    }).unknown(false)
  },

  /**
   * Validate reschedule maintenance window request
   */
  rescheduleMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      newWindow: commonSchemas.maintenanceWindow,
      reason: Joi.string().min(10).max(500).required(),
      notifyAffectedParties: Joi.boolean().default(true),
      requireReapproval: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate batch schedule maintenance request
   */
  batchScheduleMaintenance: {
    body: Joi.object({
      maintenanceWindows: Joi.array().items(
        Joi.object({
          title: Joi.string().min(5).max(200).required(),
          description: Joi.string().max(2000).required(),
          type: commonSchemas.maintenanceType.required(),
          window: commonSchemas.maintenanceWindow,
          affectedServices: commonSchemas.affectedServices,
          priority: Joi.string().valid('critical', 'high', 'medium', 'low').required()
        })
      ).min(1).max(10).required(),
      commonSettings: Joi.object({
        notifications: commonSchemas.notificationSettings,
        approval: commonSchemas.approvalRequirements,
        team: Joi.array().items(
          Joi.object({
            userId: Joi.string().required(),
            role: Joi.string().valid('lead', 'engineer', 'observer').required()
          })
        )
      }),
      validateConflicts: Joi.boolean().default(true),
      stopOnError: Joi.boolean().default(true)
    }).unknown(false)
  }
};

/**
 * Maintenance query validators
 */
const maintenanceQueryValidators = {
  /**
   * Validate get active maintenance windows request
   */
  getActiveMaintenanceWindows: {
    query: Joi.object({
      includeDetails: Joi.boolean().default(false),
      services: Joi.array().items(Joi.string()),
      type: commonSchemas.maintenanceType,
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get scheduled maintenance windows request
   */
  getScheduledMaintenanceWindows: {
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      type: commonSchemas.maintenanceType,
      status: commonSchemas.maintenanceStatus,
      services: Joi.array().items(Joi.string()),
      priority: Joi.string().valid('critical', 'high', 'medium', 'low'),
      includeCompleted: Joi.boolean().default(false),
      includeCancelled: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get upcoming maintenance windows request
   */
  getUpcomingMaintenanceWindows: {
    query: Joi.object({
      days: Joi.number().integer().min(1).max(90).default(7),
      services: Joi.array().items(Joi.string()),
      type: commonSchemas.maintenanceType,
      priority: Joi.string().valid('critical', 'high', 'medium', 'low'),
      includeRecurring: Joi.boolean().default(true),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get maintenance history request
   */
  getMaintenanceHistory: {
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      type: commonSchemas.maintenanceType,
      status: commonSchemas.maintenanceStatus,
      services: Joi.array().items(Joi.string()),
      includeMetrics: Joi.boolean().default(false),
      includeActivities: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get maintenance calendar request
   */
  getMaintenanceCalendar: {
    query: Joi.object({
      month: Joi.number().integer().min(1).max(12),
      year: Joi.number().integer().min(2020).max(2100),
      view: Joi.string().valid('month', 'week', 'day').default('month'),
      timezone: Joi.string().default('UTC'),
      services: Joi.array().items(Joi.string()),
      includeTypes: Joi.array().items(commonSchemas.maintenanceType),
      format: Joi.string().valid('json', 'ical', 'csv').default('json')
    }).unknown(false)
  },

  /**
   * Validate search maintenance windows request
   */
  searchMaintenanceWindows: {
    query: Joi.object({
      query: Joi.string().min(2).max(100).required(),
      searchIn: Joi.array().items(
        Joi.string().valid('title', 'description', 'services', 'tasks', 'tags')
      ).default(['title', 'description']),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      status: commonSchemas.maintenanceStatus,
      type: commonSchemas.maintenanceType,
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate check maintenance status request
   */
  checkMaintenanceStatus: {
    query: Joi.object({
      service: Joi.string(),
      verbose: Joi.boolean().default(false),
      includeUpcoming: Joi.boolean().default(true),
      hours: Joi.number().integer().min(1).max(72).default(24)
    }).unknown(false)
  }
};

/**
 * Maintenance execution validators
 */
const maintenanceExecutionValidators = {
  /**
   * Validate start maintenance window request
   */
  startMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      confirmation: Joi.string().valid('START').required(),
      preChecksPassed: Joi.boolean().required(),
      overrideWarnings: Joi.boolean().default(false),
      startedBy: Joi.string().required(),
      notes: Joi.string().max(500)
    }).unknown(false)
  },

  /**
   * Validate complete maintenance window request
   */
  completeMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      status: Joi.string().valid('completed', 'failed', 'partial').required(),
      completedTasks: Joi.array().items(Joi.string()),
      failedTasks: Joi.array().items(
        Joi.object({
          taskId: Joi.string().required(),
          reason: Joi.string().required(),
          impact: Joi.string()
        })
      ),
      postChecksPassed: Joi.boolean().required(),
      actualDuration: Joi.number().min(1),
      completedBy: Joi.string().required(),
      summary: Joi.string().max(2000).required(),
      followUpActions: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          assignee: Joi.string().required(),
          dueDate: Joi.date().iso()
        })
      ),
      metrics: Joi.object({
        downtime: Joi.number().min(0),
        affectedUsers: Joi.number().integer().min(0),
        incidentsReported: Joi.number().integer().min(0),
        performanceImpact: Joi.number().min(-100).max(100)
      })
    }).unknown(false)
  },

  /**
   * Validate cancel maintenance window request
   */
  cancelMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      reason: Joi.string().min(10).max(500).required(),
      cancelledBy: Joi.string().required(),
      notifyAffectedParties: Joi.boolean().default(true),
      reschedule: Joi.boolean().default(false),
      proposedNewDate: Joi.when('reschedule', {
        is: true,
        then: Joi.date().iso().greater('now')
      })
    }).unknown(false)
  },

  /**
   * Validate extend maintenance window request
   */
  extendMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      extensionMinutes: Joi.number().min(15).max(240).required()
        .messages({
          'number.min': VALIDATION_MESSAGES.EXTENSION_DURATION_INVALID,
          'number.max': VALIDATION_MESSAGES.EXTENSION_DURATION_INVALID
        }),
      reason: Joi.string().min(10).max(500).required(),
      requestedBy: Joi.string().required(),
      requireApproval: Joi.boolean().default(true),
      notifyAffectedParties: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate pause maintenance window request
   */
  pauseMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      reason: Joi.string().min(10).max(500).required(),
      pausedBy: Joi.string().required(),
      estimatedResumption: Joi.date().iso().greater('now'),
      notifyTeam: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate resume maintenance window request
   */
  resumeMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      resumedBy: Joi.string().required(),
      adjustedEndTime: Joi.date().iso().greater('now'),
      notes: Joi.string().max(500)
    }).unknown(false)
  },

  /**
   * Validate rollback maintenance window request
   */
  rollbackMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      reason: Joi.string().min(10).max(1000).required(),
      rollbackType: Joi.string().valid('full', 'partial', 'checkpoint').required(),
      targetState: Joi.string(),
      executedBy: Joi.string().required(),
      confirmation: Joi.string().valid('ROLLBACK').required(),
      impactAssessment: Joi.string().max(1000).required(),
      notifyStakeholders: Joi.boolean().default(true)
    }).unknown(false)
  }
};

/**
 * Maintenance management validators
 */
const maintenanceManagementValidators = {
  /**
   * Validate get maintenance window request
   */
  getMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      includeActivities: Joi.boolean().default(false),
      includeTasks: Joi.boolean().default(true),
      includeTeam: Joi.boolean().default(true),
      includeMetrics: Joi.boolean().default(false),
      includeApprovals: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate update maintenance window request
   */
  updateMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      title: Joi.string().min(5).max(200),
      description: Joi.string().max(2000),
      type: commonSchemas.maintenanceType,
      priority: Joi.string().valid('critical', 'high', 'medium', 'low'),
      window: Joi.object({
        startTime: Joi.date().iso().greater('now'),
        endTime: Joi.date().iso().greater(Joi.ref('startTime')),
        timezone: Joi.string()
      }),
      affectedServices: commonSchemas.affectedServices,
      impactAssessment: commonSchemas.impactAssessment,
      rollbackPlan: commonSchemas.rollbackPlan,
      notifications: commonSchemas.notificationSettings,
      metadata: Joi.object(),
      tags: Joi.array().items(Joi.string().max(50)).max(10),
      updatedBy: Joi.string().required(),
      updateReason: Joi.string().max(500).required()
    }).unknown(false).min(3) // At least one field to update plus updatedBy and updateReason
  },

  /**
   * Validate delete maintenance window request
   */
  deleteMaintenanceWindow: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      confirmation: Joi.string().valid('DELETE').required(),
      reason: Joi.string().max(500).required(),
      deletedBy: Joi.string().required()
    }).unknown(false)
  }
};

/**
 * Maintenance task validators
 */
const maintenanceTaskValidators = {
  /**
   * Validate add maintenance task request
   */
  addMaintenanceTask: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: commonSchemas.taskDefinition
  },

  /**
   * Validate get maintenance tasks request
   */
  getMaintenanceTasks: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      status: Joi.string().valid('pending', 'in-progress', 'completed', 'failed', 'skipped'),
      type: Joi.string().valid('manual', 'automated', 'verification', 'rollback'),
      assignee: Joi.string(),
      includeCompleted: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate update maintenance task request
   */
  updateMaintenanceTask: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId,
      taskId: Joi.string().pattern(/^task-[a-zA-Z0-9]{8,32}$/).required()
    }),
    body: Joi.object({
      name: Joi.string().min(3).max(100),
      description: Joi.string().max(500),
      status: Joi.string().valid('pending', 'in-progress', 'completed', 'failed', 'skipped'),
      assignee: Joi.string(),
      estimatedDuration: Joi.number().min(1),
      actualDuration: Joi.number().min(0),
      notes: Joi.string().max(1000),
      result: Joi.object({
        success: Joi.boolean(),
        output: Joi.string(),
        errors: Joi.array().items(Joi.string())
      }),
      updatedBy: Joi.string().required()
    }).unknown(false).min(2) // At least one field to update plus updatedBy
  },

  /**
   * Validate complete maintenance task request
   */
  completeMaintenanceTask: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId,
      taskId: Joi.string().pattern(/^task-[a-zA-Z0-9]{8,32}$/).required()
    }),
    body: Joi.object({
      status: Joi.string().valid('completed', 'failed', 'skipped').required(),
      result: Joi.object({
        success: Joi.boolean().required(),
        output: Joi.string(),
        errors: Joi.array().items(Joi.string()),
        metrics: Joi.object()
      }).required(),
      actualDuration: Joi.number().min(0),
      completedBy: Joi.string().required(),
      notes: Joi.string().max(1000)
    }).unknown(false)
  },

  /**
   * Validate delete maintenance task request
   */
  deleteMaintenanceTask: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId,
      taskId: Joi.string().pattern(/^task-[a-zA-Z0-9]{8,32}$/).required()
    }),
    body: Joi.object({
      reason: Joi.string().max(500).required(),
      deletedBy: Joi.string().required()
    }).unknown(false)
  }
};

/**
 * Maintenance impact analysis validators
 */
const maintenanceImpactValidators = {
  /**
   * Validate get maintenance impact analysis request
   */
  getMaintenanceImpactAnalysis: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      depth: Joi.string().valid('basic', 'detailed', 'comprehensive').default('detailed'),
      includeDownstream: Joi.boolean().default(true),
      includeUpstream: Joi.boolean().default(true),
      timeframe: Joi.string().valid('immediate', 'short-term', 'long-term').default('immediate')
    }).unknown(false)
  },

  /**
   * Validate analyze maintenance impact request
   */
  analyzeMaintenanceImpact: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      analysisType: Joi.string().valid('user', 'service', 'business', 'technical', 'full').required(),
      parameters: Joi.object({
        userSegments: Joi.array().items(Joi.string()),
        businessMetrics: Joi.array().items(Joi.string()),
        technicalMetrics: Joi.array().items(Joi.string()),
        timeHorizon: Joi.number().min(1).max(168) // hours
      }),
      includeRecommendations: Joi.boolean().default(true),
      generateReport: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get affected services request
   */
  getAffectedServices: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      includeIndirect: Joi.boolean().default(true),
      includeDependencies: Joi.boolean().default(true),
      depth: Joi.number().integer().min(1).max(5).default(2)
    }).unknown(false)
  },

  /**
   * Validate get affected users request
   */
  getAffectedUsers: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      segment: Joi.string().valid('all', 'premium', 'standard', 'trial'),
      region: Joi.string(),
      includeEstimates: Joi.boolean().default(true),
      groupBy: Joi.string().valid('segment', 'region', 'service', 'none').default('none')
    }).unknown(false)
  },

  /**
   * Validate get maintenance risk assessment request
   */
  getMaintenanceRiskAssessment: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    query: Joi.object({
      includeHistorical: Joi.boolean().default(true),
      includeMitigations: Joi.boolean().default(true),
      format: Joi.string().valid('summary', 'detailed', 'matrix').default('detailed')
    }).unknown(false)
  }
};

/**
 * Maintenance validation validators
 */
const maintenanceValidationValidators = {
  /**
   * Validate maintenance window validation request
   */
  validateMaintenanceWindow: {
    body: Joi.object({
      window: commonSchemas.maintenanceWindow,
      affectedServices: commonSchemas.affectedServices,
      type: commonSchemas.maintenanceType.required(),
      checkConflicts: Joi.boolean().default(true),
      checkDependencies: Joi.boolean().default(true),
      checkResources: Joi.boolean().default(true),
      checkApprovals: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate check maintenance conflicts request
   */
  checkMaintenanceConflicts: {
    body: Joi.object({
      window: commonSchemas.maintenanceWindow,
      services: Joi.array().items(Joi.string()).min(1).required(),
      conflictTypes: Joi.array().items(
        Joi.string().valid('time', 'service', 'resource', 'dependency')
      ).default(['time', 'service']),
      severity: Joi.string().valid('any', 'high', 'critical').default('any')
    }).unknown(false)
  },

  /**
   * Validate prerequisites validation request
   */
  validatePrerequisites: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      checks: Joi.array().items(
        Joi.string().valid('approvals', 'resources', 'backups', 'dependencies', 'team')
      ).default(['approvals', 'resources', 'backups']),
      strict: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate test maintenance procedures request
   */
  testMaintenanceProcedures: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      testType: Joi.string().valid('dry-run', 'simulation', 'sandbox').required(),
      testEnvironment: Joi.string().valid('dev', 'test', 'staging').required(),
      tasks: Joi.array().items(Joi.string()),
      validateOutputs: Joi.boolean().default(true),
      rollbackAfter: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate dry run maintenance request
   */
  dryRunMaintenance: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      simulateErrors: Joi.boolean().default(false),
      errorProbability: Joi.when('simulateErrors', {
        is: true,
        then: Joi.number().min(0).max(1).default(0.1)
      }),
      includePerformanceMetrics: Joi.boolean().default(true),
      generateReport: Joi.boolean().default(true)
    }).unknown(false)
  }
};

/**
 * Maintenance notification validators
 */
const maintenanceNotificationValidators = {
  /**
   * Validate send maintenance notifications request
   */
  sendMaintenanceNotifications: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      notificationType: Joi.string().valid(
        'announcement',
        'reminder',
        'start',
        'update',
        'completion',
        'cancellation'
      ).required(),
      channels: Joi.array().items(
        Joi.string().valid('email', 'sms', 'slack', 'teams', 'webhook', 'in-app')
      ).min(1).required(),
      recipients: Joi.object({
        all: Joi.boolean().default(false),
        users: Joi.array().items(Joi.string()),
        groups: Joi.array().items(Joi.string()),
        roles: Joi.array().items(Joi.string()),
        external: Joi.array().items(Joi.string().email()),
        exclude: Joi.array().items(Joi.string())
      }),
      message: Joi.object({
        subject: Joi.string().max(200),
        body: Joi.string().max(2000),
        template: Joi.string(),
        variables: Joi.object(),
        priority: Joi.string().valid('high', 'normal', 'low').default('normal')
      }),
      scheduling: Joi.object({
        sendAt: Joi.date().iso(),
        timezone: Joi.string().default('UTC')
      })
    }).unknown(false)
  },

  /**
   * Validate schedule notifications request
   */
  scheduleNotifications: {
    params: Joi.object({
      maintenanceId: commonSchemas.maintenanceId
    }),
    body: Joi.object({
      notifications: Joi.array().items(
        Joi.object({
          type: Joi.string().valid(
            'announcement',
            'reminder-7d',
            'reminder-1d',
            'reminder-1h',
            'start',
            'completion'
          ).required(),
          enabled: Joi.boolean().default(true),
          channels: Joi.array().items(Joi.string()),
          template: Joi.string(),
          customTiming: Joi.object({
            value: Joi.number().min(1),
            unit: Joi.string().valid('minutes', 'hours', 'days'),
            before: Joi.boolean().default(true)
          })
        })
      ).min(1).required(),
      defaultChannels: Joi.array().items(
        Joi.string().valid('email', 'sms', 'slack', 'teams', 'webhook', 'in-app')
      ),
      recipientSettings: Joi.object({
        includeAffectedUsers: Joi.boolean().default(true),
        includeTeam: Joi.boolean().default(true),
        includeStakeholders: Joi.boolean().default(true),
        customRecipients: Joi.array().items(Joi.string())
      })
    }).unknown(false)
  }
};

/**
 * Maintenance reporting validators
 */
const maintenanceReportingValidators = {
  /**
   * Validate get maintenance statistics request
   */
  getMaintenanceStatistics: {
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      groupBy: Joi.string().valid('type', 'status', 'priority', 'month', 'week'),
      metrics: Joi.array().items(
        Joi.string().valid(
          'total',
          'completed',
          'cancelled',
          'failed',
          'avgDuration',
          'avgDowntime',
          'affectedUsers',
          'successRate'
        )
      ),
      services: Joi.array().items(Joi.string()),
      format: Joi.string().valid('json', 'csv', 'chart').default('json')
    }).unknown(false)
  },

  /**
   * Validate create maintenance report request
   */
  createMaintenanceReport: {
    query: Joi.object({
      reportType: Joi.string().valid(
        'executive',
        'technical',
        'compliance',
        'performance',
        'incident'
      ).required(),
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().required(),
      includeMetrics: Joi.boolean().default(true),
      includeCharts: Joi.boolean().default(true),
      includeRecommendations: Joi.boolean().default(true),
      format: Joi.string().valid('pdf', 'html', 'json', 'docx').default('pdf'),
      recipients: Joi.array().items(Joi.string().email())
    }).unknown(false)
  },

  /**
   * Validate export maintenance schedule request
   */
  exportMaintenanceSchedule: {
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      format: Joi.string().valid('csv', 'excel', 'ical', 'json', 'pdf').required(),
      includeDetails: Joi.boolean().default(false),
      services: Joi.array().items(Joi.string()),
      timezone: Joi.string().default('UTC')
    }).unknown(false)
  }
};

/**
 * Maintenance handler validators
 */
const maintenanceHandlerValidators = {
  /**
   * Validate register maintenance handler request
   */
  registerMaintenanceHandler: {
    body: Joi.object({
      name: Joi.string().min(3).max(100).required(),
      description: Joi.string().max(500),
      type: Joi.string().valid('pre', 'post', 'error', 'rollback').required(),
      triggerEvents: Joi.array().items(
        Joi.string().valid('start', 'complete', 'fail', 'cancel', 'extend')
      ).min(1).required(),
      handler: Joi.object({
        type: Joi.string().valid('webhook', 'function', 'script', 'lambda').required(),
        endpoint: Joi.string().when('type', {
          is: 'webhook',
          then: Joi.string().uri().required()
        }),
        functionName: Joi.string().when('type', {
          is: Joi.valid('function', 'lambda'),
          then: Joi.required()
        }),
        script: Joi.string().when('type', {
          is: 'script',
          then: Joi.required()
        }),
        authentication: Joi.object({
          type: Joi.string().valid('none', 'basic', 'bearer', 'api-key'),
          credentials: Joi.object()
        }),
        timeout: Joi.number().min(1).max(300).default(30),
        retries: Joi.number().min(0).max(5).default(3)
      }).required(),
      conditions: Joi.array().items(
        Joi.object({
          field: Joi.string().required(),
          operator: Joi.string().valid('eq', 'neq', 'contains', 'regex').required(),
          value: Joi.any().required()
        })
      ),
      enabled: Joi.boolean().default(true),
      metadata: Joi.object()
    }).unknown(false)
  },

  /**
   * Validate test maintenance handler request
   */
  testMaintenanceHandler: {
    params: Joi.object({
      handlerId: Joi.string().pattern(/^handler-[a-zA-Z0-9]{8,32}$/).required()
    }),
    body: Joi.object({
      testData: Joi.object({
        maintenanceId: Joi.string(),
        event: Joi.string().required(),
        context: Joi.object()
      }).required(),
      validateResponse: Joi.boolean().default(true),
      timeout: Joi.number().min(1).max(60).default(10)
    }).unknown(false)
  }
};

/**
 * Combined maintenance validators export
 */
const maintenanceValidators = {
  ...maintenanceSchedulingValidators,
  ...maintenanceQueryValidators,
  ...maintenanceExecutionValidators,
  ...maintenanceManagementValidators,
  ...maintenanceTaskValidators,
  ...maintenanceImpactValidators,
  ...maintenanceValidationValidators,
  ...maintenanceNotificationValidators,
  ...maintenanceReportingValidators,
  ...maintenanceHandlerValidators
};

/**
 * Validation error handler
 */
const handleValidationError = (error, req, res) => {
  logger.warn('Maintenance validation error', {
    path: req.path,
    method: req.method,
    error: error.details,
    body: req.body,
    query: req.query,
    params: req.params
  });

  const errors = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    type: detail.type
  }));

  return res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      details: errors
    }
  });
};

/**
 * Validation middleware factory
 */
const createValidator = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    };

    // Validate params if schema exists
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.params = value;
    }

    // Validate query if schema exists
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.query = value;
    }

    // Validate body if schema exists
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.body = value;
    }

    next();
  };
};

// Export validators
module.exports = {
  maintenanceValidators,
  createValidator,
  handleValidationError,
  commonSchemas,
  VALIDATION_MESSAGES
};