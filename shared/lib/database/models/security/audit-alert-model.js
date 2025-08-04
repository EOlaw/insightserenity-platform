'use strict';

/**
 * @fileoverview Audit alert model for security anomaly detection and alerting
 * @module shared/lib/database/models/security/audit-alert-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/utils/constants/alert-types
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const notificationService = require('../../../services/notification-service');
const { ALERT_TYPES, ALERT_CHANNELS } = require('../../../utils/constants/alert-types');

/**
 * Audit alert schema for security and compliance alerting
 */
const auditAlertSchemaDefinition = {
  // ==================== Multi-Tenant Context ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Alert Information ====================
  alert: {
    type: {
      type: String,
      required: true,
      enum: Object.values(ALERT_TYPES),
      index: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 200
    },
    description: {
      type: String,
      required: true
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
      required: true,
      index: true
    },
    priority: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
      index: true
    },
    category: {
      type: String,
      enum: [
        'security_breach',
        'authentication_anomaly',
        'access_violation',
        'data_exfiltration',
        'compliance_violation',
        'system_anomaly',
        'configuration_change',
        'performance_degradation',
        'threshold_exceeded'
      ],
      required: true,
      index: true
    },
    tags: [String]
  },

  // ==================== Source & Trigger ====================
  source: {
    auditLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog',
      index: true
    },
    auditLogIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    }],
    system: {
      type: String,
      enum: ['audit_engine', 'security_scanner', 'anomaly_detector', 'rule_engine', 'manual'],
      default: 'audit_engine'
    },
    rule: {
      ruleId: String,
      ruleName: String,
      ruleVersion: String
    },
    trigger: {
      condition: String,
      threshold: mongoose.Schema.Types.Mixed,
      actualValue: mongoose.Schema.Types.Mixed,
      window: {
        duration: Number,
        unit: {
          type: String,
          enum: ['seconds', 'minutes', 'hours', 'days']
        }
      }
    }
  },

  // ==================== Detection Details ====================
  detection: {
    method: {
      type: String,
      enum: [
        'rule_based',
        'ml_anomaly',
        'threshold',
        'pattern_matching',
        'behavioral',
        'statistical',
        'manual'
      ]
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100
    },
    indicators: [{
      type: String,
      value: mongoose.Schema.Types.Mixed,
      weight: Number
    }],
    context: {
      userBehavior: {
        normalPattern: String,
        detectedPattern: String,
        deviation: Number
      },
      systemMetrics: mongoose.Schema.Types.Mixed,
      relatedEvents: Number,
      timeWindow: {
        start: Date,
        end: Date
      }
    },
    falsePositiveScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },

  // ==================== Impact Assessment ====================
  impact: {
    scope: {
      type: String,
      enum: ['user', 'department', 'organization', 'system', 'global'],
      default: 'user'
    },
    affectedResources: [{
      type: String,
      id: String,
      name: String,
      criticality: {
        type: String,
        enum: ['critical', 'high', 'medium', 'low']
      }
    }],
    affectedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      email: String,
      roles: [String]
    }],
    dataExposure: {
      detected: Boolean,
      recordCount: Number,
      dataSensitivity: String,
      dataTypes: [String]
    },
    businessImpact: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'minimal']
    },
    estimatedCost: {
      amount: Number,
      currency: String
    }
  },

  // ==================== Response & Actions ====================
  response: {
    status: {
      type: String,
      enum: ['new', 'acknowledged', 'investigating', 'mitigating', 'resolved', 'false_positive', 'ignored'],
      default: 'new',
      index: true
    },
    acknowledgedAt: Date,
    acknowledgedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String
    },
    assignedTo: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      team: String,
      assignedAt: Date
    },
    actions: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      result: String,
      notes: String,
      automated: Boolean
    }],
    resolution: {
      resolvedAt: Date,
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      summary: String,
      rootCause: String,
      preventiveMeasures: [String],
      lessonsLearned: String
    },
    escalation: {
      required: Boolean,
      level: Number,
      escalatedAt: Date,
      escalatedTo: String,
      reason: String
    }
  },

  // ==================== Notification & Communication ====================
  notifications: {
    channels: [{
      type: {
        type: String,
        enum: Object.values(ALERT_CHANNELS)
      },
      enabled: Boolean,
      sentAt: Date,
      success: Boolean,
      error: String,
      recipients: [String]
    }],
    settings: {
      immediate: Boolean,
      digest: Boolean,
      escalationInterval: Number,
      maxNotifications: Number
    },
    history: [{
      channel: String,
      recipient: String,
      sentAt: Date,
      status: String,
      messageId: String
    }],
    suppressUntil: Date
  },

  // ==================== Investigation & Evidence ====================
  investigation: {
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'abandoned'],
      default: 'pending'
    },
    findings: [{
      timestamp: Date,
      investigator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      finding: String,
      evidence: [String],
      severity: String
    }],
    evidence: [{
      type: {
        type: String,
        enum: ['log', 'screenshot', 'file', 'database_record', 'network_capture', 'other']
      },
      description: String,
      location: String,
      hash: String,
      collectedAt: Date,
      collectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    timeline: [{
      timestamp: Date,
      event: String,
      actor: String,
      details: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Compliance & Reporting ====================
  compliance: {
    frameworks: [{
      type: String,
      enum: ['gdpr', 'hipaa', 'sox', 'pci-dss', 'iso27001', 'ccpa']
    }],
    reportingRequired: Boolean,
    reportedTo: [{
      authority: String,
      reportedAt: Date,
      referenceNumber: String,
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    breachNotification: {
      required: Boolean,
      deadline: Date,
      notified: Boolean,
      notificationDate: Date
    },
    regulatoryActions: [{
      action: String,
      requiredBy: Date,
      completedAt: Date,
      status: String
    }]
  },

  // ==================== Relationships ====================
  relationships: {
    parentAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditAlert'
    },
    childAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditAlert'
    }],
    relatedIncidents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityIncident'
    }],
    correlationId: {
      type: String,
      index: true
    },
    groupId: String
  },

  // ==================== Metrics & Analytics ====================
  metrics: {
    detectionTime: Number, // milliseconds from event to alert
    acknowledgeTime: Number, // milliseconds from alert to acknowledgment
    resolutionTime: Number, // milliseconds from alert to resolution
    totalResponseTime: Number,
    notificationDelay: Number,
    investigationDuration: Number,
    impactDuration: Number
  },

  // ==================== Metadata ====================
  metadata: {
    version: {
      type: String,
      default: '1.0'
    },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development', 'test']
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    tags: [String],
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      visibility: {
        type: String,
        enum: ['private', 'team', 'organization'],
        default: 'team'
      }
    }]
  }
};

