'use strict';

/**
 * @fileoverview Enterprise escalation rule model for comprehensive escalation management
 * @module servers/admin-server/modules/support-administration/models/escalation-rule-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/webhook-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const cryptoHelper = require('../../../../../utils/helpers/crypto-helper');
const NotificationService = require('../../../../../services/notification-service');
const WebhookService = require('../../../../../services/webhook-service');

/**
 * @class EscalationRuleSchema
 * @description Comprehensive escalation rule schema for enterprise support escalation management
 * @extends mongoose.Schema
 */
const escalationRuleSchema = new mongoose.Schema({
  // ==================== Core Rule Identification ====================
  ruleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `ESC-RULE-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for escalation rule'
  },

  ruleReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      description: 'Reference to organization'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
      description: 'Reference to department'
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      index: true,
      description: 'Reference to team'
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      sparse: true,
      description: 'Reference to specific service'
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      sparse: true,
      description: 'Reference to specific product'
    }
  },

  // ==================== Rule Configuration ====================
  ruleConfiguration: {
    name: {
      type: String,
      required: true,
      index: true,
      maxlength: 200,
      description: 'Rule name'
    },
    description: {
      type: String,
      maxlength: 1000,
      description: 'Rule description'
    },
    type: {
      type: String,
      enum: ['TIME_BASED', 'CONDITION_BASED', 'MANUAL', 'SLA_BREACH', 'PRIORITY_BASED', 'CUSTOMER_BASED', 'HYBRID'],
      required: true,
      index: true
    },
    priority: {
      type: Number,
      default: 100,
      min: 0,
      max: 1000,
      index: true,
      description: 'Rule execution priority'
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    scope: {
      global: {
        type: Boolean,
        default: false
      },
      ticketTypes: [{
        type: String,
        enum: ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE_REQUEST', 'QUESTION', 'COMPLAINT']
      }],
      categories: [String],
      priorities: [{
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'TRIVIAL']
      }],
      products: [mongoose.Schema.Types.ObjectId],
      services: [mongoose.Schema.Types.ObjectId],
      customers: {
        segments: [String],
        tiers: [String],
        specificCustomers: [mongoose.Schema.Types.ObjectId]
      }
    },
    schedule: {
      active: {
        type: Boolean,
        default: true
      },
      timezone: {
        type: String,
        default: 'UTC'
      },
      businessHours: {
        enabled: Boolean,
        startTime: String,
        endTime: String,
        workDays: [Number]
      },
      blackoutPeriods: [{
        startDate: Date,
        endDate: Date,
        reason: String
      }],
      holidays: {
        observeHolidays: Boolean,
        holidayCalendar: String
      }
    }
  },

  // ==================== Trigger Conditions ====================
  triggerConditions: {
    timeTriggers: [{
      triggerId: String,
      name: String,
      metric: {
        type: String,
        enum: ['TIME_SINCE_CREATION', 'TIME_SINCE_LAST_UPDATE', 'TIME_SINCE_LAST_CUSTOMER_RESPONSE', 'TIME_IN_STATUS', 'TIME_SINCE_ASSIGNMENT', 'RESPONSE_TIME_SLA', 'RESOLUTION_TIME_SLA']
      },
      threshold: {
        value: Number,
        unit: {
          type: String,
          enum: ['MINUTES', 'HOURS', 'DAYS', 'BUSINESS_HOURS', 'BUSINESS_DAYS']
        }
      },
      conditions: [{
        field: String,
        operator: {
          type: String,
          enum: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS', 'NOT_CONTAINS', 'IN', 'NOT_IN']
        },
        value: mongoose.Schema.Types.Mixed
      }],
      active: Boolean
    }],
    
    conditionTriggers: [{
      triggerId: String,
      name: String,
      conditions: {
        all: [{
          field: String,
          operator: String,
          value: mongoose.Schema.Types.Mixed
        }],
        any: [{
          field: String,
          operator: String,
          value: mongoose.Schema.Types.Mixed
        }],
        none: [{
          field: String,
          operator: String,
          value: mongoose.Schema.Types.Mixed
        }]
      },
      evaluation: {
        type: String,
        enum: ['IMMEDIATE', 'SCHEDULED', 'BATCH'],
        schedule: String
      }
    }],
    
    slaTriggers: [{
      triggerId: String,
      slaType: {
        type: String,
        enum: ['FIRST_RESPONSE', 'RESOLUTION', 'EVERY_RESPONSE', 'CUSTOM']
      },
      breachThreshold: {
        percentage: Number,
        absolute: Number
      },
      warningThreshold: {
        percentage: Number,
        absolute: Number
      }
    }],
    
    patternTriggers: [{
      triggerId: String,
      pattern: {
        type: String,
        enum: ['REOPENED_MULTIPLE_TIMES', 'BOUNCED_BETWEEN_TEAMS', 'CUSTOMER_SENTIMENT_NEGATIVE', 'HIGH_MESSAGE_VOLUME', 'AGENT_STUCK']
      },
      threshold: Number,
      timeWindow: {
        value: Number,
        unit: String
      }
    }],
    
    customTriggers: [{
      triggerId: String,
      name: String,
      expression: String,
      variables: mongoose.Schema.Types.Mixed,
      testData: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Escalation Levels ====================
  escalationLevels: [{
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    name: String,
    description: String,
    targets: {
      users: [{
        userId: mongoose.Schema.Types.ObjectId,
        role: String,
        notificationPriority: Number
      }],
      teams: [{
        teamId: mongoose.Schema.Types.ObjectId,
        teamName: String
      }],
      roles: [String],
      dynamicAssignment: {
        enabled: Boolean,
        strategy: {
          type: String,
          enum: ['ROUND_ROBIN', 'LOAD_BALANCED', 'SKILL_BASED', 'AVAILABILITY_BASED', 'CUSTOM']
        },
        criteria: mongoose.Schema.Types.Mixed
      }
    },
    responseTime: {
      target: Number,
      unit: {
        type: String,
        enum: ['MINUTES', 'HOURS', 'DAYS']
      }
    },
    notifications: {
      immediate: {
        enabled: Boolean,
        channels: [{
          type: String,
          enum: ['EMAIL', 'SMS', 'PHONE', 'SLACK', 'TEAMS', 'WEBHOOK', 'PUSH']
        }],
        template: String,
        priority: {
          type: String,
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        }
      },
      reminders: [{
        afterMinutes: Number,
        channel: String,
        template: String
      }],
      escalationWarning: {
        enabled: Boolean,
        minutesBefore: Number,
        recipients: [String]
      }
    },
    actions: [{
      actionType: {
        type: String,
        enum: ['ASSIGN', 'NOTIFY', 'UPDATE_PRIORITY', 'UPDATE_STATUS', 'ADD_TAG', 'RUN_WORKFLOW', 'WEBHOOK', 'CUSTOM']
      },
      parameters: mongoose.Schema.Types.Mixed,
      executeOn: {
        type: String,
        enum: ['ESCALATION', 'RESOLUTION', 'BOTH']
      }
    }],
    autoResolve: {
      enabled: Boolean,
      conditions: mongoose.Schema.Types.Mixed,
      actions: [String]
    }
  }],

  // ==================== Escalation Path ====================
  escalationPath: {
    strategy: {
      type: String,
      enum: ['LINEAR', 'PARALLEL', 'CONDITIONAL', 'MATRIX', 'CUSTOM'],
      default: 'LINEAR'
    },
    pathDefinition: [{
      stepNumber: Number,
      fromLevel: Number,
      toLevel: Number,
      conditions: mongoose.Schema.Types.Mixed,
      waitTime: {
        value: Number,
        unit: String
      },
      skipConditions: mongoose.Schema.Types.Mixed,
      fallback: {
        enabled: Boolean,
        targetLevel: Number
      }
    }],
    maxEscalationLevel: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    loopPrevention: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxIterations: {
        type: Number,
        default: 5
      }
    },
    deEscalation: {
      enabled: Boolean,
      conditions: mongoose.Schema.Types.Mixed,
      targetLevel: Number,
      notifyPrevious: Boolean
    }
  },

  // ==================== Actions & Workflows ====================
  actionsWorkflows: {
    preEscalationActions: [{
      actionId: String,
      name: String,
      type: {
        type: String,
        enum: ['NOTIFICATION', 'ASSIGNMENT', 'STATUS_UPDATE', 'PRIORITY_UPDATE', 'WORKFLOW', 'WEBHOOK', 'CUSTOM']
      },
      parameters: mongoose.Schema.Types.Mixed,
      conditions: mongoose.Schema.Types.Mixed,
      order: Number
    }],
    
    postEscalationActions: [{
      actionId: String,
      name: String,
      type: String,
      parameters: mongoose.Schema.Types.Mixed,
      delay: {
        value: Number,
        unit: String
      }
    }],
    
    automatedResponses: {
      enabled: Boolean,
      templates: [{
        templateId: String,
        name: String,
        content: {
          subject: String,
          body: String,
          variables: [String]
        },
        conditions: mongoose.Schema.Types.Mixed,
        channel: String
      }],
      customerNotification: {
        enabled: Boolean,
        template: String,
        includeEscalationInfo: Boolean
      }
    },
    
    workflowIntegration: {
      triggerWorkflows: [{
        workflowId: String,
        workflowName: String,
        triggerOn: String,
        parameters: mongoose.Schema.Types.Mixed
      }],
      externalSystems: [{
        systemName: String,
        action: String,
        endpoint: String,
        authentication: mongoose.Schema.Types.Mixed,
        payload: mongoose.Schema.Types.Mixed
      }]
    },
    
    rollbackActions: {
      enabled: Boolean,
      conditions: mongoose.Schema.Types.Mixed,
      actions: [String]
    }
  },

  // ==================== Notification Configuration ====================
  notificationConfiguration: {
    channels: {
      email: {
        enabled: Boolean,
        templates: mongoose.Schema.Types.Mixed,
        fromAddress: String,
        replyTo: String
      },
      sms: {
        enabled: Boolean,
        templates: mongoose.Schema.Types.Mixed,
        fromNumber: String,
        provider: String
      },
      slack: {
        enabled: Boolean,
        webhookUrl: String,
        channel: String,
        mentions: [String],
        templates: mongoose.Schema.Types.Mixed
      },
      teams: {
        enabled: Boolean,
        webhookUrl: String,
        templates: mongoose.Schema.Types.Mixed
      },
      phone: {
        enabled: Boolean,
        provider: String,
        numbers: [String],
        voiceTemplate: String
      },
      custom: [{
        channelName: String,
        configuration: mongoose.Schema.Types.Mixed
      }]
    },
    
    recipients: {
      static: [{
        userId: mongoose.Schema.Types.ObjectId,
        name: String,
        email: String,
        phone: String,
        channels: [String]
      }],
      dynamic: {
        roles: [String],
        teams: [mongoose.Schema.Types.ObjectId],
        conditions: mongoose.Schema.Types.Mixed
      },
      escalationChain: [{
        level: Number,
        recipients: [mongoose.Schema.Types.ObjectId],
        backupRecipients: [mongoose.Schema.Types.ObjectId]
      }]
    },
    
    throttling: {
      enabled: Boolean,
      maxNotificationsPerHour: Number,
      maxNotificationsPerDay: Number,
      cooldownPeriod: {
        value: Number,
        unit: String
      }
    },
    
    preferences: {
      respectDoNotDisturb: Boolean,
      respectUserPreferences: Boolean,
      overrideForCritical: Boolean,
      batchNotifications: Boolean,
      digestFrequency: String
    }
  },

  // ==================== Performance & Metrics ====================
  performanceMetrics: {
    effectiveness: {
      totalEscalations: {
        type: Number,
        default: 0
      },
      successfulResolutions: Number,
      averageResolutionTime: Number,
      escalationPreventionRate: Number,
      falsePositiveRate: Number
    },
    
    levelMetrics: [{
      level: Number,
      escalations: Number,
      resolutions: Number,
      averageTimeAtLevel: Number,
      successRate: Number,
      breaches: Number
    }],
    
    triggerMetrics: [{
      triggerId: String,
      triggerCount: Number,
      lastTriggered: Date,
      averageResponseTime: Number,
      effectiveness: Number
    }],
    
    timing: {
      averageEscalationTime: Number,
      averageTimeToResolution: Number,
      averageResponseTime: Number,
      peakEscalationHours: [Number],
      peakEscalationDays: [Number]
    },
    
    outcomes: {
      resolvedAtLevel: [{
        level: Number,
        count: Number,
        percentage: Number
      }],
      escalatedToMax: Number,
      abandoned: Number,
      transferred: Number
    },
    
    costs: {
      estimatedCostPerEscalation: Number,
      totalCost: Number,
      costByLevel: [{
        level: Number,
        cost: Number
      }],
      savingsFromPrevention: Number
    }
  },

  // ==================== Execution History ====================
  executionHistory: [{
    executionId: {
      type: String,
      required: true
    },
    ticketId: String,
    triggeredAt: Date,
    trigger: {
      type: String,
      triggerId: String,
      conditions: mongoose.Schema.Types.Mixed
    },
    escalationLevel: Number,
    targets: [{
      userId: mongoose.Schema.Types.ObjectId,
      notified: Boolean,
      respondedAt: Date
    }],
    actions: [{
      action: String,
      executed: Boolean,
      result: mongoose.Schema.Types.Mixed,
      error: String
    }],
    outcome: {
      status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PARTIAL', 'CANCELLED']
      },
      resolution: String,
      resolvedAt: Date,
      resolvedBy: mongoose.Schema.Types.ObjectId
    },
    duration: Number,
    notes: String
  }],

  // ==================== Exception Handling ====================
  exceptionHandling: {
    overrides: [{
      overrideId: String,
      conditions: mongoose.Schema.Types.Mixed,
      actions: mongoose.Schema.Types.Mixed,
      validFrom: Date,
      validUntil: Date,
      reason: String,
      approvedBy: mongoose.Schema.Types.ObjectId
    }],
    
    exclusions: {
      customers: [mongoose.Schema.Types.ObjectId],
      tickets: [String],
      categories: [String],
      timeRanges: [{
        start: Date,
        end: Date,
        reason: String
      }]
    },
    
    fallbackRules: [{
      condition: String,
      fallbackRuleId: String,
      fallbackAction: mongoose.Schema.Types.Mixed
    }],
    
    errorHandling: {
      onNotificationFailure: {
        type: String,
        enum: ['RETRY', 'FALLBACK_CHANNEL', 'SKIP', 'ALERT_ADMIN']
      },
      onAssignmentFailure: {
        type: String,
        enum: ['ASSIGN_TO_POOL', 'ESCALATE_FURTHER', 'ALERT_ADMIN']
      },
      maxRetries: Number,
      retryDelay: Number
    },
    
    manualIntervention: {
      allowManualOverride: Boolean,
      requireApproval: Boolean,
      approvers: [mongoose.Schema.Types.ObjectId],
      auditManualActions: Boolean
    }
  },

  // ==================== Testing & Validation ====================
  testingValidation: {
    testMode: {
      enabled: Boolean,
      testTickets: [String],
      logOnly: Boolean
    },
    
    testScenarios: [{
      scenarioId: String,
      name: String,
      description: String,
      testData: mongoose.Schema.Types.Mixed,
      expectedOutcome: mongoose.Schema.Types.Mixed,
      lastTested: Date,
      testResults: [{
        testedAt: Date,
        passed: Boolean,
        actualOutcome: mongoose.Schema.Types.Mixed,
        notes: String
      }]
    }],
    
    validation: {
      lastValidated: Date,
      validatedBy: mongoose.Schema.Types.ObjectId,
      validationStatus: {
        type: String,
        enum: ['VALID', 'INVALID', 'NEEDS_REVIEW', 'TESTING']
      },
      issues: [{
        issue: String,
        severity: String,
        identified: Date
      }]
    },
    
    simulation: {
      enabled: Boolean,
      simulationRuns: [{
        runId: String,
        runDate: Date,
        scenarios: Number,
        passed: Number,
        failed: Number,
        report: mongoose.Schema.Types.Mixed
      }]
    }
  },

  // ==================== Compliance & Audit ====================
  complianceAudit: {
    compliance: {
      slaCompliant: Boolean,
      regulatoryCompliant: Boolean,
      internalPolicyCompliant: Boolean,
      certifications: [String],
      lastAudit: Date
    },
    
    auditLog: [{
      action: String,
      performedBy: mongoose.Schema.Types.ObjectId,
      performedAt: Date,
      changes: mongoose.Schema.Types.Mixed,
      reason: String,
      ipAddress: String
    }],
    
    approvals: [{
      approvalId: String,
      type: String,
      requestedBy: mongoose.Schema.Types.ObjectId,
      requestedAt: Date,
      approvedBy: mongoose.Schema.Types.ObjectId,
      approvedAt: Date,
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED']
      },
      comments: String
    }],
    
    reporting: {
      includeInReports: Boolean,
      reportingCategories: [String],
      kpis: [{
        kpiName: String,
        target: Number,
        actual: Number,
        measured: Date
      }]
    }
  },

  // ==================== Metadata & Configuration ====================
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    tags: [String],
    notes: String,
    customFields: mongoose.Schema.Types.Mixed,
    environment: {
      type: String,
      enum: ['DEVELOPMENT', 'STAGING', 'PRODUCTION'],
      default: 'PRODUCTION'
    }
  }
}, {
  timestamps: true,
  collection: 'escalation_rules',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
escalationRuleSchema.index({ 'ruleConfiguration.enabled': 1, 'ruleConfiguration.priority': -1 });
escalationRuleSchema.index({ 'ruleReference.organizationId': 1, 'ruleConfiguration.enabled': 1 });
escalationRuleSchema.index({ 'ruleConfiguration.type': 1, 'ruleConfiguration.enabled': 1 });
escalationRuleSchema.index({ 'triggerConditions.timeTriggers.active': 1 });
escalationRuleSchema.index({ 'performanceMetrics.effectiveness.totalEscalations': -1 });

// ==================== Virtual Properties ====================
escalationRuleSchema.virtual('isActive').get(function() {
  return this.ruleConfiguration.enabled && this.ruleConfiguration.schedule.active;
});

escalationRuleSchema.virtual('successRate').get(function() {
  const total = this.performanceMetrics.effectiveness.totalEscalations;
  const successful = this.performanceMetrics.effectiveness.successfulResolutions;
  return total > 0 ? (successful / total) * 100 : 0;
});

escalationRuleSchema.virtual('nextLevel').get(function() {
  const currentMax = Math.max(...this.escalationLevels.map(l => l.level));
  return currentMax < this.escalationPath.maxEscalationLevel ? currentMax + 1 : null;
});

// ==================== Instance Methods ====================

/**
 * Execute escalation rule
 * @async
 * @param {Object} ticket - Support ticket to escalate
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
escalationRuleSchema.methods.execute = async function(ticket, context = {}) {
  try {
    const executionId = `EXEC-${Date.now()}-${cryptoHelper.generateRandomString(6)}`;
    const execution = {
      executionId,
      ticketId: ticket.ticketId,
      triggeredAt: new Date(),
      trigger: context.trigger,
      actions: [],
      outcome: { status: 'PROCESSING' }
    };

    // Check if rule should execute
    const shouldExecute = await this.evaluateConditions(ticket, context);
    if (!shouldExecute) {
      execution.outcome.status = 'SKIPPED';
      execution.outcome.resolution = 'Conditions not met';
      this.executionHistory.push(execution);
      await this.save();
      return { executed: false, reason: 'Conditions not met' };
    }

    // Determine escalation level
    const escalationLevel = await this.determineEscalationLevel(ticket);
    execution.escalationLevel = escalationLevel;

    // Get escalation targets
    const levelConfig = this.escalationLevels.find(l => l.level === escalationLevel);
    if (!levelConfig) {
      throw new AppError(`Escalation level ${escalationLevel} not configured`, 400);
    }

    // Execute pre-escalation actions
    for (const action of this.actionsWorkflows.preEscalationActions) {
      const actionResult = await this.#executeAction(action, ticket, context);
      execution.actions.push({
        action: action.name,
        executed: actionResult.success,
        result: actionResult.data,
        error: actionResult.error
      });
    }

    // Perform escalation
    const escalationResult = await this.#performEscalation(ticket, levelConfig, context);
    execution.targets = escalationResult.targets;

    // Send notifications
    await this.sendNotifications(levelConfig, ticket, escalationResult.targets);

    // Execute post-escalation actions
    for (const action of this.actionsWorkflows.postEscalationActions) {
      if (action.delay) {
        // Schedule delayed action
        setTimeout(async () => {
          await this.#executeAction(action, ticket, context);
        }, action.delay.value * (action.delay.unit === 'MINUTES' ? 60000 : 1000));
      } else {
        const actionResult = await this.#executeAction(action, ticket, context);
        execution.actions.push({
          action: action.name,
          executed: actionResult.success,
          result: actionResult.data
        });
      }
    }

    // Update metrics
    this.performanceMetrics.effectiveness.totalEscalations++;
    this.performanceMetrics.levelMetrics = this.performanceMetrics.levelMetrics || [];
    const levelMetric = this.performanceMetrics.levelMetrics.find(m => m.level === escalationLevel);
    if (levelMetric) {
      levelMetric.escalations++;
    } else {
      this.performanceMetrics.levelMetrics.push({
        level: escalationLevel,
        escalations: 1,
        resolutions: 0
      });
    }

    execution.outcome.status = 'SUCCESS';
    this.executionHistory.push(execution);

    // Limit execution history
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }

    await this.save();

    logger.info(`Escalation rule ${this.ruleId} executed for ticket ${ticket.ticketId}`);
    return {
      executed: true,
      executionId,
      escalationLevel,
      targets: escalationResult.targets
    };

  } catch (error) {
    logger.error(`Failed to execute escalation rule:`, error);
    throw error;
  }
};

/**
 * Evaluate rule conditions
 * @async
 * @param {Object} ticket - Ticket to evaluate
 * @param {Object} context - Evaluation context
 * @returns {Promise<Boolean>} Whether conditions are met
 */
escalationRuleSchema.methods.evaluateConditions = async function(ticket, context = {}) {
  try {
    // Check if rule is enabled
    if (!this.ruleConfiguration.enabled) {
      return false;
    }

    // Check schedule
    if (!this.#isWithinSchedule()) {
      return false;
    }

    // Check scope
    if (!this.#isInScope(ticket)) {
      return false;
    }

    // Check exclusions
    if (this.#isExcluded(ticket)) {
      return false;
    }

    // Evaluate trigger conditions based on type
    switch (this.ruleConfiguration.type) {
      case 'TIME_BASED':
        return await this.#evaluateTimeTriggers(ticket, context);
      
      case 'CONDITION_BASED':
        return await this.#evaluateConditionTriggers(ticket, context);
      
      case 'SLA_BREACH':
        return await this.#evaluateSLATriggers(ticket, context);
      
      case 'PRIORITY_BASED':
        return await this.#evaluatePriorityTriggers(ticket, context);
      
      case 'CUSTOMER_BASED':
        return await this.#evaluateCustomerTriggers(ticket, context);
      
      case 'HYBRID':
        return await this.#evaluateHybridTriggers(ticket, context);
      
      case 'MANUAL':
        return context.manualTrigger === true;
      
      default:
        return false;
    }
  } catch (error) {
    logger.error(`Failed to evaluate conditions:`, error);
    return false;
  }
};

/**
 * Send escalation notifications
 * @async
 * @param {Object} levelConfig - Escalation level configuration
 * @param {Object} ticket - Support ticket
 * @param {Array} targets - Escalation targets
 * @returns {Promise<Object>} Notification result
 */
escalationRuleSchema.methods.sendNotifications = async function(levelConfig, ticket, targets) {
  try {
    const notificationService = new NotificationService();
    const results = [];

    // Send immediate notifications
    if (levelConfig.notifications.immediate.enabled) {
      for (const channel of levelConfig.notifications.immediate.channels) {
        const notification = {
          type: 'ESCALATION',
          priority: levelConfig.notifications.immediate.priority,
          channel,
          recipients: targets.map(t => t.userId),
          template: levelConfig.notifications.immediate.template,
          data: {
            ticketId: ticket.ticketId,
            subject: ticket.ticketDetails.subject,
            escalationLevel: levelConfig.level,
            priority: ticket.ticketDetails.priority.level
          }
        };

        const result = await notificationService.sendNotification(notification);
        results.push(result);
      }
    }

    // Schedule reminders
    for (const reminder of levelConfig.notifications.reminders || []) {
      setTimeout(async () => {
        await notificationService.sendNotification({
          type: 'ESCALATION_REMINDER',
          channel: reminder.channel,
          recipients: targets.map(t => t.userId),
          template: reminder.template,
          data: {
            ticketId: ticket.ticketId,
            escalationLevel: levelConfig.level,
            minutesSinceEscalation: reminder.afterMinutes
          }
        });
      }, reminder.afterMinutes * 60000);
    }

    // Send customer notification if enabled
    if (this.actionsWorkflows.automatedResponses.customerNotification.enabled) {
      await notificationService.sendNotification({
        type: 'CUSTOMER_ESCALATION_NOTICE',
        recipients: [ticket.ticketReference.customerId],
        template: this.actionsWorkflows.automatedResponses.customerNotification.template,
        data: {
          ticketId: ticket.ticketId,
          escalationInfo: this.actionsWorkflows.automatedResponses.customerNotification.includeEscalationInfo
        }
      });
    }

    return { success: true, notifications: results.length };

  } catch (error) {
    logger.error(`Failed to send notifications:`, error);
    throw error;
  }
};

/**
 * Determine appropriate escalation level
 * @async
 * @param {Object} ticket - Support ticket
 * @returns {Promise<Number>} Escalation level
 */
escalationRuleSchema.methods.determineEscalationLevel = async function(ticket) {
  try {
    // Get current escalation level from ticket
    const currentLevel = ticket.escalation?.escalationLevel || 0;

    // Check escalation path strategy
    switch (this.escalationPath.strategy) {
      case 'LINEAR':
        return Math.min(currentLevel + 1, this.escalationPath.maxEscalationLevel);
      
      case 'CONDITIONAL':
        return await this.#determineConditionalLevel(ticket, currentLevel);
      
      case 'MATRIX':
        return await this.#determineMatrixLevel(ticket);
      
      case 'PARALLEL':
        return currentLevel || 1; // Stay at same level for parallel
      
      case 'CUSTOM':
        return await this.#determineCustomLevel(ticket, currentLevel);
      
      default:
        return currentLevel + 1;
    }
  } catch (error) {
    logger.error(`Failed to determine escalation level:`, error);
    return 1;
  }
};

/**
 * Add escalation level
 * @async
 * @param {Object} levelData - Level configuration
 * @returns {Promise<Object>} Added level
 */
escalationRuleSchema.methods.addEscalationLevel = async function(levelData) {
  try {
    // Check if level already exists
    const existingLevel = this.escalationLevels.find(l => l.level === levelData.level);
    if (existingLevel) {
      throw new AppError(`Escalation level ${levelData.level} already exists`, 400);
    }

    this.escalationLevels.push({
      level: levelData.level,
      name: levelData.name,
      description: levelData.description,
      targets: levelData.targets,
      responseTime: levelData.responseTime,
      notifications: levelData.notifications,
      actions: levelData.actions,
      autoResolve: levelData.autoResolve
    });

    // Sort levels
    this.escalationLevels.sort((a, b) => a.level - b.level);

    // Update max level if needed
    if (levelData.level > this.escalationPath.maxEscalationLevel) {
      this.escalationPath.maxEscalationLevel = levelData.level;
    }

    await this.save();

    logger.info(`Added escalation level ${levelData.level} to rule ${this.ruleId}`);
    return { success: true, level: levelData.level };

  } catch (error) {
    logger.error(`Failed to add escalation level:`, error);
    throw error;
  }
};

/**
 * Test rule with sample data
 * @async
 * @param {Object} testData - Test scenario data
 * @returns {Promise<Object>} Test result
 */
escalationRuleSchema.methods.testRule = async function(testData) {
  try {
    const testResult = {
      testId: `TEST-${Date.now()}`,
      timestamp: new Date(),
      scenario: testData.scenario,
      results: []
    };

    // Enable test mode
    const originalTestMode = this.testingValidation.testMode.enabled;
    this.testingValidation.testMode.enabled = true;
    this.testingValidation.testMode.logOnly = true;

    // Test condition evaluation
    const conditionResult = await this.evaluateConditions(testData.ticket, testData.context);
    testResult.results.push({
      test: 'Condition Evaluation',
      passed: conditionResult === testData.expectedConditionResult,
      expected: testData.expectedConditionResult,
      actual: conditionResult
    });

    // Test level determination
    const level = await this.determineEscalationLevel(testData.ticket);
    testResult.results.push({
      test: 'Level Determination',
      passed: level === testData.expectedLevel,
      expected: testData.expectedLevel,
      actual: level
    });

    // Test notification generation
    const levelConfig = this.escalationLevels.find(l => l.level === level);
    if (levelConfig) {
      const notificationTargets = await this.#getNotificationTargets(levelConfig, testData.ticket);
      testResult.results.push({
        test: 'Notification Targets',
        passed: notificationTargets.length > 0,
        targetCount: notificationTargets.length
      });
    }

    // Restore test mode
    this.testingValidation.testMode.enabled = originalTestMode;

    // Record test scenario
    this.testingValidation.testScenarios.push({
      scenarioId: testResult.testId,
      name: testData.scenario,
      testData,
      expectedOutcome: testData.expectedOutcome,
      lastTested: new Date(),
      testResults: [{
        testedAt: new Date(),
        passed: testResult.results.every(r => r.passed),
        actualOutcome: testResult.results
      }]
    });

    await this.save();

    return testResult;

  } catch (error) {
    logger.error(`Failed to test rule:`, error);
    throw error;
  }
};

/**
 * Calculate rule effectiveness
 * @async
 * @returns {Promise<Object>} Effectiveness metrics
 */
escalationRuleSchema.methods.calculateEffectiveness = async function() {
  try {
    const metrics = this.performanceMetrics.effectiveness;
    const executions = this.executionHistory.filter(e => 
      e.triggeredAt > dateHelper.addDays(new Date(), -30)
    );

    const effectiveness = {
      totalEscalations: executions.length,
      successfulResolutions: executions.filter(e => e.outcome.status === 'SUCCESS').length,
      averageResolutionTime: 0,
      escalationPreventionRate: 0,
      falsePositiveRate: 0,
      levelEffectiveness: [],
      recommendations: []
    };

    // Calculate average resolution time
    const resolutionTimes = executions
      .filter(e => e.outcome.resolvedAt)
      .map(e => e.outcome.resolvedAt - e.triggeredAt);
    
    if (resolutionTimes.length > 0) {
      effectiveness.averageResolutionTime = 
        resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
    }

    // Calculate false positive rate
    const cancelledOrFailed = executions.filter(e => 
      e.outcome.status === 'CANCELLED' || e.outcome.status === 'FAILED'
    ).length;
    effectiveness.falsePositiveRate = 
      executions.length > 0 ? (cancelledOrFailed / executions.length) * 100 : 0;

    // Calculate level effectiveness
    for (const level of this.escalationLevels) {
      const levelExecutions = executions.filter(e => e.escalationLevel === level.level);
      const levelSuccess = levelExecutions.filter(e => e.outcome.status === 'SUCCESS').length;
      
      effectiveness.levelEffectiveness.push({
        level: level.level,
        executions: levelExecutions.length,
        successRate: levelExecutions.length > 0 ? (levelSuccess / levelExecutions.length) * 100 : 0
      });
    }

    // Generate recommendations
    if (effectiveness.falsePositiveRate > 20) {
      effectiveness.recommendations.push('High false positive rate - consider adjusting trigger conditions');
    }

    if (effectiveness.averageResolutionTime > 24 * 60 * 60 * 1000) {
      effectiveness.recommendations.push('Long resolution times - review escalation targets and response times');
    }

    const underperformingLevels = effectiveness.levelEffectiveness.filter(l => l.successRate < 50);
    if (underperformingLevels.length > 0) {
      effectiveness.recommendations.push(
        `Levels ${underperformingLevels.map(l => l.level).join(', ')} have low success rates`
      );
    }

    // Update stored metrics
    Object.assign(this.performanceMetrics.effectiveness, effectiveness);
    await this.save();

    return effectiveness;

  } catch (error) {
    logger.error(`Failed to calculate effectiveness:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================

/**
 * Find active rules for organization
 * @static
 * @async
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Array>} Active rules
 */
escalationRuleSchema.statics.findActiveRules = async function(organizationId) {
  return this.find({
    'ruleReference.organizationId': organizationId,
    'ruleConfiguration.enabled': true,
    'ruleConfiguration.schedule.active': true
  }).sort({ 'ruleConfiguration.priority': -1 });
};

/**
 * Find rules by trigger type
 * @static
 * @async
 * @param {String} triggerType - Trigger type
 * @returns {Promise<Array>} Rules
 */
escalationRuleSchema.statics.findByTriggerType = async function(triggerType) {
  return this.find({
    'ruleConfiguration.type': triggerType,
    'ruleConfiguration.enabled': true
  });
};

/**
 * Get performance statistics
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Performance statistics
 */
escalationRuleSchema.statics.getPerformanceStats = async function(filters = {}) {
  const matchStage = { 'ruleConfiguration.enabled': true };
  
  if (filters.organizationId) {
    matchStage['ruleReference.organizationId'] = filters.organizationId;
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRules: { $sum: 1 },
        totalEscalations: { $sum: '$performanceMetrics.effectiveness.totalEscalations' },
        averageSuccessRate: { $avg: '$performanceMetrics.effectiveness.successRate' },
        totalExecutions: { $sum: { $size: '$executionHistory' } }
      }
    }
  ]);

  return stats[0] || {
    totalRules: 0,
    totalEscalations: 0,
    averageSuccessRate: 0,
    totalExecutions: 0
  };
};

