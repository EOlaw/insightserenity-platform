'use strict';

/**
 * @fileoverview Security incident model for managing breaches and security events
 * @module shared/lib/database/models/security/security-incident-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/utils/constants/incident-types
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const notificationService = require('../../../services/notification-service');
const { INCIDENT_TYPES, INCIDENT_SEVERITIES } = require('../../../utils/constants/incident-types');

/**
 * Security incident schema for breach management and response
 */
const securityIncidentSchemaDefinition = {
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

  // ==================== Incident Information ====================
  incident: {
    id: {
      type: String,
      unique: true,
      required: true,
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
    type: {
      type: String,
      enum: Object.values(INCIDENT_TYPES),
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: [
        'data_breach',
        'unauthorized_access',
        'malware',
        'ransomware',
        'phishing',
        'ddos',
        'insider_threat',
        'physical_breach',
        'system_compromise',
        'account_compromise',
        'data_loss',
        'service_disruption',
        'compliance_violation',
        'other'
      ],
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: Object.values(INCIDENT_SEVERITIES),
      required: true,
      index: true
    },
    priority: {
      type: String,
      enum: ['p1', 'p2', 'p3', 'p4', 'p5'],
      required: true,
      index: true
    },
    confidentiality: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'secret'],
      default: 'confidential'
    },
    tags: [String]
  },

  // ==================== Detection & Discovery ====================
  detection: {
    detectedAt: {
      type: Date,
      required: true,
      index: true
    },
    detectedBy: {
      method: {
        type: String,
        enum: ['automated', 'manual', 'third_party', 'user_report', 'audit', 'monitoring'],
        required: true
      },
      system: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      description: String
    },
    indicators: [{
      type: String,
      value: mongoose.Schema.Types.Mixed,
      source: String,
      confidence: Number,
      timestamp: Date
    }],
    initialAssessment: {
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      findings: String,
      recommendedSeverity: String
    },
    falsePositive: {
      determined: Boolean,
      determinedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      determinedAt: Date,
      reason: String
    }
  },

  // ==================== Impact Assessment ====================
  impact: {
    scope: {
      users: {
        affected: Number,
        compromised: Number,
        notified: Number
      },
      systems: {
        affected: [String],
        compromised: [String],
        isolated: [String]
      },
      data: {
        recordsAffected: Number,
        recordsExposed: Number,
        dataTypes: [{
          type: String,
          sensitivity: String,
          volume: Number
        }],
        piiExposed: Boolean,
        financialDataExposed: Boolean,
        healthDataExposed: Boolean
      },
      services: {
        affected: [String],
        downtime: Number,
        degradation: String
      }
    },
    financial: {
      estimatedLoss: {
        amount: Number,
        currency: String
      },
      actualLoss: {
        amount: Number,
        currency: String
      },
      categories: [{
        category: String,
        amount: Number,
        description: String
      }]
    },
    business: {
      operationalImpact: {
        type: String,
        enum: ['none', 'minimal', 'moderate', 'significant', 'severe']
      },
      reputationalImpact: {
        type: String,
        enum: ['none', 'minimal', 'moderate', 'significant', 'severe']
      },
      regulatoryImpact: {
        type: String,
        enum: ['none', 'minimal', 'moderate', 'significant', 'severe']
      },
      customerImpact: {
        type: String,
        enum: ['none', 'minimal', 'moderate', 'significant', 'severe']
      }
    },
    classification: {
      confidentialityImpact: {
        type: String,
        enum: ['none', 'low', 'moderate', 'high']
      },
      integrityImpact: {
        type: String,
        enum: ['none', 'low', 'moderate', 'high']
      },
      availabilityImpact: {
        type: String,
        enum: ['none', 'low', 'moderate', 'high']
      }
    }
  },

  // ==================== Timeline & Status ====================
  timeline: {
    incidentStart: Date,
    incidentEnd: Date,
    containmentStart: Date,
    containmentEnd: Date,
    eradicationStart: Date,
    eradicationEnd: Date,
    recoveryStart: Date,
    recoveryEnd: Date,
    closedAt: Date,
    timeToDetect: Number, // minutes
    timeToContain: Number, // minutes
    timeToResolve: Number, // minutes
    totalDowntime: Number // minutes
  },

  status: {
    state: {
      type: String,
      enum: [
        'new',
        'triaged',
        'investigating',
        'containing',
        'eradicating',
        'recovering',
        'monitoring',
        'resolved',
        'closed',
        'reopened'
      ],
      default: 'new',
      index: true
    },
    phase: {
      type: String,
      enum: ['detection', 'analysis', 'containment', 'eradication', 'recovery', 'lessons_learned']
    },
    progress: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      lastUpdate: Date,
      blockers: [String]
    }
  },

  // ==================== Response Team & Actions ====================
  response: {
    team: {
      lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      members: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        role: String,
        department: String,
        joinedAt: Date,
        leftAt: Date
      }],
      external: [{
        name: String,
        company: String,
        role: String,
        contact: String,
        joinedAt: Date
      }]
    },
    plan: {
      planId: String,
      planName: String,
      version: String,
      activatedAt: Date,
      deviations: [{
        step: String,
        deviation: String,
        reason: String,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    },
    actions: [{
      actionId: String,
      action: String,
      type: {
        type: String,
        enum: ['containment', 'eradication', 'recovery', 'investigation', 'communication', 'legal']
      },
      priority: String,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped']
      },
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      startedAt: Date,
      completedAt: Date,
      outcome: String,
      evidence: [String],
      dependencies: [String]
    }],
    decisions: [{
      decision: String,
      rationale: String,
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      decidedAt: Date,
      stakeholders: [String],
      outcome: String
    }]
  },

  // ==================== Investigation & Forensics ====================
  investigation: {
    status: {
      type: String,
      enum: ['not_started', 'ongoing', 'completed', 'inconclusive'],
      default: 'not_started'
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    findings: [{
      timestamp: Date,
      finding: String,
      evidence: [{
        type: String,
        location: String,
        hash: String,
        collectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        collectedAt: Date,
        chainOfCustody: [{
          action: String,
          performedBy: String,
          timestamp: Date
        }]
      }],
      significance: String,
      investigator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    rootCause: {
      identified: Boolean,
      description: String,
      category: {
        type: String,
        enum: ['human_error', 'process_failure', 'technical_failure', 'external_attack', 'insider_threat', 'unknown']
      },
      contributingFactors: [String]
    },
    attackVector: {
      primary: String,
      secondary: [String],
      exploitedVulnerabilities: [{
        cve: String,
        description: String,
        severity: String,
        patchAvailable: Boolean
      }],
      ttps: [{ // Tactics, Techniques, and Procedures
        tactic: String,
        technique: String,
        procedure: String,
        mitreAttackId: String
      }]
    },
    artifacts: [{
      name: String,
      type: {
        type: String,
        enum: ['log', 'memory_dump', 'disk_image', 'network_capture', 'malware_sample', 'document', 'other']
      },
      location: String,
      size: Number,
      hash: String,
      analyzed: Boolean,
      findings: String
    }]
  },

  // ==================== Communication & Notification ====================
  communication: {
    internal: {
      notifications: [{
        audience: String,
        method: String,
        sentAt: Date,
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        content: String,
        acknowledged: Boolean
      }],
      updates: [{
        timestamp: Date,
        update: String,
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        distribution: [String]
      }],
      escalations: [{
        level: Number,
        escalatedTo: String,
        escalatedAt: Date,
        reason: String,
        response: String
      }]
    },
    external: {
      customers: {
        notificationRequired: Boolean,
        notificationSent: Boolean,
        sentAt: Date,
        method: [String],
        template: String,
        recipientCount: Number
      },
      media: {
        statementRequired: Boolean,
        statementReleased: Boolean,
        releasedAt: Date,
        spokesperson: String,
        channels: [String]
      },
      partners: {
        notified: [{
          partner: String,
          notifiedAt: Date,
          method: String,
          response: String
        }]
      }
    },
    regulatory: {
      notifications: [{
        authority: String,
        required: Boolean,
        deadline: Date,
        submittedAt: Date,
        submittedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        referenceNumber: String,
        status: String,
        updates: [{
          date: Date,
          update: String
        }]
      }],
      breachNotification: {
        required: Boolean,
        submitted: Boolean,
        submittedAt: Date,
        affectedJurisdictions: [String],
        notificationDeadlines: [{
          jurisdiction: String,
          deadline: Date,
          met: Boolean
        }]
      }
    }
  },

  // ==================== Containment & Remediation ====================
  containment: {
    measures: [{
      measure: String,
      type: {
        type: String,
        enum: ['isolation', 'access_restriction', 'service_suspension', 'credential_reset', 'patch', 'configuration_change']
      },
      scope: String,
      implementedAt: Date,
      implementedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      effectiveness: String,
      sideEffects: [String]
    }],
    isolated: {
      systems: [String],
      networks: [String],
      accounts: [String],
      services: [String]
    },
    preserved: {
      evidence: Boolean,
      systems: [String],
      logs: [String]
    }
  },

  remediation: {
    actions: [{
      action: String,
      category: {
        type: String,
        enum: ['patch', 'configuration', 'process', 'training', 'policy', 'technical_control']
      },
      priority: String,
      status: String,
      owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      deadline: Date,
      completedAt: Date,
      verification: {
        required: Boolean,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        verifiedAt: Date
      }
    }],
    vulnerabilities: [{
      vulnerability: String,
      severity: String,
      remediated: Boolean,
      remediationMethod: String,
      remediatedAt: Date
    }],
    improvements: [{
      area: String,
      recommendation: String,
      priority: String,
      status: String,
      owner: String,
      targetDate: Date
    }]
  },

  // ==================== Legal & Compliance ====================
  legal: {
    counsel: {
      engaged: Boolean,
      engagedAt: Date,
      firm: String,
      contact: String,
      privileged: Boolean
    },
    litigation: {
      risk: {
        type: String,
        enum: ['none', 'low', 'moderate', 'high', 'active']
      },
      cases: [{
        caseId: String,
        plaintiff: String,
        filedDate: Date,
        status: String,
        outcome: String
      }]
    },
    preservation: {
      holdIssued: Boolean,
      issuedAt: Date,
      scope: String,
      expiryDate: Date
    },
    liability: {
      assessment: String,
      estimatedExposure: {
        amount: Number,
        currency: String
      },
      insurance: {
        covered: Boolean,
        claimFiled: Boolean,
        claimNumber: String,
        deductible: Number
      }
    }
  },

  compliance: {
    frameworks: [{
      framework: String,
      applicable: Boolean,
      requirements: [{
        requirement: String,
        met: Boolean,
        evidence: String
      }],
      violations: [{
        violation: String,
        severity: String,
        remediated: Boolean
      }]
    }],
    audits: [{
      type: String,
      performedBy: String,
      performedAt: Date,
      findings: String,
      report: String
    }],
    certifications: {
      impacted: [String],
      suspended: [String],
      revoked: [String]
    }
  },

  // ==================== Lessons Learned & Improvements ====================
  postIncident: {
    review: {
      conducted: Boolean,
      conductedAt: Date,
      facilitator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      report: String
    },
    lessonsLearned: [{
      category: String,
      lesson: String,
      recommendation: String,
      priority: String,
      owner: String,
      implemented: Boolean
    }],
    improvements: {
      processes: [{
        process: String,
        improvement: String,
        status: String
      }],
      technologies: [{
        technology: String,
        improvement: String,
        status: String
      }],
      training: [{
        topic: String,
        audience: String,
        completed: Boolean
      }]
    },
    metrics: {
      mttr: Number, // Mean Time To Resolve
      mttd: Number, // Mean Time To Detect
      mttc: Number, // Mean Time To Contain
      customersSatisfaction: Number,
      teamPerformance: Number
    }
  },

  // ==================== Related Entities ====================
  relationships: {
    parentIncident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityIncident'
    },
    childIncidents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityIncident'
    }],
    relatedAlerts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditAlert'
    }],
    auditLogs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    }],
    tickets: [{
      system: String,
      ticketId: String,
      url: String
    }],
    correlationId: {
      type: String,
      index: true
    }
  },

  // ==================== Cost & Resources ====================
  costs: {
    response: {
      internal: {
        hours: Number,
        rate: Number,
        total: Number
      },
      external: {
        consultants: Number,
        forensics: Number,
        legal: Number,
        other: Number,
        total: Number
      }
    },
    recovery: {
      systems: Number,
      data: Number,
      operations: Number,
      total: Number
    },
    regulatory: {
      fines: Number,
      penalties: Number,
      settlements: Number,
      total: Number
    },
    other: {
      reputation: Number,
      customerLoss: Number,
      opportunity: Number,
      total: Number
    },
    total: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    attachments: [{
      name: String,
      type: String,
      size: Number,
      url: String,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      uploadedAt: Date
    }],
    notes: [{
      content: String,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date,
      visibility: {
        type: String,
        enum: ['public', 'team', 'management', 'legal'],
        default: 'team'
      }
    }],
    references: [{
      type: String,
      title: String,
      url: String,
      description: String
    }]
  }
};

