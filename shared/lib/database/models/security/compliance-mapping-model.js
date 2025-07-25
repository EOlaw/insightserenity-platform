'use strict';

/**
 * @fileoverview Compliance mapping model for linking frameworks to audit controls
 * @module shared/lib/database/models/security/compliance-mapping-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/compliance-frameworks
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { COMPLIANCE_FRAMEWORKS } = require('../../utils/constants/compliance-frameworks');

/**
 * Compliance mapping schema for framework requirements and controls
 */
const complianceMappingSchemaDefinition = {
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

  // ==================== Mapping Information ====================
  mapping: {
    name: {
      type: String,
      required: true,
      maxlength: 200,
      index: true
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      match: /^CM-[A-Z0-9-]+$/
    },
    description: String,
    version: {
      type: String,
      default: '1.0'
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'review', 'archived', 'deprecated'],
      default: 'draft',
      index: true
    },
    effectiveDate: Date,
    expiryDate: Date,
    lastReviewDate: Date,
    nextReviewDate: Date
  },

  // ==================== Framework Details ====================
  framework: {
    name: {
      type: String,
      enum: Object.values(COMPLIANCE_FRAMEWORKS),
      required: true,
      index: true
    },
    version: String,
    scope: {
      type: String,
      enum: ['full', 'partial', 'specific_controls'],
      default: 'full'
    },
    certificationLevel: {
      type: String,
      enum: ['none', 'self_certified', 'third_party', 'accredited'],
      default: 'none'
    },
    regulatoryBody: String,
    jurisdiction: {
      country: [String],
      state: [String],
      region: String,
      global: Boolean
    },
    industry: [{
      type: String,
      enum: ['healthcare', 'finance', 'technology', 'retail', 'government', 'education', 'all']
    }],
    applicability: {
      dataTypes: [String],
      systemTypes: [String],
      minimumRecords: Number,
      revenueThreshold: {
        amount: Number,
        currency: String
      }
    }
  },

  // ==================== Control Mappings ====================
  controls: [{
    controlId: {
      type: String,
      required: true,
      index: true
    },
    controlName: String,
    category: {
      type: String,
      enum: [
        'access_control',
        'audit_logging',
        'data_protection',
        'incident_response',
        'risk_management',
        'business_continuity',
        'physical_security',
        'network_security',
        'application_security',
        'operations_security',
        'compliance_management'
      ]
    },
    description: String,
    requirement: {
      text: String,
      mandatory: Boolean,
      priority: {
        type: String,
        enum: ['critical', 'high', 'medium', 'low']
      }
    },
    implementation: {
      status: {
        type: String,
        enum: ['not_started', 'in_progress', 'implemented', 'validated', 'not_applicable'],
        default: 'not_started'
      },
      progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      implementedDate: Date,
      validatedDate: Date,
      evidence: [{
        type: String,
        documentId: String,
        description: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }]
    },
    auditMapping: {
      eventTypes: [{
        type: String,
        required: Boolean,
        frequency: String
      }],
      logFields: [{
        field: String,
        required: Boolean,
        sensitivity: String,
        retention: String
      }],
      auditQueries: [{
        name: String,
        query: mongoose.Schema.Types.Mixed,
        schedule: String
      }],
      alerts: [{
        condition: String,
        severity: String,
        notification: Boolean
      }]
    },
    testing: {
      frequency: {
        type: String,
        enum: ['continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'annually']
      },
      lastTested: Date,
      nextTest: Date,
      testResults: [{
        testedAt: Date,
        testedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        passed: Boolean,
        findings: String,
        remediationRequired: Boolean
      }]
    },
    crossReferences: [{
      framework: String,
      controlId: String,
      mapping: {
        type: String,
        enum: ['exact', 'partial', 'related']
      }
    }]
  }],

  // ==================== Requirements & Obligations ====================
  requirements: [{
    requirementId: {
      type: String,
      required: true
    },
    title: String,
    description: String,
    type: {
      type: String,
      enum: ['technical', 'administrative', 'physical', 'legal', 'procedural']
    },
    obligations: [{
      action: String,
      frequency: String,
      responsible: String,
      deadline: Date,
      completed: Boolean,
      completedDate: Date
    }],
    documentation: {
      required: Boolean,
      templates: [String],
      examples: [String]
    },
    automation: {
      possible: Boolean,
      implemented: Boolean,
      method: String,
      scripts: [String]
    }
  }],

  // ==================== Gap Analysis ====================
  gapAnalysis: {
    lastPerformed: Date,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    overallScore: {
      type: Number,
      min: 0,
      max: 100
    },
    maturityLevel: {
      type: String,
      enum: ['initial', 'managed', 'defined', 'quantitatively_managed', 'optimizing']
    },
    gaps: [{
      controlId: String,
      gapType: {
        type: String,
        enum: ['missing', 'partial', 'ineffective', 'not_documented']
      },
      severity: {
        type: String,
        enum: ['critical', 'high', 'medium', 'low']
      },
      description: String,
      remediation: {
        plan: String,
        effort: String,
        cost: Number,
        timeline: String,
        assignedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        status: String,
        completedDate: Date
      },
      risk: {
        likelihood: Number,
        impact: Number,
        score: Number,
        acceptedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        acceptedDate: Date
      }
    }],
    recommendations: [{
      priority: String,
      recommendation: String,
      benefit: String,
      effort: String,
      implemented: Boolean
    }]
  },

  // ==================== Evidence & Artifacts ====================
  evidence: {
    policies: [{
      policyId: String,
      name: String,
      version: String,
      approvedDate: Date,
      nextReview: Date,
      location: String,
      controls: [String]
    }],
    procedures: [{
      procedureId: String,
      name: String,
      type: String,
      lastUpdated: Date,
      owner: String,
      controls: [String]
    }],
    artifacts: [{
      artifactId: String,
      name: String,
      type: {
        type: String,
        enum: ['screenshot', 'log', 'report', 'certificate', 'attestation', 'scan_result']
      },
      description: String,
      collectionDate: Date,
      expiryDate: Date,
      location: String,
      hash: String,
      controls: [String]
    }],
    auditReports: [{
      reportId: String,
      title: String,
      auditDate: Date,
      auditor: String,
      findings: Number,
      criticalFindings: Number,
      reportLocation: String
    }]
  },

  // ==================== Monitoring & Metrics ====================
  monitoring: {
    dashboards: [{
      name: String,
      url: String,
      refreshInterval: String,
      metrics: [String]
    }],
    kpis: [{
      name: String,
      description: String,
      formula: String,
      target: mongoose.Schema.Types.Mixed,
      current: mongoose.Schema.Types.Mixed,
      trend: String,
      lastUpdated: Date
    }],
    automatedChecks: [{
      checkId: String,
      name: String,
      frequency: String,
      query: mongoose.Schema.Types.Mixed,
      expectedResult: mongoose.Schema.Types.Mixed,
      lastRun: Date,
      lastResult: mongoose.Schema.Types.Mixed,
      status: String
    }],
    continuousCompliance: {
      enabled: Boolean,
      scanFrequency: String,
      lastScan: Date,
      nextScan: Date,
      findings: [{
        timestamp: Date,
        controlId: String,
        status: String,
        details: String,
        autoRemediated: Boolean
      }]
    }
  },

  // ==================== Certification & Attestation ====================
  certification: {
    status: {
      type: String,
      enum: ['not_started', 'preparing', 'under_audit', 'certified', 'expired', 'revoked']
    },
    certificates: [{
      certificateId: String,
      issuedBy: String,
      issuedDate: Date,
      expiryDate: Date,
      scope: String,
      limitations: [String],
      documentUrl: String,
      valid: Boolean
    }],
    attestations: [{
      attestationId: String,
      type: {
        type: String,
        enum: ['soc1', 'soc2', 'soc3', 'iso27001', 'pci_dss', 'hipaa', 'custom']
      },
      period: {
        start: Date,
        end: Date
      },
      attestedBy: String,
      reportUrl: String,
      exceptions: [String]
    }],
    audits: [{
      auditId: String,
      type: {
        type: String,
        enum: ['internal', 'external', 'certification', 'surveillance']
      },
      auditor: String,
      startDate: Date,
      endDate: Date,
      findings: {
        critical: Number,
        high: Number,
        medium: Number,
        low: Number
      },
      result: String,
      reportUrl: String
    }]
  },

  // ==================== Reporting & Communication ====================
  reporting: {
    templates: [{
      templateId: String,
      name: String,
      type: String,
      format: String,
      frequency: String,
      recipients: [String],
      lastGenerated: Date
    }],
    scheduledReports: [{
      reportId: String,
      name: String,
      schedule: String,
      recipients: [String],
      includeGaps: Boolean,
      includeMetrics: Boolean,
      includeEvidence: Boolean,
      enabled: Boolean,
      lastSent: Date,
      nextScheduled: Date
    }],
    stakeholders: [{
      role: String,
      name: String,
      email: String,
      reportingFrequency: String,
      lastNotified: Date
    }]
  },

  // ==================== Integration & Automation ====================
  integration: {
    tools: [{
      toolName: String,
      type: {
        type: String,
        enum: ['siem', 'grc', 'vulnerability_scanner', 'configuration_manager', 'ticketing']
      },
      connectionStatus: {
        type: String,
        enum: ['connected', 'disconnected', 'error']
      },
      lastSync: Date,
      configuration: mongoose.Schema.Types.Mixed,
      mappings: [{
        toolField: String,
        complianceField: String,
        transformation: String
      }]
    }],
    apis: [{
      apiName: String,
      endpoint: String,
      authentication: String,
      frequency: String,
      lastCall: Date,
      dataMapping: mongoose.Schema.Types.Mixed
    }],
    workflows: [{
      workflowId: String,
      name: String,
      trigger: String,
      steps: [{
        action: String,
        condition: String,
        parameters: mongoose.Schema.Types.Mixed
      }],
      enabled: Boolean,
      lastRun: Date
    }]
  },

  // ==================== History & Versioning ====================
  history: {
    versions: [{
      version: String,
      createdAt: Date,
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changes: String,
      snapshot: mongoose.Schema.Types.Mixed
    }],
    changes: [{
      timestamp: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changeType: String,
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String
    }],
    reviews: [{
      reviewDate: Date,
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      findings: String,
      approved: Boolean,
      comments: String
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    references: [{
      type: String,
      title: String,
      url: String,
      description: String
    }],
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      category: String
    }],
    owner: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      department: String,
      email: String
    }
  }
};