// ==================== Private Helper Methods ====================

/**
 * Check if within schedule
 * @private
 * @returns {Boolean} Whether within schedule
 */
escalationRuleSchema.methods.#isWithinSchedule = function() {
  const now = new Date();
  const schedule = this.ruleConfiguration.schedule;

  // Check blackout periods
  for (const period of schedule.blackoutPeriods || []) {
    if (now >= period.startDate && now <= period.endDate) {
      return false;
    }
  }

  // Check business hours if enabled
  if (schedule.businessHours?.enabled) {
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    const startHour = parseInt(schedule.businessHours.startTime.split(':')[0]);
    const endHour = parseInt(schedule.businessHours.endTime.split(':')[0]);
    
    if (currentHour < startHour || currentHour >= endHour) {
      return false;
    }
    
    if (!schedule.businessHours.workDays.includes(currentDay)) {
      return false;
    }
  }

  return true;
};

/**
 * Check if ticket is in scope
 * @private
 * @param {Object} ticket - Support ticket
 * @returns {Boolean} Whether in scope
 */
escalationRuleSchema.methods.#isInScope = function(ticket) {
  const scope = this.ruleConfiguration.scope;

  if (scope.global) {
    return true;
  }

  if (scope.ticketTypes.length > 0 && !scope.ticketTypes.includes(ticket.ticketDetails.type)) {
    return false;
  }

  if (scope.priorities.length > 0 && !scope.priorities.includes(ticket.ticketDetails.priority.level)) {
    return false;
  }

  if (scope.categories.length > 0 && !scope.categories.includes(ticket.ticketDetails.category.primary)) {
    return false;
  }

  return true;
};