// Create schema
const securityIncidentSchema = BaseModel.createSchema(securityIncidentSchemaDefinition, {
  collection: 'security_incidents',
  timestamps: true,
  strict: true
});

// ==================== Indexes ====================
securityIncidentSchema.index({ organizationId: 1, 'incident.severity': 1, createdAt: -1 });
securityIncidentSchema.index({ 'status.state': 1, 'incident.priority': 1 });
securityIncidentSchema.index({ 'response.team.lead': 1 });
securityIncidentSchema.index({ 'detection.detectedAt': -1 });
securityIncidentSchema.index({ 'timeline.incidentStart': 1 });
securityIncidentSchema.index({ 'relationships.correlationId': 1 });

// Text search
securityIncidentSchema.index({
  'incident.title': 'text',
  'incident.description': 'text',
  'investigation.rootCause.description': 'text'
});

// ==================== Virtual Fields ====================
securityIncidentSchema.virtual('isActive').get(function() {
  return !['resolved', 'closed'].includes(this.status.state);
});

securityIncidentSchema.virtual('isBreachNotificationRequired').get(function() {
  return this.impact.scope.data.piiExposed || 
         this.impact.scope.data.financialDataExposed ||
         this.impact.scope.data.healthDataExposed;
});

securityIncidentSchema.virtual('durationHours').get(function() {
  if (!this.timeline.incidentStart) return null;
  const end = this.timeline.incidentEnd || new Date();
  return Math.round((end - this.timeline.incidentStart) / (1000 * 60 * 60));
});