// Create schema
const complianceMappingSchema = BaseModel.createSchema(complianceMappingSchemaDefinition, {
  collection: 'compliance_mappings',
  timestamps: true,
  strict: true
});

// ==================== Indexes ====================
complianceMappingSchema.index({ organizationId: 1, 'framework.name': 1 });
complianceMappingSchema.index({ 'mapping.status': 1, 'mapping.effectiveDate': 1 });
complianceMappingSchema.index({ 'controls.controlId': 1 });
complianceMappingSchema.index({ 'certification.status': 1 });
complianceMappingSchema.index({ 'gapAnalysis.gaps.severity': 1 });

// Text search
complianceMappingSchema.index({
  'mapping.name': 'text',
  'mapping.description': 'text',
  'controls.controlName': 'text'
});

// ==================== Virtual Fields ====================
complianceMappingSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.mapping.status === 'active' &&
         (!this.mapping.effectiveDate || this.mapping.effectiveDate <= now) &&
         (!this.mapping.expiryDate || this.mapping.expiryDate > now);
});

complianceMappingSchema.virtual('complianceScore').get(function() {
  if (!this.controls?.length) return 0;
  
  const implementedControls = this.controls.filter(
    c => c.implementation.status === 'implemented' || c.implementation.status === 'validated'
  ).length;
  
  return Math.round((implementedControls / this.controls.length) * 100);
});