/**
 * Check if ticket is excluded
 * @private
 * @param {Object} ticket - Support ticket
 * @returns {Boolean} Whether excluded
 */
escalationRuleSchema.methods.#isExcluded = function(ticket) {
  const exclusions = this.exceptionHandling.exclusions;

  if (exclusions.tickets.includes(ticket.ticketId)) {
    return true;
  }

  if (exclusions.customers.includes(ticket.ticketReference.customerId)) {
    return true;
  }

  if (exclusions.categories.includes(ticket.ticketDetails.category.primary)) {
    return true;
  }

  return false;
};

/**
 * Evaluate time triggers
 * @private
 * @async
 * @param {Object} ticket - Support ticket
 * @param {Object} context - Evaluation context
 * @returns {Promise<Boolean>} Whether triggered
 */
escalationRuleSchema.methods.#evaluateTimeTriggers = async function(ticket, context) {
  for (const trigger of this.triggerConditions.timeTriggers) {
    if (!trigger.active) continue;

    const timeValue = await this.#getTimeMetric(ticket, trigger.metric);
    const thresholdMs = trigger.threshold.value * this.#getTimeUnitMultiplier(trigger.threshold.unit);

    if (timeValue >= thresholdMs) {
      // Check additional conditions
      if (trigger.conditions && trigger.conditions.length > 0) {
        const conditionsMet = trigger.conditions.every(condition => 
          this.#evaluateCondition(ticket, condition)
        );
        if (conditionsMet) {
          context.trigger = { type: 'TIME', triggerId: trigger.triggerId };
          return true;
        }
      } else {
        context.trigger = { type: 'TIME', triggerId: trigger.triggerId };
        return true;
      }
    }
  }

  return false;
};