// Create schema
const auditAlertSchema = BaseModel.createSchema(auditAlertSchemaDefinition, {
  collection: 'audit_alerts',
  timestamps: true,
  strict: true
});

// ==================== Indexes ====================
auditAlertSchema.index({ organizationId: 1, createdAt: -1 });
auditAlertSchema.index({ 'alert.severity': 1, 'response.status': 1 });
auditAlertSchema.index({ 'response.assignedTo.userId': 1, 'response.status': 1 });
auditAlertSchema.index({ 'source.auditLogId': 1 });
auditAlertSchema.index({ 'relationships.correlationId': 1 });
auditAlertSchema.index({ 'compliance.breachNotification.deadline': 1 });
auditAlertSchema.index({ createdAt: -1, 'alert.severity': 1 });

// Text search
auditAlertSchema.index({
  'alert.title': 'text',
  'alert.description': 'text',
  'response.resolution.summary': 'text'
});

// ==================== Virtual Fields ====================
auditAlertSchema.virtual('isOpen').get(function() {
  return !['resolved', 'false_positive', 'ignored'].includes(this.response.status);
});

auditAlertSchema.virtual('isOverdue').get(function() {
  if (!this.isOpen) return false;
  
  const slaHours = {
    critical: 1,
    high: 4,
    medium: 24,
    low: 72,
    info: 168 // 1 week
  };
  
  const hoursElapsed = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60);
  return hoursElapsed > (slaHours[this.alert.severity] || 24);
});

auditAlertSchema.virtual('requiresEscalation').get(function() {
  return this.isOverdue || 
         (this.alert.severity === 'critical' && this.response.status === 'new') ||
         this.response.escalation.required;
});

auditAlertSchema.virtual('timeToAcknowledge').get(function() {
  if (!this.response.acknowledgedAt) return null;
  return this.response.acknowledgedAt.getTime() - this.createdAt.getTime();
});