complianceMappingSchema.virtual('criticalGaps').get(function() {
  return this.gapAnalysis.gaps?.filter(g => g.severity === 'critical').length || 0;
});

complianceMappingSchema.virtual('requiresReview').get(function() {
  return this.mapping.nextReviewDate && this.mapping.nextReviewDate <= new Date();
});

complianceMappingSchema.virtual('certificationValid').get(function() {
  if (!this.certification.certificates?.length) return false;
  
  return this.certification.certificates.some(
    cert => cert.valid && cert.expiryDate > new Date()
  );
});

// ==================== Pre-save Middleware ====================
complianceMappingSchema.pre('save', async function(next) {
  try {
    // Generate mapping code if not set
    if (!this.mapping.code) {
      this.mapping.code = await this.generateMappingCode();
    }

    // Calculate compliance score
    if (this.isModified('controls')) {
      this.gapAnalysis.overallScore = this.complianceScore;
    }

    // Set next review date if not specified
    if (!this.mapping.nextReviewDate && this.mapping.status === 'active') {
      this.mapping.nextReviewDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
    }

    // Update control test schedules
    this.updateTestSchedules();

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
complianceMappingSchema.post('save', async function(doc) {
  try {
    // Create audit log for compliance changes
    if (doc.wasModified) {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.logEvent({
        tenantId: doc.tenantId,
        organizationId: doc.organizationId,
        event: {
          type: 'compliance_mapping_updated',
          category: 'compliance',
          action: 'update',
          description: `Compliance mapping ${doc.mapping.name} updated`,
          severity: 'info'
        },
        actor: {
          userId: doc.metadata.owner?.userId,
          userType: 'admin'
        },
        resource: {
          type: 'compliance_mapping',
          id: doc._id.toString(),
          name: doc.mapping.name
        },
        compliance: {
          frameworks: [doc.framework.name]
        }
      });
    }

  } catch (error) {
    logger.error('Error in compliance mapping post-save hook', {
      mappingId: doc._id,
      error: error.message
    });
  }
});

// ==================== Instance Methods ====================
complianceMappingSchema.methods.generateMappingCode = async function() {
  const framework = this.framework.name.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  
  return `CM-${framework}-${timestamp}`;
};

complianceMappingSchema.methods.updateTestSchedules = function() {
  for (const control of this.controls) {
    if (control.testing.frequency && !control.testing.nextTest) {
      control.testing.nextTest = this.calculateNextTestDate(
        control.testing.lastTested || new Date(),
        control.testing.frequency
      );
    }
  }
};

complianceMappingSchema.methods.calculateNextTestDate = function(lastDate, frequency) {
  const intervals = {
    continuous: 0,
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    annually: 365
  };
  
  const days = intervals[frequency] || 30;
  return new Date(lastDate.getTime() + days * 24 * 60 * 60 * 1000);
};

complianceMappingSchema.methods.activate = async function(activatedBy) {
  if (this.mapping.status === 'active') {
    throw new AppError('Mapping is already active', 400, 'ALREADY_ACTIVE');
  }

  this.mapping.status = 'active';
  this.mapping.effectiveDate = new Date();
  
  this.history.changes.push({
    timestamp: new Date(),
    changedBy: activatedBy,
    changeType: 'status_change',
    field: 'mapping.status',
    oldValue: this.mapping.status,
    newValue: 'active',
    reason: 'Mapping activated'
  });

  await this.save();
  
  logger.info('Compliance mapping activated', {
    mappingId: this._id,
    framework: this.framework.name
  });

  return this;
};

complianceMappingSchema.methods.updateControlImplementation = async function(controlId, update, updatedBy) {
  const control = this.controls.find(c => c.controlId === controlId);
  if (!control) {
    throw new AppError('Control not found', 404, 'CONTROL_NOT_FOUND');
  }

  const previousStatus = control.implementation.status;
  
  Object.assign(control.implementation, update);
  
  if (update.status === 'implemented' && !control.implementation.implementedDate) {
    control.implementation.implementedDate = new Date();
  }
  
  if (update.status === 'validated' && !control.implementation.validatedDate) {
    control.implementation.validatedDate = new Date();
  }

  this.history.changes.push({
    timestamp: new Date(),
    changedBy: updatedBy,
    changeType: 'control_update',
    field: `controls.${controlId}.implementation`,
    oldValue: { status: previousStatus },
    newValue: update,
    reason: update.reason || 'Control implementation updated'
  });

  await this.save();
  
  logger.info('Control implementation updated', {
    mappingId: this._id,
    controlId,
    newStatus: update.status
  });

  return control;
};

complianceMappingSchema.methods.performGapAnalysis = async function(analyst) {
  const gaps = [];
  const recommendations = [];
  
  // Analyze each control
  for (const control of this.controls) {
    if (control.requirement.mandatory && 
        control.implementation.status !== 'implemented' &&
        control.implementation.status !== 'validated') {
      
      gaps.push({
        controlId: control.controlId,
        gapType: control.implementation.status === 'not_started' ? 'missing' : 'partial',
        severity: control.requirement.priority,
        description: `Control ${control.controlId} is not fully implemented`,
        remediation: {
          plan: `Implement ${control.controlName}`,
          effort: this.estimateEffort(control),
          timeline: this.estimateTimeline(control),
          status: 'identified'
        },
        risk: {
          likelihood: 3,
          impact: control.requirement.priority === 'critical' ? 5 : 3,
          score: 15
        }
      });
    }
  }

  // Generate recommendations
  if (gaps.filter(g => g.severity === 'critical').length > 0) {
    recommendations.push({
      priority: 'critical',
      recommendation: 'Address all critical control gaps immediately',
      benefit: 'Achieve baseline compliance',
      effort: 'high'
    });
  }

  this.gapAnalysis = {
    lastPerformed: new Date(),
    performedBy: analyst,
    overallScore: this.complianceScore,
    maturityLevel: this.calculateMaturityLevel(),
    gaps,
    recommendations
  };

  await this.save();
  
  logger.info('Gap analysis performed', {
    mappingId: this._id,
    gapsFound: gaps.length,
    criticalGaps: gaps.filter(g => g.severity === 'critical').length
  });

  return this.gapAnalysis;
};

complianceMappingSchema.methods.estimateEffort = function(control) {
  if (control.requirement.priority === 'critical') return 'high';
  if (control.implementation.progress > 50) return 'low';
  return 'medium';
};

complianceMappingSchema.methods.estimateTimeline = function(control) {
  const timelines = {
    critical: '1 week',
    high: '2 weeks',
    medium: '1 month',
    low: '3 months'
  };
  
  return timelines[control.requirement.priority] || '1 month';
};

complianceMappingSchema.methods.calculateMaturityLevel = function() {
  const score = this.complianceScore;
  
  if (score < 20) return 'initial';
  if (score < 40) return 'managed';
  if (score < 60) return 'defined';
  if (score < 80) return 'quantitatively_managed';
  return 'optimizing';
};

complianceMappingSchema.methods.addEvidence = async function(evidence, addedBy) {
  const evidenceData = {
    ...evidence,
    collectionDate: new Date(),
    artifactId: `ART-${Date.now()}`
  };

  this.evidence.artifacts.push(evidenceData);

  // Link to controls
  if (evidence.controls?.length) {
    for (const controlId of evidence.controls) {
      const control = this.controls.find(c => c.controlId === controlId);
      if (control) {
        control.implementation.evidence.push({
          type: evidence.type,
          documentId: evidenceData.artifactId,
          description: evidence.description,
          uploadedAt: new Date(),
          uploadedBy: addedBy
        });
      }
    }
  }

  await this.save();
  
  logger.info('Evidence added to compliance mapping', {
    mappingId: this._id,
    artifactId: evidenceData.artifactId
  });

  return evidenceData;
};

complianceMappingSchema.methods.testControl = async function(controlId, testResult, testedBy) {
  const control = this.controls.find(c => c.controlId === controlId);
  if (!control) {
    throw new AppError('Control not found', 404, 'CONTROL_NOT_FOUND');
  }

  const result = {
    testedAt: new Date(),
    testedBy,
    passed: testResult.passed,
    findings: testResult.findings,
    remediationRequired: !testResult.passed
  };

  if (!control.testing.testResults) {
    control.testing.testResults = [];
  }
  
  control.testing.testResults.push(result);
  control.testing.lastTested = new Date();
  control.testing.nextTest = this.calculateNextTestDate(
    control.testing.lastTested,
    control.testing.frequency
  );

  // Update implementation status if test failed
  if (!testResult.passed && control.implementation.status === 'implemented') {
    control.implementation.status = 'in_progress';
    control.implementation.progress = 75;
  }

  await this.save();
  
  logger.info('Control tested', {
    mappingId: this._id,
    controlId,
    passed: testResult.passed
  });

  return result;
};

complianceMappingSchema.methods.generateComplianceReport = async function(options = {}) {
  const report = {
    mapping: {
      name: this.mapping.name,
      framework: this.framework.name,
      version: this.framework.version,
      status: this.mapping.status
    },
    compliance: {
      overallScore: this.complianceScore,
      maturityLevel: this.gapAnalysis.maturityLevel,
      implementedControls: this.controls.filter(c => 
        ['implemented', 'validated'].includes(c.implementation.status)
      ).length,
      totalControls: this.controls.length,
      criticalGaps: this.criticalGaps
    },
    certification: {
      status: this.certification.status,
      validCertificates: this.certification.certificates?.filter(
        c => c.valid && c.expiryDate > new Date()
      ).length || 0
    },
    gaps: options.includeGaps ? this.gapAnalysis.gaps : undefined,
    evidence: options.includeEvidence ? {
      policies: this.evidence.policies.length,
      procedures: this.evidence.procedures.length,
      artifacts: this.evidence.artifacts.length
    } : undefined,
    generatedAt: new Date(),
    generatedBy: options.generatedBy
  };

  // Log report generation
  const AuditLog = mongoose.model('AuditLog');
  await AuditLog.logEvent({
    tenantId: this.tenantId,
    organizationId: this.organizationId,
    event: {
      type: 'compliance_report_generated',
      category: 'compliance',
      action: 'generate',
      description: `Compliance report generated for ${this.framework.name}`,
      severity: 'info'
    },
    actor: {
      userId: options.generatedBy,
      userType: 'user'
    },
    resource: {
      type: 'compliance_mapping',
      id: this._id.toString(),
      name: this.mapping.name
    }
  });

  return report;
};

complianceMappingSchema.methods.scheduleReport = async function(schedule) {
  const reportConfig = {
    reportId: `RPT-${Date.now()}`,
    ...schedule,
    enabled: true,
    nextScheduled: this.calculateNextReportDate(schedule.schedule)
  };

  this.reporting.scheduledReports.push(reportConfig);
  await this.save();

  return reportConfig;
};

complianceMappingSchema.methods.calculateNextReportDate = function(schedule) {
  const schedules = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    annually: 365
  };
  
  const days = schedules[schedule] || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

// ==================== Static Methods ====================
complianceMappingSchema.statics.createMapping = async function(mappingData) {
  const mapping = new this(mappingData);
  await mapping.save();
  
  logger.info('Compliance mapping created', {
    mappingId: mapping._id,
    framework: mapping.framework.name
  });
  
  return mapping;
};

complianceMappingSchema.statics.findByFramework = async function(organizationId, framework) {
  return await this.findOne({
    organizationId,
    'framework.name': framework,
    'mapping.status': 'active'
  });
};

complianceMappingSchema.statics.findActiveMapppings = async function(organizationId) {
  const now = new Date();
  
  return await this.find({
    organizationId,
    'mapping.status': 'active',
    $or: [
      { 'mapping.effectiveDate': { $exists: false } },
      { 'mapping.effectiveDate': { $lte: now } }
    ],
    $or: [
      { 'mapping.expiryDate': { $exists: false } },
      { 'mapping.expiryDate': { $gt: now } }
    ]
  });
};

complianceMappingSchema.statics.getComplianceOverview = async function(organizationId) {
  const mappings = await this.findActiveMapppings(organizationId);
  
  const overview = {
    frameworks: [],
    overallCompliance: 0,
    totalControls: 0,
    implementedControls: 0,
    criticalGaps: 0,
    upcomingAudits: [],
    expiringCertificates: []
  };
  
  for (const mapping of mappings) {
    const frameworkSummary = {
      framework: mapping.framework.name,
      complianceScore: mapping.complianceScore,
      maturityLevel: mapping.gapAnalysis.maturityLevel,
      criticalGaps: mapping.criticalGaps,
      certification: mapping.certification.status
    };
    
    overview.frameworks.push(frameworkSummary);
    overview.totalControls += mapping.controls.length;
    overview.implementedControls += mapping.controls.filter(
      c => ['implemented', 'validated'].includes(c.implementation.status)
    ).length;
    overview.criticalGaps += mapping.criticalGaps;
    
    // Check for upcoming audits
    const upcomingAudits = mapping.certification.audits?.filter(
      a => a.startDate > new Date() && a.startDate < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    );
    overview.upcomingAudits.push(...upcomingAudits);
    
    // Check for expiring certificates
    const expiringCerts = mapping.certification.certificates?.filter(
      c => c.valid && c.expiryDate < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    );
    overview.expiringCertificates.push(...expiringCerts);
  }
  
  if (overview.totalControls > 0) {
    overview.overallCompliance = Math.round(
      (overview.implementedControls / overview.totalControls) * 100
    );
  }
  
  return overview;
};

complianceMappingSchema.statics.findControlsRequiringTest = async function(organizationId) {
  const mappings = await this.find({
    organizationId,
    'mapping.status': 'active',
    'controls.testing.nextTest': { $lte: new Date() }
  });
  
  const controlsToTest = [];
  
  for (const mapping of mappings) {
    const overdueControls = mapping.controls.filter(
      c => c.testing.nextTest && c.testing.nextTest <= new Date()
    );
    
    controlsToTest.push(...overdueControls.map(c => ({
      mappingId: mapping._id,
      framework: mapping.framework.name,
      controlId: c.controlId,
      controlName: c.controlName,
      lastTested: c.testing.lastTested,
      priority: c.requirement.priority
    })));
  }
  
  return controlsToTest.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
};

complianceMappingSchema.statics.generateCrossFrameworkMapping = async function(organizationId) {
  const mappings = await this.findActiveMapppings(organizationId);
  const crossMap = new Map();
  
  for (const mapping of mappings) {
    for (const control of mapping.controls) {
      if (!control.crossReferences?.length) continue;
      
      for (const ref of control.crossReferences) {
        const key = `${mapping.framework.name}:${control.controlId}`;
        const value = `${ref.framework}:${ref.controlId}`;
        
        if (!crossMap.has(key)) {
          crossMap.set(key, []);
        }
        crossMap.get(key).push({
          framework: ref.framework,
          controlId: ref.controlId,
          mappingType: ref.mapping
        });
      }
    }
  }
  
  return Object.fromEntries(crossMap);
};

// Create and export model
const ComplianceMappingModel = BaseModel.createModel('ComplianceMapping', complianceMappingSchema);

module.exports = {
  schema: complianceMappingSchema,
  model: ComplianceMappingModel
};