/**
 * Get time metric value
 * @private
 * @async
 * @param {Object} ticket - Support ticket
 * @param {String} metric - Time metric type
 * @returns {Promise<Number>} Time value in milliseconds
 */
escalationRuleSchema.methods.#getTimeMetric = async function(ticket, metric) {
  const now = new Date();

  switch (metric) {
    case 'TIME_SINCE_CREATION':
      return now - ticket.analytics.timeMetrics.createdAt;
    
    case 'TIME_SINCE_LAST_UPDATE':
      return now - (ticket.metadata.lastModifiedAt || ticket.analytics.timeMetrics.createdAt);
    
    case 'TIME_SINCE_LAST_CUSTOMER_RESPONSE':
      return now - (ticket.communication.customerInteractions.lastCustomerMessage || now);
    
    case 'TIME_IN_STATUS':
      return now - (ticket.lifecycle.status.lastChanged || ticket.analytics.timeMetrics.createdAt);
    
    case 'TIME_SINCE_ASSIGNMENT':
      return now - (ticket.assignment.currentAssignee.assignedAt || now);
    
    default:
      return 0;
  }
};

/**
 * Get time unit multiplier
 * @private
 * @param {String} unit - Time unit
 * @returns {Number} Multiplier to convert to milliseconds
 */