auditAlertSchema.virtual('timeToResolve').get(function() {
  if (!this.response.resolution?.resolvedAt) return null;
  return this.response.resolution.resolvedAt.getTime() - this.createdAt.getTime();
});

// ==================== Pre-save Middleware ====================
auditAlertSchema.pre('save', async function(next) {
  try {
    // Calculate metrics
    if (this.response.acknowledgedAt && !this.metrics.acknowledgeTime) {
      this.metrics.acknowledgeTime = this.response.acknowledgedAt.getTime() - this.createdAt.getTime();
    }
    
    if (this.response.resolution?.resolvedAt && !this.metrics.resolutionTime) {
      this.metrics.resolutionTime = this.response.resolution.resolvedAt.getTime() - this.createdAt.getTime();
      this.metrics.totalResponseTime = this.metrics.resolutionTime;
    }

    // Set escalation requirements
    if (!this.response.escalation.required && this.alert.severity === 'critical') {
      this.response.escalation.required = true;
      this.response.escalation.level = 1;
    }

    // Check breach notification requirements
    if (this.compliance.frameworks?.includes('gdpr') && 
        this.impact.dataExposure?.detected &&
        !this.compliance.breachNotification.deadline) {
      // GDPR requires notification within 72 hours
      this.compliance.breachNotification.required = true;
      this.compliance.breachNotification.deadline = new Date(
        this.createdAt.getTime() + 72 * 60 * 60 * 1000
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
auditAlertSchema.post('save', async function(doc) {
  try {
    // Send notifications for new critical/high alerts
    if (doc.isNew && ['critical', 'high'].includes(doc.alert.severity)) {
      await doc.sendNotifications();
    }

    // Check if we need to create a security incident
    if (doc.alert.severity === 'critical' && 
        doc.impact.businessImpact === 'critical' &&
        !doc.relationships.relatedIncidents?.length) {
      const SecurityIncident = mongoose.model('SecurityIncident');
      const incident = await SecurityIncident.createFromAlert(doc);
      
      doc.relationships.relatedIncidents = [incident._id];
      await doc.save();
    }

  } catch (error) {
    logger.error('Error in audit alert post-save hook', {
      alertId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
auditAlertSchema.methods.acknowledge = async function(userId) {
  if (this.response.acknowledgedAt) {
    throw new AppError('Alert already acknowledged', 400, 'ALREADY_ACKNOWLEDGED');
  }

  this.response.status = 'acknowledged';
  this.response.acknowledgedAt = new Date();
  this.response.acknowledgedBy = { userId };
  
  this.response.actions.push({
    action: 'acknowledged',
    performedBy: userId,
    performedAt: new Date(),
    result: 'Alert acknowledged by user'
  });

  await this.save();
  
  logger.info('Alert acknowledged', {
    alertId: this._id,
    userId,
    severity: this.alert.severity
  });

  return this;
};

auditAlertSchema.methods.assign = async function(userId, team = null) {
  this.response.assignedTo = {
    userId,
    team,
    assignedAt: new Date()
  };
  
  if (this.response.status === 'new') {
    this.response.status = 'investigating';
  }

  this.response.actions.push({
    action: 'assigned',
    performedBy: userId,
    performedAt: new Date(),
    result: `Assigned to user ${userId}${team ? ` (${team})` : ''}`
  });

  await this.save();
  
  // Notify assigned user
  await this.notifyAssignee(userId);

  return this;
};

auditAlertSchema.methods.addInvestigationFinding = async function(finding, investigatorId) {
  if (!this.investigation.findings) {
    this.investigation.findings = [];
  }

  this.investigation.findings.push({
    timestamp: new Date(),
    investigator: investigatorId,
    finding: finding.finding,
    evidence: finding.evidence || [],
    severity: finding.severity
  });

  if (this.investigation.status === 'pending') {
    this.investigation.status = 'active';
  }

  await this.save();
  return this;
};

auditAlertSchema.methods.resolve = async function(resolution, resolvedBy) {
  if (this.response.status === 'resolved') {
    throw new AppError('Alert already resolved', 400, 'ALREADY_RESOLVED');
  }

  this.response.status = 'resolved';
  this.response.resolution = {
    resolvedAt: new Date(),
    resolvedBy,
    summary: resolution.summary,
    rootCause: resolution.rootCause,
    preventiveMeasures: resolution.preventiveMeasures || [],
    lessonsLearned: resolution.lessonsLearned
  };

  this.response.actions.push({
    action: 'resolved',
    performedBy: resolvedBy,
    performedAt: new Date(),
    result: 'Alert resolved',
    notes: resolution.summary
  });

  this.investigation.status = 'completed';

  await this.save();
  
  logger.info('Alert resolved', {
    alertId: this._id,
    severity: this.alert.severity,
    resolutionTime: this.metrics.resolutionTime
  });

  return this;
};

auditAlertSchema.methods.markAsFalsePositive = async function(reason, markedBy) {
  this.response.status = 'false_positive';
  this.response.resolution = {
    resolvedAt: new Date(),
    resolvedBy: markedBy,
    summary: `False positive: ${reason}`
  };

  this.response.actions.push({
    action: 'marked_false_positive',
    performedBy: markedBy,
    performedAt: new Date(),
    result: 'Marked as false positive',
    notes: reason
  });

  // Update detection confidence for learning
  if (this.detection.falsePositiveScore < 100) {
    this.detection.falsePositiveScore = Math.min(
      this.detection.falsePositiveScore + 20,
      100
    );
  }

  await this.save();
  return this;
};

auditAlertSchema.methods.escalate = async function(level, reason, escalatedTo) {
  this.response.escalation = {
    required: true,
    level: level || (this.response.escalation.level || 0) + 1,
    escalatedAt: new Date(),
    escalatedTo,
    reason
  };

  this.response.actions.push({
    action: 'escalated',
    performedAt: new Date(),
    result: `Escalated to level ${this.response.escalation.level}`,
    notes: reason
  });

  await this.save();
  
  // Send escalation notifications
  await this.sendEscalationNotifications();

  return this;
};

auditAlertSchema.methods.sendNotifications = async function() {
  const channels = this.notifications.channels.filter(c => c.enabled);
  
  for (const channel of channels) {
    try {
      const result = await notificationService.send({
        channel: channel.type,
        recipients: channel.recipients,
        template: 'security-alert',
        data: {
          alert: this.toObject(),
          organizationId: this.organizationId
        }
      });

      channel.sentAt = new Date();
      channel.success = true;
      channel.messageId = result.messageId;

      this.notifications.history.push({
        channel: channel.type,
        recipient: channel.recipients.join(','),
        sentAt: new Date(),
        status: 'sent',
        messageId: result.messageId
      });

    } catch (error) {
      channel.success = false;
      channel.error = error.message;
      
      logger.error('Failed to send alert notification', {
        alertId: this._id,
        channel: channel.type,
        error: error.message
      });
    }
  }

  await this.save();
};

auditAlertSchema.methods.sendEscalationNotifications = async function() {
  // Get escalation contacts based on level
  const Organization = mongoose.model('Organization');
  const org = await Organization.findById(this.organizationId);
  
  const escalationContacts = org.settings.security.escalationContacts?.[this.response.escalation.level] || [];
  
  if (!escalationContacts.length) {
    logger.warn('No escalation contacts configured', {
      alertId: this._id,
      level: this.response.escalation.level
    });
    return;
  }

  await notificationService.send({
    channel: 'email',
    recipients: escalationContacts,
    template: 'security-alert-escalation',
    priority: 'high',
    data: {
      alert: this.toObject(),
      escalationLevel: this.response.escalation.level,
      reason: this.response.escalation.reason
    }
  });
};

auditAlertSchema.methods.notifyAssignee = async function(userId) {
  const User = mongoose.model('User');
  const user = await User.findById(userId);
  
  if (!user) return;

  await notificationService.send({
    channel: 'email',
    recipients: [user.email],
    template: 'alert-assignment',
    data: {
      alert: this.toObject(),
      assignee: user.toObject()
    }
  });
};

auditAlertSchema.methods.addEvidence = async function(evidence, collectedBy) {
  if (!this.investigation.evidence) {
    this.investigation.evidence = [];
  }

  this.investigation.evidence.push({
    ...evidence,
    collectedAt: new Date(),
    collectedBy
  });

  await this.save();
  return this;
};

auditAlertSchema.methods.reportToAuthority = async function(authority, reportedBy, referenceNumber) {
  if (!this.compliance.reportedTo) {
    this.compliance.reportedTo = [];
  }

  this.compliance.reportedTo.push({
    authority,
    reportedAt: new Date(),
    referenceNumber,
    reportedBy
  });

  if (this.compliance.breachNotification?.required) {
    this.compliance.breachNotification.notified = true;
    this.compliance.breachNotification.notificationDate = new Date();
  }

  await this.save();
  
  logger.info('Alert reported to authority', {
    alertId: this._id,
    authority,
    referenceNumber
  });

  return this;
};

// ==================== Static Methods ====================
auditAlertSchema.statics.createFromAuditLog = async function(auditLog) {
  const alertData = {
    tenantId: auditLog.tenantId,
    organizationId: auditLog.organizationId,
    alert: {
      type: this.determineAlertType(auditLog),
      title: this.generateAlertTitle(auditLog),
      description: this.generateAlertDescription(auditLog),
      severity: auditLog.event.severity,
      priority: this.calculatePriority(auditLog),
      category: this.determineCategory(auditLog)
    },
    source: {
      auditLogId: auditLog._id,
      system: 'audit_engine',
      trigger: {
        condition: auditLog.event.type,
        actualValue: auditLog.event.risk.score
      }
    },
    detection: {
      method: 'rule_based',
      confidence: 85,
      indicators: auditLog.security.threatIndicators || []
    },
    impact: {
      scope: this.determineScope(auditLog),
      affectedResources: [{
        type: auditLog.resource.type,
        id: auditLog.resource.id,
        name: auditLog.resource.name
      }],
      affectedUsers: [{
        userId: auditLog.actor.userId,
        email: auditLog.actor.email,
        roles: auditLog.actor.roles
      }]
    },
    notifications: {
      channels: this.getDefaultChannels(auditLog.event.severity),
      settings: {
        immediate: auditLog.event.severity === 'critical'
      }
    }
  };

  const alert = new this(alertData);
  await alert.save();
  
  return alert;
};

auditAlertSchema.statics.determineAlertType = function(auditLog) {
  if (auditLog.security.anomalyDetected) return 'anomaly_detection';
  if (auditLog.result.status === 'failure' && auditLog.event.category === 'authentication') {
    return 'authentication_failure';
  }
  if (auditLog.event.risk.score > 80) return 'high_risk_activity';
  return 'security_event';
};

auditAlertSchema.statics.generateAlertTitle = function(auditLog) {
  const titles = {
    authentication_failure: `Authentication Failure: ${auditLog.actor.email || 'Unknown User'}`,
    anomaly_detection: `Anomaly Detected: ${auditLog.event.description}`,
    high_risk_activity: `High Risk Activity: ${auditLog.event.type}`,
    security_event: `Security Event: ${auditLog.event.description}`
  };
  
  const type = this.determineAlertType(auditLog);
  return titles[type] || `Security Alert: ${auditLog.event.type}`;
};

auditAlertSchema.statics.generateAlertDescription = function(auditLog) {
  let description = `${auditLog.event.description}\n\n`;
  description += `Actor: ${auditLog.actor.email || auditLog.actor.userId}\n`;
  description += `Resource: ${auditLog.resource.type} (${auditLog.resource.id})\n`;
  description += `Risk Score: ${auditLog.event.risk.score}/100\n`;
  
  if (auditLog.security.threatIndicators?.length) {
    description += `\nThreat Indicators:\n`;
    auditLog.security.threatIndicators.forEach(indicator => {
      description += `- ${indicator.type}: ${indicator.details}\n`;
    });
  }
  
  return description;
};

auditAlertSchema.statics.calculatePriority = function(auditLog) {
  const severityPriority = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    info: 5
  };
  
  let priority = severityPriority[auditLog.event.severity] || 3;
  
  // Adjust based on risk score
  if (auditLog.event.risk.score > 90) priority = Math.min(priority - 1, 1);
  
  return priority;
};

auditAlertSchema.statics.determineCategory = function(auditLog) {
  if (auditLog.security.anomalyDetected) return 'system_anomaly';
  if (auditLog.event.category === 'authentication') return 'authentication_anomaly';
  if (auditLog.event.category === 'authorization') return 'access_violation';
  if (auditLog.event.category === 'data_access' && auditLog.changes?.dataSize > 1000000) {
    return 'data_exfiltration';
  }
  return 'security_breach';
};

auditAlertSchema.statics.determineScope = function(auditLog) {
  if (auditLog.resource.type === 'system') return 'system';
  if (auditLog.resource.type === 'organization') return 'organization';
  if (auditLog.resource.type === 'department') return 'department';
  return 'user';
};

auditAlertSchema.statics.getDefaultChannels = function(severity) {
  const channels = [
    {
      type: 'in_app',
      enabled: true,
      recipients: ['security_team']
    }
  ];
  
  if (['critical', 'high'].includes(severity)) {
    channels.push({
      type: 'email',
      enabled: true,
      recipients: ['security@organization.com']
    });
  }
  
  if (severity === 'critical') {
    channels.push({
      type: 'sms',
      enabled: true,
      recipients: ['on_call_security']
    });
  }
  
  return channels;
};

auditAlertSchema.statics.getOpenAlerts = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    'response.status': { $in: ['new', 'acknowledged', 'investigating', 'mitigating'] }
  };
  
  if (options.severity) {
    query['alert.severity'] = options.severity;
  }
  
  if (options.assignedTo) {
    query['response.assignedTo.userId'] = options.assignedTo;
  }
  
  return await this.find(query)
    .sort({ 'alert.priority': 1, createdAt: -1 })
    .limit(options.limit || 50)
    .populate('source.auditLogId', 'event.type event.description')
    .lean();
};

auditAlertSchema.statics.getAlertStatistics = async function(organizationId, timeRange = '7d') {
  const timeRanges = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };

  const startDate = new Date(Date.now() - (timeRanges[timeRange] || timeRanges['7d']));

  const stats = await this.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(organizationId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              open: {
                $sum: {
                  $cond: [
                    { $in: ['$response.status', ['new', 'acknowledged', 'investigating', 'mitigating']] },
                    1,
                    0
                  ]
                }
              },
              resolved: {
                $sum: { $cond: [{ $eq: ['$response.status', 'resolved'] }, 1, 0] }
              },
              falsePositives: {
                $sum: { $cond: [{ $eq: ['$response.status', 'false_positive'] }, 1, 0] }
              },
              avgResponseTime: { $avg: '$metrics.totalResponseTime' },
              avgAcknowledgeTime: { $avg: '$metrics.acknowledgeTime' }
            }
          }
        ],
        bySeverity: [
          {
            $group: {
              _id: '$alert.severity',
              count: { $sum: 1 },
              avgResponseTime: { $avg: '$metrics.totalResponseTime' }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: '$alert.category',
              count: { $sum: 1 }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$response.status',
              count: { $sum: 1 }
            }
          }
        ],
        timeline: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              },
              total: { $sum: 1 },
              critical: {
                $sum: { $cond: [{ $eq: ['$alert.severity', 'critical'] }, 1, 0] }
              },
              high: {
                $sum: { $cond: [{ $eq: ['$alert.severity', 'high'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ],
        topTypes: [
          {
            $group: {
              _id: '$alert.type',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);

  return stats[0];
};

auditAlertSchema.statics.correlateAlerts = async function(alertId, timeWindow = 3600000) {
  const alert = await this.findById(alertId);
  if (!alert) return [];

  const startTime = new Date(alert.createdAt.getTime() - timeWindow);
  const endTime = new Date(alert.createdAt.getTime() + timeWindow);

  const relatedAlerts = await this.find({
    _id: { $ne: alertId },
    organizationId: alert.organizationId,
    createdAt: { $gte: startTime, $lte: endTime },
    $or: [
      { 'source.auditLogId': alert.source.auditLogId },
      { 'impact.affectedUsers.userId': { $in: alert.impact.affectedUsers.map(u => u.userId) } },
      { 'impact.affectedResources.id': { $in: alert.impact.affectedResources.map(r => r.id) } }
    ]
  }).limit(20);

  // Update correlation IDs
  if (relatedAlerts.length > 0) {
    const correlationId = alert.relationships.correlationId || 
                         mongoose.Types.ObjectId().toString();
    
    await this.updateMany(
      {
        _id: { $in: [alertId, ...relatedAlerts.map(a => a._id)] }
      },
      {
        $set: { 'relationships.correlationId': correlationId }
      }
    );
  }

  return relatedAlerts;
};

// Create and export model
const AuditAlertModel = BaseModel.createModel('AuditAlert', auditAlertSchema);

module.exports = {
  schema: auditAlertSchema,
  model: AuditAlertModel
};