securityIncidentSchema.virtual('responseTimeMinutes').get(function() {
  if (!this.detection.detectedAt || !this.timeline.containmentStart) return null;
  return Math.round((this.timeline.containmentStart - this.detection.detectedAt) / (1000 * 60));
});

securityIncidentSchema.virtual('complianceViolations').get(function() {
  let violations = 0;
  this.compliance.frameworks.forEach(framework => {
    violations += framework.violations?.filter(v => !v.remediated).length || 0;
  });
  return violations;
});

// ==================== Pre-save Middleware ====================
securityIncidentSchema.pre('save', async function(next) {
  try {
    // Generate incident ID if not set
    if (!this.incident.id) {
      this.incident.id = await this.generateIncidentId();
    }

    // Set priority based on severity if not set
    if (!this.incident.priority) {
      this.incident.priority = this.calculatePriority();
    }

    // Calculate timeline metrics
    if (this.isModified('timeline')) {
      this.calculateTimelineMetrics();
    }

    // Update progress percentage
    this.updateProgress();

    // Calculate total costs
    if (this.isModified('costs')) {
      this.calculateTotalCosts();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
securityIncidentSchema.post('save', async function(doc) {
  try {
    // Send notifications for new critical incidents
    if (doc.wasNew && doc.incident.severity === 'critical') {
      await doc.sendCriticalIncidentNotifications();
    }

    // Check regulatory notification requirements
    if (doc.isModified('impact') && doc.isBreachNotificationRequired) {
      await doc.checkRegulatoryNotifications();
    }

    // Create audit log
    const AuditLog = mongoose.model('AuditLog');
    await AuditLog.logEvent({
      tenantId: doc.tenantId,
      organizationId: doc.organizationId,
      event: {
        type: doc.wasNew ? 'security_incident_created' : 'security_incident_updated',
        category: 'security',
        action: doc.wasNew ? 'create' : 'update',
        description: `Security incident ${doc.incident.id}: ${doc.incident.title}`,
        severity: doc.incident.severity,
        risk: {
          score: doc.calculateRiskScore()
        }
      },
      actor: {
        userId: doc.response.team.lead,
        userType: 'user'
      },
      resource: {
        type: 'security_incident',
        id: doc._id.toString(),
        name: doc.incident.title
      },
      relationships: {
        relatedIncidents: [doc._id]
      }
    });

  } catch (error) {
    logger.error('Error in security incident post-save hook', {
      incidentId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
securityIncidentSchema.methods.generateIncidentId = async function() {
  const year = new Date().getFullYear();
  const count = await this.constructor.countDocuments({
    createdAt: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1)
    }
  });
  
  return `INC-${year}-${String(count + 1).padStart(5, '0')}`;
};

securityIncidentSchema.methods.calculatePriority = function() {
  const priorityMap = {
    critical: 'p1',
    high: 'p2',
    medium: 'p3',
    low: 'p4',
    informational: 'p5'
  };
  
  return priorityMap[this.incident.severity] || 'p3';
};

securityIncidentSchema.methods.calculateTimelineMetrics = function() {
  if (this.detection.detectedAt && this.timeline.incidentStart) {
    this.timeline.timeToDetect = Math.round(
      (this.detection.detectedAt - this.timeline.incidentStart) / (1000 * 60)
    );
  }
  
  if (this.timeline.containmentEnd && this.detection.detectedAt) {
    this.timeline.timeToContain = Math.round(
      (this.timeline.containmentEnd - this.detection.detectedAt) / (1000 * 60)
    );
  }
  
  if (this.timeline.closedAt && this.detection.detectedAt) {
    this.timeline.timeToResolve = Math.round(
      (this.timeline.closedAt - this.detection.detectedAt) / (1000 * 60)
    );
  }
};

securityIncidentSchema.methods.updateProgress = function() {
  const phases = {
    detection: 10,
    analysis: 25,
    containment: 50,
    eradication: 70,
    recovery: 90,
    lessons_learned: 100
  };
  
  this.status.progress.percentage = phases[this.status.phase] || 0;
  this.status.progress.lastUpdate = new Date();
};

securityIncidentSchema.methods.calculateTotalCosts = function() {
  const costCategories = ['response', 'recovery', 'regulatory', 'other'];
  let total = 0;
  
  for (const category of costCategories) {
    if (this.costs[category]?.total) {
      total += this.costs[category].total;
    }
  }
  
  this.costs.total = total;
};

securityIncidentSchema.methods.calculateRiskScore = function() {
  let score = 0;
  
  // Severity scoring
  const severityScores = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
    informational: 10
  };
  score = severityScores[this.incident.severity] || 50;
  
  // Adjust based on impact
  if (this.impact.scope.data.piiExposed) score = Math.min(score + 20, 100);
  if (this.impact.scope.users.compromised > 1000) score = Math.min(score + 15, 100);
  if (this.impact.business.operationalImpact === 'severe') score = Math.min(score + 10, 100);
  
  return score;
};

securityIncidentSchema.methods.escalate = async function(level, reason, escalatedTo) {
  const escalation = {
    level: level || (this.communication.internal.escalations.length + 1),
    escalatedTo,
    escalatedAt: new Date(),
    reason
  };
  
  this.communication.internal.escalations.push(escalation);
  
  // Update priority if escalating
  if (level >= 2 && this.incident.priority !== 'p1') {
    this.incident.priority = 'p1';
  }
  
  await this.save();
  
  // Send escalation notifications
  await this.sendEscalationNotifications(escalation);
  
  logger.info('Incident escalated', {
    incidentId: this._id,
    level: escalation.level,
    escalatedTo
  });
  
  return this;
};

securityIncidentSchema.methods.assignToTeam = async function(teamLead, members = []) {
  this.response.team.lead = teamLead;
  this.response.team.members = members.map(member => ({
    userId: member.userId,
    role: member.role,
    department: member.department,
    joinedAt: new Date()
  }));
  
  await this.save();
  
  // Notify team members
  await this.notifyTeamMembers();
  
  return this;
};

securityIncidentSchema.methods.updateStatus = async function(newStatus, updatedBy) {
  const previousStatus = this.status.state;
  this.status.state = newStatus;
  
  // Update phase based on status
  const statusPhaseMap = {
    new: 'detection',
    triaged: 'analysis',
    investigating: 'analysis',
    containing: 'containment',
    eradicating: 'eradication',
    recovering: 'recovery',
    monitoring: 'recovery',
    resolved: 'lessons_learned',
    closed: 'lessons_learned'
  };
  
  this.status.phase = statusPhaseMap[newStatus] || this.status.phase;
  
  // Update timeline
  const now = new Date();
  if (newStatus === 'containing' && !this.timeline.containmentStart) {
    this.timeline.containmentStart = now;
  } else if (newStatus === 'eradicating' && !this.timeline.eradicationStart) {
    this.timeline.eradicationStart = now;
  } else if (newStatus === 'recovering' && !this.timeline.recoveryStart) {
    this.timeline.recoveryStart = now;
  } else if (newStatus === 'closed') {
    this.timeline.closedAt = now;
  }
  
  // Add internal update
  this.communication.internal.updates.push({
    timestamp: now,
    update: `Status changed from ${previousStatus} to ${newStatus}`,
    author: updatedBy,
    distribution: ['incident_team', 'management']
  });
  
  await this.save();
  
  logger.info('Incident status updated', {
    incidentId: this._id,
    from: previousStatus,
    to: newStatus
  });
  
  return this;
};

securityIncidentSchema.methods.addInvestigationFinding = async function(finding, investigator) {
  const findingData = {
    timestamp: new Date(),
    finding: finding.finding,
    evidence: finding.evidence || [],
    significance: finding.significance,
    investigator
  };
  
  this.investigation.findings.push(findingData);
  
  if (this.investigation.status === 'not_started') {
    this.investigation.status = 'ongoing';
  }
  
  await this.save();
  return findingData;
};

securityIncidentSchema.methods.identifyRootCause = async function(rootCause, identifiedBy) {
  this.investigation.rootCause = {
    identified: true,
    description: rootCause.description,
    category: rootCause.category,
    contributingFactors: rootCause.contributingFactors || []
  };
  
  this.investigation.findings.push({
    timestamp: new Date(),
    finding: `Root cause identified: ${rootCause.description}`,
    significance: 'critical',
    investigator: identifiedBy
  });
  
  await this.save();
  
  logger.info('Root cause identified', {
    incidentId: this._id,
    category: rootCause.category
  });
  
  return this;
};

securityIncidentSchema.methods.implementContainment = async function(measure, implementedBy) {
  const containmentMeasure = {
    ...measure,
    implementedAt: new Date(),
    implementedBy
  };
  
  this.containment.measures.push(containmentMeasure);
  
  // Update isolated resources
  if (measure.type === 'isolation') {
    if (measure.systems) this.containment.isolated.systems.push(...measure.systems);
    if (measure.networks) this.containment.isolated.networks.push(...measure.networks);
    if (measure.accounts) this.containment.isolated.accounts.push(...measure.accounts);
  }
  
  await this.save();
  return containmentMeasure;
};

securityIncidentSchema.methods.addRemediationAction = async function(action, owner) {
  const remediationAction = {
    ...action,
    status: 'pending',
    owner
  };
  
  this.remediation.actions.push(remediationAction);
  await this.save();
  
  return remediationAction;
};

securityIncidentSchema.methods.notifyCustomers = async function(notification) {
  this.communication.external.customers = {
    notificationRequired: true,
    notificationSent: true,
    sentAt: new Date(),
    method: notification.methods,
    template: notification.template,
    recipientCount: notification.recipientCount
  };
  
  await this.save();
  
  // Send actual notifications
  await notificationService.sendBulk({
    template: notification.template,
    recipients: notification.recipients,
    data: {
      incident: {
        id: this.incident.id,
        title: this.incident.title,
        impact: notification.impactSummary
      }
    }
  });
  
  logger.info('Customer notifications sent', {
    incidentId: this._id,
    recipientCount: notification.recipientCount
  });
  
  return this;
};

securityIncidentSchema.methods.submitRegulatoryNotification = async function(authority, submission) {
  const notification = {
    authority,
    required: true,
    submittedAt: new Date(),
    submittedBy: submission.submittedBy,
    referenceNumber: submission.referenceNumber,
    status: 'submitted'
  };
  
  const existingIndex = this.communication.regulatory.notifications.findIndex(
    n => n.authority === authority
  );
  
  if (existingIndex >= 0) {
    this.communication.regulatory.notifications[existingIndex] = notification;
  } else {
    this.communication.regulatory.notifications.push(notification);
  }
  
  await this.save();
  
  logger.info('Regulatory notification submitted', {
    incidentId: this._id,
    authority,
    referenceNumber: submission.referenceNumber
  });
  
  return this;
};

securityIncidentSchema.methods.conductPostIncidentReview = async function(review) {
  this.postIncident.review = {
    conducted: true,
    conductedAt: new Date(),
    facilitator: review.facilitator,
    participants: review.participants,
    report: review.report
  };
  
  if (review.lessonsLearned) {
    this.postIncident.lessonsLearned = review.lessonsLearned;
  }
  
  if (review.improvements) {
    this.postIncident.improvements = review.improvements;
  }
  
  // Calculate metrics
  this.postIncident.metrics = {
    mttr: this.timeline.timeToResolve,
    mttd: this.timeline.timeToDetect,
    mttc: this.timeline.timeToContain,
    customersSatisfaction: review.customersSatisfaction,
    teamPerformance: review.teamPerformance
  };
  
  await this.save();
  
  logger.info('Post-incident review completed', {
    incidentId: this._id,
    lessonsLearned: this.postIncident.lessonsLearned.length
  });
  
  return this;
};

securityIncidentSchema.methods.sendCriticalIncidentNotifications = async function() {
  const Organization = mongoose.model('Organization');
  const org = await Organization.findById(this.organizationId);
  
  const recipients = org.settings.security.incidentContacts?.critical || [];
  
  if (!recipients.length) {
    logger.warn('No critical incident contacts configured', {
      organizationId: this.organizationId
    });
    return;
  }
  
  await notificationService.send({
    channel: 'multi',
    channels: ['email', 'sms', 'slack'],
    recipients,
    template: 'critical-security-incident',
    priority: 'critical',
    data: {
      incident: this.toObject(),
      actionRequired: true
    }
  });
};

securityIncidentSchema.methods.sendEscalationNotifications = async function(escalation) {
  await notificationService.send({
    channel: 'email',
    recipients: [escalation.escalatedTo],
    template: 'incident-escalation',
    priority: 'high',
    data: {
      incident: this.toObject(),
      escalation,
      actionUrl: `${process.env.APP_URL}/incidents/${this._id}`
    }
  });
};

securityIncidentSchema.methods.notifyTeamMembers = async function() {
  const members = this.response.team.members.map(m => m.userId);
  if (this.response.team.lead) members.push(this.response.team.lead);
  
  const User = mongoose.model('User');
  const users = await User.find({ _id: { $in: members } });
  
  await notificationService.send({
    channel: 'multi',
    channels: ['email', 'in_app'],
    recipients: users.map(u => u.email),
    template: 'incident-assignment',
    data: {
      incident: this.toObject()
    }
  });
};

securityIncidentSchema.methods.checkRegulatoryNotifications = async function() {
  // Check GDPR - 72 hour notification requirement
  if (this.impact.scope.data.piiExposed && 
      this.impact.scope.users.affected > 0) {
    const deadline = new Date(this.detection.detectedAt.getTime() + 72 * 60 * 60 * 1000);
    
    const gdprNotification = this.communication.regulatory.notifications.find(
      n => n.authority === 'GDPR DPA'
    );
    
    if (!gdprNotification) {
      this.communication.regulatory.notifications.push({
        authority: 'GDPR DPA',
        required: true,
        deadline
      });
    }
  }
  
  // Check other frameworks
  const frameworks = ['HIPAA', 'PCI-DSS', 'CCPA'];
  for (const framework of frameworks) {
    if (this.compliance.frameworks.some(f => f.framework === framework && f.applicable)) {
      // Add notification requirements based on framework
      this.addFrameworkNotification(framework);
    }
  }
  
  await this.save();
};

securityIncidentSchema.methods.addFrameworkNotification = function(framework) {
  const notificationRequirements = {
    HIPAA: {
      authority: 'HHS OCR',
      deadline: 60 * 24 * 60 * 60 * 1000 // 60 days
    },
    'PCI-DSS': {
      authority: 'Payment Card Brands',
      deadline: 24 * 60 * 60 * 1000 // 24 hours
    },
    CCPA: {
      authority: 'California AG',
      deadline: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  };
  
  const requirement = notificationRequirements[framework];
  if (requirement) {
    this.communication.regulatory.notifications.push({
      authority: requirement.authority,
      required: true,
      deadline: new Date(this.detection.detectedAt.getTime() + requirement.deadline)
    });
  }
};

// ==================== Static Methods ====================
securityIncidentSchema.statics.createIncident = async function(incidentData) {
  const incident = new this(incidentData);
  await incident.save();
  
  logger.security('Security incident created', {
    incidentId: incident._id,
    severity: incident.incident.severity,
    type: incident.incident.type
  });
  
  return incident;
};

securityIncidentSchema.statics.createFromAlert = async function(alert) {
  const incidentData = {
    tenantId: alert.tenantId,
    organizationId: alert.organizationId,
    incident: {
      title: `Incident from Alert: ${alert.alert.title}`,
      description: alert.alert.description,
      type: 'security_alert',
      category: this.mapAlertCategoryToIncident(alert.alert.category),
      severity: alert.alert.severity
    },
    detection: {
      detectedAt: alert.createdAt,
      detectedBy: {
        method: 'automated',
        system: 'Alert System',
        description: `Generated from alert ${alert._id}`
      },
      indicators: alert.detection.indicators
    },
    impact: {
      scope: {
        users: {
          affected: alert.impact.affectedUsers?.length || 0
        },
        systems: {
          affected: alert.impact.affectedResources?.map(r => r.id) || []
        }
      }
    },
    response: {
      team: {
        lead: alert.response.assignedTo?.userId || alert.response.acknowledgedBy?.userId
      }
    },
    relationships: {
      relatedAlerts: [alert._id]
    }
  };
  
  const incident = await this.createIncident(incidentData);
  return incident;
};

securityIncidentSchema.statics.mapAlertCategoryToIncident = function(alertCategory) {
  const categoryMap = {
    security_breach: 'data_breach',
    authentication_anomaly: 'unauthorized_access',
    access_violation: 'unauthorized_access',
    data_exfiltration: 'data_loss',
    system_anomaly: 'system_compromise'
  };
  
  return categoryMap[alertCategory] || 'other';
};

securityIncidentSchema.statics.findActiveIncidents = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    'status.state': { $nin: ['resolved', 'closed'] }
  };
  
  if (options.severity) {
    query['incident.severity'] = options.severity;
  }
  
  if (options.assignedTo) {
    query['response.team.lead'] = options.assignedTo;
  }
  
  return await this.find(query)
    .sort({ 'incident.priority': 1, 'detection.detectedAt': -1 })
    .limit(options.limit || 50)
    .populate('response.team.lead', 'name email')
    .lean();
};

securityIncidentSchema.statics.getIncidentStatistics = async function(organizationId, timeRange = '30d') {
  const timeRanges = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000
  };

  const startDate = new Date(Date.now() - (timeRanges[timeRange] || timeRanges['30d']));

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
              active: {
                $sum: {
                  $cond: [
                    { $nin: ['$status.state', ['resolved', 'closed']] },
                    1,
                    0
                  ]
                }
              },
              critical: {
                $sum: { $cond: [{ $eq: ['$incident.severity', 'critical'] }, 1, 0] }
              },
              avgTimeToDetect: { $avg: '$timeline.timeToDetect' },
              avgTimeToContain: { $avg: '$timeline.timeToContain' },
              avgTimeToResolve: { $avg: '$timeline.timeToResolve' },
              totalCost: { $sum: '$costs.total' }
            }
          }
        ],
        bySeverity: [
          {
            $group: {
              _id: '$incident.severity',
              count: { $sum: 1 },
              avgResolveTime: { $avg: '$timeline.timeToResolve' }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: '$incident.category',
              count: { $sum: 1 }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$status.state',
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
                  date: '$detection.detectedAt'
                }
              },
              count: { $sum: 1 },
              critical: {
                $sum: { $cond: [{ $eq: ['$incident.severity', 'critical'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ],
        topTypes: [
          {
            $group: {
              _id: '$incident.type',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        impactSummary: [
          {
            $group: {
              _id: null,
              totalUsersAffected: { $sum: '$impact.scope.users.affected' },
              totalSystemsAffected: { $sum: { $size: '$impact.scope.systems.affected' } },
              breachesWithPII: {
                $sum: { $cond: ['$impact.scope.data.piiExposed', 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  return stats[0];
};

securityIncidentSchema.statics.getUpcomingDeadlines = async function(organizationId, days = 7) {
  const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  
  const incidents = await this.find({
    organizationId,
    'status.state': { $nin: ['resolved', 'closed'] },
    $or: [
      { 'communication.regulatory.notifications.deadline': { $lte: deadline } },
      { 'remediation.actions.deadline': { $lte: deadline } }
    ]
  }).select({
    'incident.id': 1,
    'incident.title': 1,
    'communication.regulatory.notifications': 1,
    'remediation.actions': 1
  });
  
  const deadlines = [];
  
  for (const incident of incidents) {
    // Regulatory deadlines
    incident.communication.regulatory.notifications?.forEach(notification => {
      if (notification.deadline <= deadline && !notification.submittedAt) {
        deadlines.push({
          incidentId: incident.incident.id,
          incidentTitle: incident.incident.title,
          type: 'regulatory',
          description: `${notification.authority} notification`,
          deadline: notification.deadline
        });
      }
    });
    
    // Remediation deadlines
    incident.remediation.actions?.forEach(action => {
      if (action.deadline <= deadline && action.status !== 'completed') {
        deadlines.push({
          incidentId: incident.incident.id,
          incidentTitle: incident.incident.title,
          type: 'remediation',
          description: action.action,
          deadline: action.deadline
        });
      }
    });
  }
  
  return deadlines.sort((a, b) => a.deadline - b.deadline);
};

// Create and export model
const SecurityIncidentModel = BaseModel.createModel('SecurityIncident', securityIncidentSchema);

module.exports = {
  schema: securityIncidentSchema,
  model: SecurityIncidentModel
};