escalationRuleSchema.methods.#getTimeUnitMultiplier = function(unit) {
  switch (unit) {
    case 'MINUTES':
      return 60 * 1000;
    case 'HOURS':
      return 60 * 60 * 1000;
    case 'DAYS':
      return 24 * 60 * 60 * 1000;
    case 'BUSINESS_HOURS':
      return 60 * 60 * 1000; // Simplified
    case 'BUSINESS_DAYS':
      return 8 * 60 * 60 * 1000; // Simplified to 8 hours
    default:
      return 1000;
  }
};

/**
 * Evaluate single condition
 * @private
 * @param {Object} ticket - Support ticket
 * @param {Object} condition - Condition to evaluate
 * @returns {Boolean} Whether condition is met
 */
escalationRuleSchema.methods.#evaluateCondition = function(ticket, condition) {
  const fieldValue = this.#getFieldValue(ticket, condition.field);
  
  switch (condition.operator) {
    case 'EQUALS':
      return fieldValue === condition.value;
    case 'NOT_EQUALS':
      return fieldValue !== condition.value;
    case 'GREATER_THAN':
      return fieldValue > condition.value;
    case 'LESS_THAN':
      return fieldValue < condition.value;
    case 'CONTAINS':
      return String(fieldValue).includes(condition.value);
    case 'NOT_CONTAINS':
      return !String(fieldValue).includes(condition.value);
    case 'IN':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'NOT_IN':
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    default:
      return false;
  }
};

