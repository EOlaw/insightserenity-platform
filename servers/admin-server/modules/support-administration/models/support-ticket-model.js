'use strict';

/**
 * @fileoverview Enterprise support ticket administration model for comprehensive ticket management
 * @module servers/admin-server/modules/support-administration/models/support-ticket-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/email-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const cryptoHelper = require('../../../../../shared/lib/utils/helpers/crypto-helper');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const EmailService = require('../../../../../shared/lib/services/email-service');

/**
 * @class SupportTicketSchema
 * @description Comprehensive support ticket administration schema for enterprise ticket management
 * @extends mongoose.Schema
 */
const supportTicketSchema = new mongoose.Schema({
  // ==================== Core Ticket Identification ====================
  ticketId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for support ticket'
  },

  ticketReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization'
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
      description: 'Reference to customer'
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      sparse: true,
      description: 'Reference to related project'
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      sparse: true,
      description: 'Reference to related invoice'
    },
    parentTicketId: {
      type: String,
      sparse: true,
      description: 'Reference to parent ticket for sub-tickets'
    },
    relatedTickets: [{
      ticketId: String,
      relationship: {
        type: String,
        enum: ['DUPLICATE', 'RELATED', 'BLOCKS', 'BLOCKED_BY', 'CAUSED_BY', 'CAUSES']
      },
      addedAt: Date,
      addedBy: mongoose.Schema.Types.ObjectId
    }]
  },

  // ==================== Ticket Information ====================
  ticketDetails: {
    subject: {
      type: String,
      required: true,
      index: 'text',
      maxlength: 500,
      description: 'Ticket subject line'
    },
    description: {
      type: String,
      required: true,
      maxlength: 10000,
      description: 'Detailed ticket description'
    },
    type: {
      type: String,
      enum: ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE_REQUEST', 'QUESTION', 'COMPLAINT', 'FEATURE_REQUEST', 'BUG_REPORT'],
      required: true,
      index: true,
      default: 'INCIDENT'
    },
    category: {
      primary: {
        type: String,
        enum: ['TECHNICAL', 'BILLING', 'ACCOUNT', 'PRODUCT', 'SERVICE', 'COMPLIANCE', 'SECURITY', 'OTHER'],
        required: true,
        index: true
      },
      secondary: String,
      tags: [String]
    },
    priority: {
      level: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'TRIVIAL'],
        default: 'MEDIUM',
        index: true
      },
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      },
      calculatedAt: Date,
      factors: {
        customerImpact: Number,
        businessImpact: Number,
        urgency: Number,
        effort: Number
      }
    },
    severity: {
      level: {
        type: String,
        enum: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'],
        index: true
      },
      impact: {
        scope: {
          type: String,
          enum: ['SINGLE_USER', 'DEPARTMENT', 'ORGANIZATION', 'MULTIPLE_ORGANIZATIONS', 'PLATFORM_WIDE']
        },
        affectedUsers: Number,
        businessFunction: String
      }
    },
    source: {
      channel: {
        type: String,
        enum: ['WEB_PORTAL', 'EMAIL', 'PHONE', 'CHAT', 'API', 'SOCIAL_MEDIA', 'IN_PERSON', 'MONITORING', 'INTERNAL'],
        required: true,
        index: true
      },
      originalMessageId: String,
      ipAddress: String,
      userAgent: String,
      referrer: String
    }
  },

  // ==================== Assignment & Ownership ====================
  assignment: {
    currentAssignee: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
      },
      assignedAt: Date,
      assignedBy: mongoose.Schema.Types.ObjectId,
      assignmentMethod: {
        type: String,
        enum: ['MANUAL', 'AUTO_ROUND_ROBIN', 'AUTO_LOAD_BALANCED', 'AUTO_SKILL_BASED', 'ESCALATION', 'TRANSFER']
      }
    },
    team: {
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        index: true
      },
      teamName: String,
      department: String
    },
    assignmentHistory: [{
      userId: mongoose.Schema.Types.ObjectId,
      teamId: mongoose.Schema.Types.ObjectId,
      assignedAt: Date,
      unassignedAt: Date,
      assignedBy: mongoose.Schema.Types.ObjectId,
      reason: String,
      duration: Number
    }],
    workload: {
      estimatedEffort: Number,
      actualEffort: Number,
      complexity: {
        type: String,
        enum: ['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']
      }
    },
    availability: {
      businessHours: Boolean,
      afterHours: Boolean,
      weekend: Boolean,
      holiday: Boolean
    }
  },

  // ==================== Status & Lifecycle ====================
  lifecycle: {
    status: {
      current: {
        type: String,
        enum: ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'ON_HOLD', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REOPENED'],
        default: 'NEW',
        required: true,
        index: true
      },
      subStatus: String,
      lastChanged: Date,
      changedBy: mongoose.Schema.Types.ObjectId
    },
    statusHistory: [{
      status: String,
      subStatus: String,
      timestamp: Date,
      changedBy: mongoose.Schema.Types.ObjectId,
      reason: String,
      notes: String,
      duration: Number
    }],
    resolution: {
      resolved: {
        type: Boolean,
        default: false,
        index: true
      },
      resolvedAt: Date,
      resolvedBy: mongoose.Schema.Types.ObjectId,
      resolutionType: {
        type: String,
        enum: ['SOLVED', 'WORKAROUND', 'CANNOT_REPRODUCE', 'DUPLICATE', 'BY_DESIGN', 'WONT_FIX', 'EXTERNAL_DEPENDENCY', 'USER_ERROR']
      },
      resolutionNotes: String,
      rootCause: String,
      preventiveMeasures: String
    },
    closure: {
      closed: {
        type: Boolean,
        default: false,
        index: true
      },
      closedAt: Date,
      closedBy: mongoose.Schema.Types.ObjectId,
      closureNotes: String,
      autoClosureScheduled: Date,
      preventAutoClose: Boolean
    },
    reopening: {
      reopenCount: {
        type: Number,
        default: 0
      },
      lastReopenedAt: Date,
      reopenHistory: [{
        reopenedAt: Date,
        reopenedBy: mongoose.Schema.Types.ObjectId,
        reason: String,
        previousResolution: String
      }]
    }
  },

  // ==================== Communication & Interactions ====================
  communication: {
    conversations: [{
      conversationId: {
        type: String,
        required: true,
        unique: true
      },
      messageType: {
        type: String,
        enum: ['CUSTOMER_MESSAGE', 'AGENT_REPLY', 'INTERNAL_NOTE', 'SYSTEM_MESSAGE', 'AUTOMATED_RESPONSE']
      },
      sender: {
        userId: mongoose.Schema.Types.ObjectId,
        name: String,
        email: String,
        role: String
      },
      content: {
        text: String,
        html: String,
        plainText: String
      },
      attachments: [{
        fileId: String,
        fileName: String,
        fileSize: Number,
        mimeType: String,
        url: String,
        uploadedAt: Date
      }],
      timestamp: Date,
      isPublic: {
        type: Boolean,
        default: true
      },
      editHistory: [{
        editedAt: Date,
        editedBy: mongoose.Schema.Types.ObjectId,
        previousContent: String
      }],
      sentiment: {
        score: Number,
        analysis: String
      }
    }],
    emailThreads: [{
      threadId: String,
      subject: String,
      participants: [String],
      messageCount: Number,
      lastMessageAt: Date
    }],
    internalNotes: [{
      noteId: String,
      content: String,
      createdBy: mongoose.Schema.Types.ObjectId,
      createdAt: Date,
      visibility: {
        type: String,
        enum: ['TEAM', 'DEPARTMENT', 'ALL_AGENTS']
      },
      mentions: [mongoose.Schema.Types.ObjectId]
    }],
    customerInteractions: {
      totalMessages: Number,
      lastCustomerMessage: Date,
      lastAgentReply: Date,
      averageResponseTime: Number,
      customerSentiment: {
        overall: String,
        trending: String
      }
    }
  },

  // ==================== Escalation Management ====================
  escalation: {
    isEscalated: {
      type: Boolean,
      default: false,
      index: true
    },
    escalationLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    escalationPath: [{
      level: Number,
      escalatedTo: {
        userId: mongoose.Schema.Types.ObjectId,
        teamId: mongoose.Schema.Types.ObjectId,
        role: String
      },
      escalatedAt: Date,
      escalatedBy: mongoose.Schema.Types.ObjectId,
      reason: String,
      expectedResolution: Date,
      resolved: Boolean,
      resolutionNotes: String
    }],
    escalationRules: {
      autoEscalate: Boolean,
      triggers: [{
        condition: String,
        threshold: mongoose.Schema.Types.Mixed,
        action: String
      }],
      preventEscalation: Boolean,
      overrideReason: String
    },
    escalationMetrics: {
      totalEscalations: Number,
      averageTimeToEscalate: Number,
      resolutionAfterEscalation: Number
    }
  },

  // ==================== SLA Management ====================
  slaManagement: {
    appliedSLA: {
      slaId: mongoose.Schema.Types.ObjectId,
      slaName: String,
      tier: {
        type: String,
        enum: ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'STANDARD']
      }
    },
    targets: {
      firstResponse: {
        target: Number,
        unit: {
          type: String,
          enum: ['MINUTES', 'HOURS', 'DAYS']
        },
        deadline: Date,
        achieved: Boolean,
        actualTime: Number
      },
      resolution: {
        target: Number,
        unit: {
          type: String,
          enum: ['MINUTES', 'HOURS', 'DAYS']
        },
        deadline: Date,
        achieved: Boolean,
        actualTime: Number
      },
      everyResponse: {
        target: Number,
        unit: {
          type: String,
          enum: ['MINUTES', 'HOURS', 'DAYS']
        }
      }
    },
    breaches: [{
      breachType: {
        type: String,
        enum: ['FIRST_RESPONSE', 'RESOLUTION', 'EVERY_RESPONSE']
      },
      breachedAt: Date,
      severity: String,
      duration: Number,
      acknowledged: Boolean,
      acknowledgement: {
        by: mongoose.Schema.Types.ObjectId,
        at: Date,
        notes: String
      }
    }],
    pausedPeriods: [{
      pausedAt: Date,
      resumedAt: Date,
      reason: String,
      pausedBy: mongoose.Schema.Types.ObjectId
    }],
    compliance: {
      isCompliant: Boolean,
      complianceRate: Number,
      lastCalculated: Date
    }
  },

  // ==================== Automation & Workflows ====================
  automation: {
    workflows: [{
      workflowId: String,
      workflowName: String,
      triggeredAt: Date,
      status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']
      },
      steps: [{
        stepName: String,
        executed: Boolean,
        result: mongoose.Schema.Types.Mixed,
        executedAt: Date
      }]
    }],
    autoResponses: [{
      responseId: String,
      templateUsed: String,
      sentAt: Date,
      responseType: String,
      success: Boolean
    }],
    rules: [{
      ruleId: String,
      ruleName: String,
      condition: mongoose.Schema.Types.Mixed,
      action: mongoose.Schema.Types.Mixed,
      applied: Boolean,
      appliedAt: Date
    }],
    macros: [{
      macroId: String,
      macroName: String,
      appliedBy: mongoose.Schema.Types.ObjectId,
      appliedAt: Date,
      actions: [String]
    }],
    scheduledActions: [{
      actionId: String,
      actionType: String,
      scheduledFor: Date,
      executed: Boolean,
      executedAt: Date,
      result: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Customer Satisfaction ====================
  satisfaction: {
    survey: {
      sent: Boolean,
      sentAt: Date,
      responseReceived: Boolean,
      respondedAt: Date
    },
    ratings: {
      overall: {
        score: {
          type: Number,
          min: 1,
          max: 5
        },
        feedback: String
      },
      agentRating: {
        score: Number,
        agentId: mongoose.Schema.Types.ObjectId,
        feedback: String
      },
      resolutionRating: {
        score: Number,
        feedback: String
      },
      responseTimeRating: {
        score: Number,
        feedback: String
      }
    },
    nps: {
      score: {
        type: Number,
        min: 0,
        max: 10
      },
      category: {
        type: String,
        enum: ['PROMOTER', 'PASSIVE', 'DETRACTOR']
      },
      feedback: String
    },
    csat: {
      score: Number,
      maxScore: Number,
      percentage: Number
    },
    feedback: {
      positive: [String],
      negative: [String],
      suggestions: [String],
      followUpRequested: Boolean
    }
  },

  // ==================== Knowledge Base Integration ====================
  knowledgeBase: {
    suggestedArticles: [{
      articleId: String,
      title: String,
      relevanceScore: Number,
      viewedByCustomer: Boolean,
      viewedByAgent: Boolean,
      helpful: Boolean
    }],
    articlesUsed: [{
      articleId: String,
      usedAt: Date,
      usedBy: mongoose.Schema.Types.ObjectId,
      effectiveness: String
    }],
    createArticleRequest: {
      requested: Boolean,
      requestedBy: mongoose.Schema.Types.ObjectId,
      requestedAt: Date,
      articleCreated: Boolean,
      createdArticleId: String
    },
    searchQueries: [{
      query: String,
      searchedAt: Date,
      searchedBy: mongoose.Schema.Types.ObjectId,
      resultsFound: Number,
      resultClicked: String
    }]
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    timeMetrics: {
      createdAt: {
        type: Date,
        required: true,
        index: true
      },
      firstResponseAt: Date,
      resolvedAt: Date,
      closedAt: Date,
      totalResponseTime: Number,
      totalResolutionTime: Number,
      businessHoursResponseTime: Number,
      businessHoursResolutionTime: Number,
      customerWaitTime: Number,
      agentWorkTime: Number
    },
    interactionMetrics: {
      totalInteractions: Number,
      customerMessages: Number,
      agentReplies: Number,
      internalNotes: Number,
      averageInteractionTime: Number,
      touchPoints: Number
    },
    performanceMetrics: {
      handoffs: Number,
      escalations: Number,
      reopens: Number,
      firstContactResolution: Boolean,
      resolutionAttempts: Number
    },
    costMetrics: {
      estimatedCost: Number,
      actualCost: Number,
      resourcesUsed: [{
        resource: String,
        quantity: Number,
        cost: Number
      }]
    },
    qualityMetrics: {
      qualityScore: Number,
      reviewedBy: mongoose.Schema.Types.ObjectId,
      reviewedAt: Date,
      reviewNotes: String,
      qualityChecks: [{
        criteria: String,
        passed: Boolean,
        score: Number
      }]
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    regulatoryRequirements: {
      gdprCompliant: Boolean,
      hipaaCompliant: Boolean,
      pciCompliant: Boolean,
      customCompliance: [{
        requirement: String,
        compliant: Boolean,
        verifiedAt: Date
      }]
    },
    dataRetention: {
      retentionPeriod: Number,
      retentionUnit: {
        type: String,
        enum: ['DAYS', 'MONTHS', 'YEARS']
      },
      purgeScheduled: Date,
      dataClassification: {
        type: String,
        enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
      }
    },
    auditTrail: [{
      action: String,
      performedBy: mongoose.Schema.Types.ObjectId,
      performedAt: Date,
      details: mongoose.Schema.Types.Mixed,
      ipAddress: String,
      userAgent: String
    }],
    legalHold: {
      active: Boolean,
      reason: String,
      placedBy: mongoose.Schema.Types.ObjectId,
      placedAt: Date,
      expectedRelease: Date
    },
    privacyControls: {
      containsPII: Boolean,
      piiRedacted: Boolean,
      consentObtained: Boolean,
      dataSubjectRights: [{
        right: String,
        exercised: Boolean,
        exercisedAt: Date
      }]
    }
  },

  // ==================== Integration & External Systems ====================
  integrations: {
    externalSystems: [{
      systemName: String,
      systemId: String,
      ticketId: String,
      syncStatus: {
        type: String,
        enum: ['SYNCED', 'PENDING', 'ERROR', 'DISABLED']
      },
      lastSyncAt: Date,
      syncErrors: [String]
    }],
    crmIntegration: {
      accountId: String,
      contactId: String,
      opportunityId: String,
      caseId: String
    },
    jiraIntegration: {
      issueKey: String,
      projectKey: String,
      issueType: String,
      status: String
    },
    slackIntegration: {
      channelId: String,
      threadTs: String,
      notifications: [{
        messageTs: String,
        sentAt: Date
      }]
    },
    webhooks: [{
      webhookId: String,
      event: String,
      sentAt: Date,
      response: mongoose.Schema.Types.Mixed,
      success: Boolean
    }]
  },

  // ==================== Metadata & Timestamps ====================
  metadata: {
    version: {
      type: Number,
      default: 1
    },
    locale: {
      type: String,
      default: 'en-US'
    },
    timezone: String,
    customFields: mongoose.Schema.Types.Mixed,
    tags: [String],
    labels: [{
      name: String,
      color: String,
      addedBy: mongoose.Schema.Types.ObjectId,
      addedAt: Date
    }],
    flags: {
      isUrgent: Boolean,
      isVIP: Boolean,
      requiresApproval: Boolean,
      isPublic: Boolean,
      isSensitive: Boolean
    },
    visibility: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE', 'INTERNAL', 'RESTRICTED'],
      default: 'PRIVATE'
    }
  }
}, {
  timestamps: true,
  collection: 'support_tickets',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
supportTicketSchema.index({ 'ticketReference.organizationId': 1, 'lifecycle.status.current': 1 });
supportTicketSchema.index({ 'assignment.currentAssignee.userId': 1, 'lifecycle.status.current': 1 });
supportTicketSchema.index({ 'ticketDetails.priority.level': 1, 'lifecycle.status.current': 1 });
supportTicketSchema.index({ 'slaManagement.breaches': 1 });
supportTicketSchema.index({ 'escalation.isEscalated': 1, 'escalation.escalationLevel': 1 });
supportTicketSchema.index({ 'analytics.timeMetrics.createdAt': -1 });
supportTicketSchema.index({ 'ticketDetails.subject': 'text', 'ticketDetails.description': 'text' });

// ==================== Virtual Properties ====================
supportTicketSchema.virtual('isOpen').get(function() {
  return !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(this.lifecycle.status.current);
});

supportTicketSchema.virtual('isOverdue').get(function() {
  if (!this.slaManagement.targets.resolution.deadline) return false;
  return new Date() > this.slaManagement.targets.resolution.deadline && this.isOpen;
});

supportTicketSchema.virtual('age').get(function() {
  return dateHelper.calculateAge(this.analytics.timeMetrics.createdAt);
});

supportTicketSchema.virtual('responseTime').get(function() {
  if (!this.analytics.timeMetrics.firstResponseAt) return null;
  return this.analytics.timeMetrics.firstResponseAt - this.analytics.timeMetrics.createdAt;
});

supportTicketSchema.virtual('resolutionTime').get(function() {
  if (!this.analytics.timeMetrics.resolvedAt) return null;
  return this.analytics.timeMetrics.resolvedAt - this.analytics.timeMetrics.createdAt;
});

// ==================== Instance Methods ====================

/**
 * Assign ticket to agent or team
 * @async
 * @param {Object} assignmentData - Assignment information
 * @returns {Promise<Object>} Assignment result
 */
supportTicketSchema.methods.assignTicket = async function(assignmentData) {
  try {
    const previousAssignee = this.assignment.currentAssignee.userId;
    
    // Update assignment
    this.assignment.currentAssignee = {
      userId: assignmentData.userId,
      assignedAt: new Date(),
      assignedBy: assignmentData.assignedBy,
      assignmentMethod: assignmentData.method || 'MANUAL'
    };
    
    if (assignmentData.teamId) {
      this.assignment.team.teamId = assignmentData.teamId;
      this.assignment.team.teamName = assignmentData.teamName;
    }
    
    // Add to assignment history
    this.assignment.assignmentHistory.push({
      userId: assignmentData.userId,
      teamId: assignmentData.teamId,
      assignedAt: new Date(),
      assignedBy: assignmentData.assignedBy,
      reason: assignmentData.reason
    });
    
    // Update status if needed
    if (this.lifecycle.status.current === 'NEW') {
      await this.updateStatus('OPEN', assignmentData.assignedBy);
    }
    
    await this.save();
    
    // Send notifications
    const notificationService = new NotificationService();
    await notificationService.sendNotification({
      type: 'TICKET_ASSIGNED',
      recipient: assignmentData.userId,
      data: {
        ticketId: this.ticketId,
        subject: this.ticketDetails.subject,
        priority: this.ticketDetails.priority.level
      }
    });
    
    logger.info(`Ticket ${this.ticketId} assigned to user ${assignmentData.userId}`);
    return { success: true, previousAssignee, newAssignee: assignmentData.userId };
    
  } catch (error) {
    logger.error(`Failed to assign ticket ${this.ticketId}:`, error);
    throw error;
  }
};

/**
 * Update ticket status
 * @async
 * @param {String} newStatus - New status
 * @param {String} changedBy - User making the change
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Status update result
 */
supportTicketSchema.methods.updateStatus = async function(newStatus, changedBy, options = {}) {
  try {
    const previousStatus = this.lifecycle.status.current;
    const timestamp = new Date();
    
    // Calculate duration in previous status
    const duration = this.lifecycle.status.lastChanged ? 
      timestamp - this.lifecycle.status.lastChanged : 0;
    
    // Add to status history
    this.lifecycle.statusHistory.push({
      status: previousStatus,
      subStatus: this.lifecycle.status.subStatus,
      timestamp: this.lifecycle.status.lastChanged || this.analytics.timeMetrics.createdAt,
      changedBy: this.lifecycle.status.changedBy,
      duration,
      reason: options.reason,
      notes: options.notes
    });
    
    // Update current status
    this.lifecycle.status = {
      current: newStatus,
      subStatus: options.subStatus,
      lastChanged: timestamp,
      changedBy
    };
    
    // Handle status-specific logic
    switch (newStatus) {
      case 'RESOLVED':
        this.lifecycle.resolution = {
          resolved: true,
          resolvedAt: timestamp,
          resolvedBy: changedBy,
          resolutionType: options.resolutionType || 'SOLVED',
          resolutionNotes: options.resolutionNotes,
          rootCause: options.rootCause
        };
        this.analytics.timeMetrics.resolvedAt = timestamp;
        break;
        
      case 'CLOSED':
        this.lifecycle.closure = {
          closed: true,
          closedAt: timestamp,
          closedBy: changedBy,
          closureNotes: options.closureNotes
        };
        this.analytics.timeMetrics.closedAt = timestamp;
        break;
        
      case 'REOPENED':
        this.lifecycle.reopening.reopenCount++;
        this.lifecycle.reopening.lastReopenedAt = timestamp;
        this.lifecycle.reopening.reopenHistory.push({
          reopenedAt: timestamp,
          reopenedBy: changedBy,
          reason: options.reason,
          previousResolution: this.lifecycle.resolution.resolutionType
        });
        this.lifecycle.resolution.resolved = false;
        this.lifecycle.closure.closed = false;
        break;
        
      case 'ESCALATED':
        this.escalation.isEscalated = true;
        await this.escalateTicket({
          level: options.escalationLevel || 1,
          escalatedTo: options.escalatedTo,
          reason: options.reason,
          escalatedBy: changedBy
        });
        break;
    }
    
    await this.save();
    
    logger.info(`Ticket ${this.ticketId} status updated from ${previousStatus} to ${newStatus}`);
    return { success: true, previousStatus, newStatus, duration };
    
  } catch (error) {
    logger.error(`Failed to update ticket status:`, error);
    throw error;
  }
};

/**
 * Add message to ticket conversation
 * @async
 * @param {Object} messageData - Message information
 * @returns {Promise<Object>} Message addition result
 */
supportTicketSchema.methods.addMessage = async function(messageData) {
  try {
    const conversation = {
      conversationId: `MSG-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      messageType: messageData.type || 'AGENT_REPLY',
      sender: {
        userId: messageData.senderId,
        name: messageData.senderName,
        email: messageData.senderEmail,
        role: messageData.senderRole
      },
      content: {
        text: messageData.text,
        html: messageData.html,
        plainText: stringHelper.stripHtml(messageData.html || messageData.text)
      },
      attachments: messageData.attachments || [],
      timestamp: new Date(),
      isPublic: messageData.isPublic !== false,
      sentiment: messageData.sentiment
    };
    
    this.communication.conversations.push(conversation);
    
    // Update interaction metrics
    this.communication.customerInteractions.totalMessages++;
    if (messageData.type === 'CUSTOMER_MESSAGE') {
      this.communication.customerInteractions.lastCustomerMessage = conversation.timestamp;
    } else if (messageData.type === 'AGENT_REPLY') {
      this.communication.customerInteractions.lastAgentReply = conversation.timestamp;
      
      // Update first response time if applicable
      if (!this.analytics.timeMetrics.firstResponseAt) {
        this.analytics.timeMetrics.firstResponseAt = conversation.timestamp;
        
        // Check SLA compliance
        if (this.slaManagement.targets.firstResponse.deadline) {
          this.slaManagement.targets.firstResponse.achieved = 
            conversation.timestamp <= this.slaManagement.targets.firstResponse.deadline;
          this.slaManagement.targets.firstResponse.actualTime = 
            conversation.timestamp - this.analytics.timeMetrics.createdAt;
        }
      }
    }
    
    await this.save();
    
    // Send notifications if needed
    if (messageData.notifyCustomer && messageData.type === 'AGENT_REPLY') {
      const emailService = new EmailService();
      await emailService.sendEmail({
        to: this.ticketReference.customerId,
        subject: `Re: ${this.ticketDetails.subject}`,
        content: conversation.content.html || conversation.content.text,
        ticketId: this.ticketId
      });
    }
    
    logger.info(`Message added to ticket ${this.ticketId}`);
    return { success: true, conversationId: conversation.conversationId };
    
  } catch (error) {
    logger.error(`Failed to add message to ticket:`, error);
    throw error;
  }
};

/**
 * Escalate ticket
 * @async
 * @param {Object} escalationData - Escalation information
 * @returns {Promise<Object>} Escalation result
 */
supportTicketSchema.methods.escalateTicket = async function(escalationData) {
  try {
    const escalationLevel = escalationData.level || this.escalation.escalationLevel + 1;
    
    this.escalation.isEscalated = true;
    this.escalation.escalationLevel = escalationLevel;
    
    this.escalation.escalationPath.push({
      level: escalationLevel,
      escalatedTo: {
        userId: escalationData.escalatedTo?.userId,
        teamId: escalationData.escalatedTo?.teamId,
        role: escalationData.escalatedTo?.role
      },
      escalatedAt: new Date(),
      escalatedBy: escalationData.escalatedBy,
      reason: escalationData.reason,
      expectedResolution: escalationData.expectedResolution
    });
    
    // Update priority if needed
    if (escalationLevel >= 2 && this.ticketDetails.priority.level !== 'CRITICAL') {
      this.ticketDetails.priority.level = escalationLevel >= 3 ? 'CRITICAL' : 'HIGH';
      this.ticketDetails.priority.calculatedAt = new Date();
    }
    
    // Update assignment if escalated to specific user/team
    if (escalationData.escalatedTo?.userId) {
      await this.assignTicket({
        userId: escalationData.escalatedTo.userId,
        teamId: escalationData.escalatedTo.teamId,
        assignedBy: escalationData.escalatedBy,
        method: 'ESCALATION',
        reason: `Escalated to level ${escalationLevel}`
      });
    }
    
    await this.save();
    
    // Send escalation notifications
    const notificationService = new NotificationService();
    await notificationService.sendNotification({
      type: 'TICKET_ESCALATED',
      recipients: [escalationData.escalatedTo?.userId, escalationData.escalatedBy],
      priority: 'HIGH',
      data: {
        ticketId: this.ticketId,
        escalationLevel,
        reason: escalationData.reason
      }
    });
    
    logger.info(`Ticket ${this.ticketId} escalated to level ${escalationLevel}`);
    return { success: true, escalationLevel };
    
  } catch (error) {
    logger.error(`Failed to escalate ticket:`, error);
    throw error;
  }
};

/**
 * Check and update SLA compliance
 * @async
 * @returns {Promise<Object>} SLA compliance status
 */
supportTicketSchema.methods.checkSLACompliance = async function() {
  try {
    const now = new Date();
    const breaches = [];
    
    // Check first response SLA
    if (this.slaManagement.targets.firstResponse.deadline && 
        !this.analytics.timeMetrics.firstResponseAt) {
      if (now > this.slaManagement.targets.firstResponse.deadline) {
        breaches.push({
          breachType: 'FIRST_RESPONSE',
          breachedAt: this.slaManagement.targets.firstResponse.deadline,
          severity: 'HIGH',
          duration: now - this.slaManagement.targets.firstResponse.deadline
        });
      }
    }
    
    // Check resolution SLA
    if (this.slaManagement.targets.resolution.deadline && 
        !this.lifecycle.resolution.resolved) {
      if (now > this.slaManagement.targets.resolution.deadline) {
        breaches.push({
          breachType: 'RESOLUTION',
          breachedAt: this.slaManagement.targets.resolution.deadline,
          severity: 'CRITICAL',
          duration: now - this.slaManagement.targets.resolution.deadline
        });
      }
    }
    
    // Update breaches
    breaches.forEach(breach => {
      const existingBreach = this.slaManagement.breaches.find(
        b => b.breachType === breach.breachType && !b.acknowledged
      );
      
      if (!existingBreach) {
        this.slaManagement.breaches.push(breach);
      }
    });
    
    // Update compliance status
    this.slaManagement.compliance.isCompliant = breaches.length === 0;
    this.slaManagement.compliance.lastCalculated = now;
    
    if (this.lifecycle.resolution.resolved) {
      const totalTargets = 2; // First response and resolution
      const achievedTargets = 
        (this.slaManagement.targets.firstResponse.achieved ? 1 : 0) +
        (this.slaManagement.targets.resolution.achieved ? 1 : 0);
      this.slaManagement.compliance.complianceRate = (achievedTargets / totalTargets) * 100;
    }
    
    await this.save();
    
    return {
      isCompliant: this.slaManagement.compliance.isCompliant,
      breaches,
      complianceRate: this.slaManagement.compliance.complianceRate
    };
    
  } catch (error) {
    logger.error(`Failed to check SLA compliance:`, error);
    throw error;
  }
};

/**
 * Apply automation rule
 * @async
 * @param {Object} rule - Automation rule to apply
 * @returns {Promise<Object>} Rule application result
 */
supportTicketSchema.methods.applyAutomationRule = async function(rule) {
  try {
    const result = {
      ruleId: rule.id,
      ruleName: rule.name,
      applied: false,
      actions: [],
      error: null
    };
    
    // Evaluate rule condition
    const conditionMet = await this.#evaluateCondition(rule.condition);
    
    if (!conditionMet) {
      result.error = 'Condition not met';
      return result;
    }
    
    // Execute rule actions
    for (const action of rule.actions) {
      try {
        const actionResult = await this.#executeAction(action);
        result.actions.push({
          type: action.type,
          success: actionResult.success,
          result: actionResult.data
        });
      } catch (actionError) {
        result.actions.push({
          type: action.type,
          success: false,
          error: actionError.message
        });
      }
    }
    
    // Record rule application
    this.automation.rules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      condition: rule.condition,
      action: rule.actions,
      applied: true,
      appliedAt: new Date()
    });
    
    await this.save();
    
    result.applied = true;
    return result;
    
  } catch (error) {
    logger.error(`Failed to apply automation rule:`, error);
    throw error;
  }
};

/**
 * Calculate ticket priority score
 * @returns {Number} Priority score
 */
supportTicketSchema.methods.calculatePriorityScore = function() {
  let score = 0;
  
  // Base score from priority level
  const priorityScores = {
    CRITICAL: 100,
    HIGH: 75,
    MEDIUM: 50,
    LOW: 25,
    TRIVIAL: 10
  };
  score += priorityScores[this.ticketDetails.priority.level] || 50;
  
  // Adjust for customer impact
  const impactScores = {
    PLATFORM_WIDE: 30,
    MULTIPLE_ORGANIZATIONS: 25,
    ORGANIZATION: 20,
    DEPARTMENT: 10,
    SINGLE_USER: 5
  };
  score += impactScores[this.ticketDetails.severity?.impact?.scope] || 0;
  
  // Adjust for SLA breaches
  score += this.slaManagement.breaches.length * 10;
  
  // Adjust for escalation
  score += this.escalation.escalationLevel * 15;
  
  // Adjust for VIP status
  if (this.metadata.flags.isVIP) score += 20;
  
  // Adjust for age
  const ageInHours = (Date.now() - this.analytics.timeMetrics.createdAt) / (1000 * 60 * 60);
  if (ageInHours > 24) score += 10;
  if (ageInHours > 48) score += 10;
  if (ageInHours > 72) score += 10;
  
  // Cap at 100
  this.ticketDetails.priority.score = Math.min(score, 100);
  this.ticketDetails.priority.calculatedAt = new Date();
  
  return this.ticketDetails.priority.score;
};

// ==================== Static Methods ====================

/**
 * Find tickets by status
 * @static
 * @async
 * @param {String} status - Ticket status
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Tickets
 */
supportTicketSchema.statics.findByStatus = async function(status, options = {}) {
  const query = { 'lifecycle.status.current': status };
  
  if (options.organizationId) {
    query['ticketReference.organizationId'] = options.organizationId;
  }
  
  if (options.assigneeId) {
    query['assignment.currentAssignee.userId'] = options.assigneeId;
  }
  
  return this.find(query)
    .sort(options.sort || { 'ticketDetails.priority.score': -1, 'analytics.timeMetrics.createdAt': 1 })
    .limit(options.limit || 100);
};

/**
 * Find overdue tickets
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Overdue tickets
 */
supportTicketSchema.statics.findOverdueTickets = async function(options = {}) {
  const now = new Date();
  
  const query = {
    'lifecycle.status.current': { $nin: ['RESOLVED', 'CLOSED', 'CANCELLED'] },
    $or: [
      { 'slaManagement.targets.firstResponse.deadline': { $lt: now } },
      { 'slaManagement.targets.resolution.deadline': { $lt: now } }
    ]
  };
  
  if (options.organizationId) {
    query['ticketReference.organizationId'] = options.organizationId;
  }
  
  return this.find(query).sort({ 'slaManagement.targets.resolution.deadline': 1 });
};

/**
 * Get ticket statistics
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Ticket statistics
 */
supportTicketSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.organizationId) {
    matchStage['ticketReference.organizationId'] = filters.organizationId;
  }
  
  if (filters.dateRange) {
    matchStage['analytics.timeMetrics.createdAt'] = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
    };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        open: {
          $sum: {
            $cond: [
              { $in: ['$lifecycle.status.current', ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING']] },
              1,
              0
            ]
          }
        },
        resolved: {
          $sum: { $cond: ['$lifecycle.resolution.resolved', 1, 0] }
        },
        escalated: {
          $sum: { $cond: ['$escalation.isEscalated', 1, 0] }
        },
        avgResponseTime: { $avg: '$analytics.timeMetrics.totalResponseTime' },
        avgResolutionTime: { $avg: '$analytics.timeMetrics.totalResolutionTime' },
        satisfaction: { $avg: '$satisfaction.ratings.overall.score' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    open: 0,
    resolved: 0,
    escalated: 0,
    avgResponseTime: 0,
    avgResolutionTime: 0,
    satisfaction: 0
  };
};

/**
 * Find tickets needing attention
 * @static
 * @async
 * @param {Object} criteria - Attention criteria
 * @returns {Promise<Array>} Tickets needing attention
 */
supportTicketSchema.statics.findNeedingAttention = async function(criteria = {}) {
  const conditions = [];
  
  // Unassigned high priority tickets
  conditions.push({
    'assignment.currentAssignee.userId': null,
    'ticketDetails.priority.level': { $in: ['CRITICAL', 'HIGH'] }
  });
  
  // SLA breaches
  conditions.push({
    'slaManagement.breaches': {
      $elemMatch: {
        acknowledged: false
      }
    }
  });
  
  // Escalated tickets without resolution
  conditions.push({
    'escalation.isEscalated': true,
    'lifecycle.resolution.resolved': false
  });
  
  // Long waiting customer response
  const waitingThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  conditions.push({
    'communication.customerInteractions.lastCustomerMessage': { $lt: waitingThreshold },
    'communication.customerInteractions.lastAgentReply': {
      $lt: '$communication.customerInteractions.lastCustomerMessage'
    }
  });
  
  return this.find({ $or: conditions })
    .sort({ 'ticketDetails.priority.score': -1 })
    .limit(criteria.limit || 50);
};

// ==================== Private Helper Methods ====================

/**
 * Evaluate automation condition
 * @private
 * @async
 * @param {Object} condition - Condition to evaluate
 * @returns {Promise<Boolean>} Evaluation result
 */
supportTicketSchema.methods.#evaluateCondition = async function(condition) {
  // Implementation would evaluate complex conditions
  // This is a simplified version
  if (condition.field && condition.operator && condition.value) {
    const fieldValue = this.get(condition.field);
    
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return fieldValue?.includes(condition.value);
      case 'greater_than':
        return fieldValue > condition.value;
      case 'less_than':
        return fieldValue < condition.value;
      default:
        return false;
    }
  }
  
  return false;
};

/**
 * Execute automation action
 * @private
 * @async
 * @param {Object} action - Action to execute
 * @returns {Promise<Object>} Execution result
 */
supportTicketSchema.methods.#executeAction = async function(action) {
  switch (action.type) {
    case 'ASSIGN':
      return await this.assignTicket(action.params);
      
    case 'UPDATE_STATUS':
      return await this.updateStatus(action.params.status, action.params.changedBy);
      
    case 'ADD_TAG':
      this.metadata.tags.push(action.params.tag);
      return { success: true, data: action.params.tag };
      
    case 'SET_PRIORITY':
      this.ticketDetails.priority.level = action.params.priority;
      return { success: true, data: action.params.priority };
      
    case 'SEND_EMAIL':
      const emailService = new EmailService();
      return await emailService.sendEmail(action.params);
      
    default:
      throw new AppError(`Unknown action type: ${action.type}`, 400);
  }
};

// ==================== Hooks ====================
supportTicketSchema.pre('save', async function(next) {
  // Update analytics metrics
  if (this.isModified('communication.conversations')) {
    this.analytics.interactionMetrics.totalInteractions = this.communication.conversations.length;
    this.analytics.interactionMetrics.customerMessages = this.communication.conversations.filter(
      c => c.messageType === 'CUSTOMER_MESSAGE'
    ).length;
    this.analytics.interactionMetrics.agentReplies = this.communication.conversations.filter(
      c => c.messageType === 'AGENT_REPLY'
    ).length;
  }
  
  // Calculate priority score if factors changed
  if (this.isModified('ticketDetails.priority') || 
      this.isModified('escalation') || 
      this.isModified('slaManagement.breaches')) {
    this.calculatePriorityScore();
  }
  
  // Update metadata version
  if (!this.isNew) {
    this.metadata.version++;
  }
  
  next();
});

supportTicketSchema.post('save', async function(doc) {
  // Check for SLA compliance after save
  if (doc.slaManagement.appliedSLA) {
    await doc.checkSLACompliance();
  }
});

// ==================== Model Export ====================
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;