/**
 * Get field value from ticket
 * @private
 * @param {Object} ticket - Support ticket
 * @param {String} field - Field path
 * @returns {*} Field value
 */
escalationRuleSchema.methods.#getFieldValue = function(ticket, field) {
  const paths = field.split('.');
  let value = ticket;
  
  for (const path of paths) {
    value = value?.[path];
    if (value === undefined) break;
  }
  
  return value;
};

/**
 * Execute action
 * @private
 * @async
 * @param {Object} action - Action to execute
 * @param {Object} ticket - Support ticket
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Action result
 */
escalationRuleSchema.methods.#executeAction = async function(action, ticket, context) {
  try {
    switch (action.type) {
      case 'NOTIFICATION':
        return await this.#sendActionNotification(action, ticket);
      
      case 'ASSIGNMENT':
        return await this.#performAssignment(action, ticket);
      
      case 'STATUS_UPDATE':
        return await this.#updateTicketStatus(action, ticket);
      
      case 'PRIORITY_UPDATE':
        return await this.#updateTicketPriority(action, ticket);
      
      case 'WEBHOOK':
        return await this.#callWebhook(action, ticket);
      
      case 'WORKFLOW':
        return await this.#triggerWorkflow(action, ticket);
      
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    logger.error(`Failed to execute action:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Perform escalation
 * @private
 * @async
 * @param {Object} ticket - Support ticket
 * @param {Object} levelConfig - Level configuration
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Escalation result
 */
escalationRuleSchema.methods.#performEscalation = async function(ticket, levelConfig, context) {
  const targets = await this.#getNotificationTargets(levelConfig, ticket);
  
  // Update ticket escalation status
  await ticket.escalateTicket({
    level: levelConfig.level,
    escalatedTo: {
      userId: targets[0]?.userId,
      role: levelConfig.targets.roles[0]
    },
    reason: `Automated escalation: ${this.ruleConfiguration.name}`,
    escalatedBy: context.userId || 'SYSTEM'
  });
  
  return { success: true, targets };
};

/**
 * Get notification targets
 * @private
 * @async
 * @param {Object} levelConfig - Level configuration
 * @param {Object} ticket - Support ticket
 * @returns {Promise<Array>} Notification targets
 */
escalationRuleSchema.methods.#getNotificationTargets = async function(levelConfig, ticket) {
  const targets = [];
  
  // Add static users
  for (const user of levelConfig.targets.users || []) {
    targets.push(user);
  }
  
  // Add team members
  // Implementation would fetch team members
  
  // Add role-based targets
  // Implementation would fetch users by role
  
  return targets;
};

// Additional helper method stubs
escalationRuleSchema.methods.#evaluateConditionTriggers = async function(ticket, context) { return false; };
escalationRuleSchema.methods.#evaluateSLATriggers = async function(ticket, context) { return false; };
escalationRuleSchema.methods.#evaluatePriorityTriggers = async function(ticket, context) { return false; };
escalationRuleSchema.methods.#evaluateCustomerTriggers = async function(ticket, context) { return false; };
escalationRuleSchema.methods.#evaluateHybridTriggers = async function(ticket, context) { return false; };
escalationRuleSchema.methods.#determineConditionalLevel = async function(ticket, currentLevel) { return currentLevel + 1; };
escalationRuleSchema.methods.#determineMatrixLevel = async function(ticket) { return 1; };
escalationRuleSchema.methods.#determineCustomLevel = async function(ticket, currentLevel) { return currentLevel + 1; };
escalationRuleSchema.methods.#sendActionNotification = async function(action, ticket) { return { success: true }; };
escalationRuleSchema.methods.#performAssignment = async function(action, ticket) { return { success: true }; };
escalationRuleSchema.methods.#updateTicketStatus = async function(action, ticket) { return { success: true }; };
escalationRuleSchema.methods.#updateTicketPriority = async function(action, ticket) { return { success: true }; };
escalationRuleSchema.methods.#callWebhook = async function(action, ticket) { return { success: true }; };
escalationRuleSchema.methods.#triggerWorkflow = async function(action, ticket) { return { success: true }; };

// ==================== Hooks ====================
escalationRuleSchema.pre('save', async function(next) {
  // Update version
  if (!this.isNew) {
    this.metadata.version++;
  }
  
  // Update last modified
  this.metadata.lastModifiedAt = new Date();
  
  // Validate escalation levels
  if (this.escalationLevels.length === 0) {
    return next(new Error('At least one escalation level is required'));
  }
  
  // Sort escalation levels
  this.escalationLevels.sort((a, b) => a.level - b.level);
  
  next();
});

// ==================== Model Export ====================
const EscalationRule = mongoose.model('EscalationRule', escalationRuleSchema);

module.exports = EscalationRule;