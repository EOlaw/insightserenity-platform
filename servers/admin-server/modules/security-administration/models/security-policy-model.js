'use strict';

/**
 * @fileoverview Enterprise security policy model for comprehensive platform security management
 * @module servers/admin-server/modules/security-administration/models/security-policy-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/constants/permissions
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');

/**
 * @class SecurityPolicySchema
 * @description Comprehensive security policy schema for enterprise platform security management
 * @extends mongoose.Schema
 */
const securityPolicySchema = new mongoose.Schema({
  // ==================== Core Policy Identification ====================
  policyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `SEC-POL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for security policy'
  },

  policyMetadata: {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200,
      index: true,
      description: 'Human-readable policy name'
    },
    
    category: {
      type: String,
      required: true,
      enum: ['ACCESS_CONTROL', 'DATA_PROTECTION', 'NETWORK_SECURITY', 'APPLICATION_SECURITY', 
              'IDENTITY_MANAGEMENT', 'INCIDENT_RESPONSE', 'COMPLIANCE', 'AUDIT_LOGGING',
              'ENCRYPTION', 'AUTHENTICATION', 'AUTHORIZATION', 'VULNERABILITY_MANAGEMENT',
              'DISASTER_RECOVERY', 'BUSINESS_CONTINUITY', 'THIRD_PARTY_SECURITY'],
      index: true,
      description: 'Policy category classification'
    },
    
    subcategory: {
      type: String,
      trim: true,
      description: 'Specific subcategory within main category'
    },
    
    version: {
      major: {
        type: Number,
        default: 1,
        min: 1
      },
      minor: {
        type: Number,
        default: 0,
        min: 0
      },
      patch: {
        type: Number,
        default: 0,
        min: 0
      },
      releaseNotes: String,
      changeLog: [{
        version: String,
        date: Date,
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        changes: [String],
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        }
      }]
    },
    
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2000,
      description: 'Detailed policy description'
    },
    
    purpose: {
      type: String,
      required: true,
      description: 'Business purpose and objectives'
    },
    
    scope: {
      applicability: {
        type: String,
        enum: ['GLOBAL', 'REGIONAL', 'ORGANIZATIONAL', 'DEPARTMENTAL', 'PROJECT', 'CUSTOM'],
        default: 'GLOBAL'
      },
      includedEntities: [{
        entityType: {
          type: String,
          enum: ['USER', 'ORGANIZATION', 'SYSTEM', 'APPLICATION', 'SERVICE', 'NETWORK', 'DATA']
        },
        entityIds: [String],
        conditions: mongoose.Schema.Types.Mixed
      }],
      excludedEntities: [{
        entityType: String,
        entityIds: [String],
        reason: String
      }],
      geographicalScope: {
        countries: [String],
        regions: [String],
        datacenters: [String]
      }
    },
    
    tags: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    
    keywords: [{
      type: String,
      lowercase: true,
      index: true
    }],
    
    priority: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'],
      default: 'MEDIUM',
      required: true,
      index: true
    },
    
    severity: {
      type: String,
      enum: ['BLOCKING', 'SEVERE', 'MODERATE', 'MINOR', 'TRIVIAL'],
      default: 'MODERATE'
    }
  },

  // ==================== Policy Rules and Conditions ====================
  policyRules: {
    rules: [{
      ruleId: {
        type: String,
        required: true,
        default: function() {
          return `RULE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }
      },
      
      ruleName: {
        type: String,
        required: true,
        trim: true
      },
      
      ruleType: {
        type: String,
        enum: ['MANDATORY', 'RECOMMENDED', 'OPTIONAL', 'CONDITIONAL', 'PROHIBITIVE'],
        required: true
      },
      
      condition: {
        type: {
          type: String,
          enum: ['ALWAYS', 'IF_THEN', 'WHEN', 'UNLESS', 'COMPLEX'],
          default: 'ALWAYS'
        },
        expression: mongoose.Schema.Types.Mixed,
        evaluationLogic: String,
        parameters: mongoose.Schema.Types.Mixed
      },
      
      action: {
        type: {
          type: String,
          enum: ['ALLOW', 'DENY', 'REQUIRE', 'RESTRICT', 'LOG', 'ALERT', 'ESCALATE', 'CUSTOM'],
          required: true
        },
        details: mongoose.Schema.Types.Mixed,
        customHandler: String
      },
      
      exceptions: [{
        exceptionType: String,
        condition: mongoose.Schema.Types.Mixed,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        expiryDate: Date,
        reason: String
      }],
      
      enforcement: {
        level: {
          type: String,
          enum: ['STRICT', 'MODERATE', 'FLEXIBLE', 'ADVISORY'],
          default: 'MODERATE'
        },
        automated: {
          type: Boolean,
          default: true
        },
        manualOverride: {
          allowed: {
            type: Boolean,
            default: false
          },
          requiresApproval: {
            type: Boolean,
            default: true
          },
          approvalLevel: {
            type: String,
            enum: ['TEAM_LEAD', 'MANAGER', 'DIRECTOR', 'EXECUTIVE', 'CISO']
          }
        }
      },
      
      priority: {
        type: Number,
        min: 1,
        max: 100,
        default: 50
      },
      
      enabled: {
        type: Boolean,
        default: true
      },
      
      metadata: {
        createdAt: {
          type: Date,
          default: Date.now
        },
        lastModified: Date,
        lastEvaluated: Date,
        evaluationCount: {
          type: Number,
          default: 0
        },
        violationCount: {
          type: Number,
          default: 0
        },
        complianceRate: {
          type: Number,
          min: 0,
          max: 100
        }
      }
    }],
    
    ruleGroups: [{
      groupName: String,
      groupType: {
        type: String,
        enum: ['AND', 'OR', 'XOR', 'SEQUENTIAL', 'CONDITIONAL']
      },
      rules: [String], // Rule IDs
      priority: Number,
      enabled: Boolean
    }],
    
    conflictResolution: {
      strategy: {
        type: String,
        enum: ['MOST_RESTRICTIVE', 'LEAST_RESTRICTIVE', 'PRIORITY_BASED', 'NEWEST', 'MANUAL'],
        default: 'MOST_RESTRICTIVE'
      },
      conflictMatrix: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Compliance and Standards ====================
  compliance: {
    standards: [{
      standardName: {
        type: String,
        enum: ['ISO_27001', 'ISO_27002', 'SOC2', 'GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 
                'NIST', 'CIS', 'OWASP', 'COBIT', 'ITIL', 'CUSTOM'],
        required: true
      },
      
      version: String,
      
      requirements: [{
        requirementId: String,
        description: String,
        controlMapping: [String],
        implementationStatus: {
          type: String,
          enum: ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'VALIDATED', 'CERTIFIED'],
          default: 'NOT_STARTED'
        },
        evidence: [{
          type: String,
          documentUrl: String,
          uploadedAt: Date,
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AdminUser'
          }
        }],
        lastAssessment: Date,
        nextAssessment: Date,
        assessmentResults: mongoose.Schema.Types.Mixed
      }],
      
      certificationStatus: {
        certified: {
          type: Boolean,
          default: false
        },
        certificationDate: Date,
        expiryDate: Date,
        certifyingBody: String,
        certificateNumber: String,
        auditReport: String
      }
    }],
    
    regulations: [{
      regulationName: String,
      jurisdiction: String,
      applicability: mongoose.Schema.Types.Mixed,
      requirements: [String],
      penalties: {
        financial: {
          min: Number,
          max: Number,
          currency: String
        },
        operational: [String],
        reputational: String
      }
    }],
    
    internalStandards: [{
      standardId: String,
      name: String,
      requirements: [String],
      reviewCycle: {
        frequency: {
          type: String,
          enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']
        },
        lastReview: Date,
        nextReview: Date
      }
    }],
    
    complianceMetrics: {
      overallScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      categoryScores: mongoose.Schema.Types.Mixed,
      trend: {
        type: String,
        enum: ['IMPROVING', 'STABLE', 'DECLINING', 'UNKNOWN'],
        default: 'UNKNOWN'
      },
      lastCalculated: Date
    }
  },

  // ==================== Implementation Details ====================
  implementation: {
    technicalControls: [{
      controlId: {
        type: String,
        required: true
      },
      controlType: {
        type: String,
        enum: ['PREVENTIVE', 'DETECTIVE', 'CORRECTIVE', 'COMPENSATING', 'DETERRENT'],
        required: true
      },
      technology: {
        type: String,
        enum: ['FIREWALL', 'IDS', 'IPS', 'SIEM', 'DLP', 'ENCRYPTION', 'MFA', 'RBAC',
                'NETWORK_SEGMENTATION', 'ENDPOINT_PROTECTION', 'CLOUD_SECURITY', 'CUSTOM']
      },
      configuration: mongoose.Schema.Types.Mixed,
      automationLevel: {
        type: String,
        enum: ['FULLY_AUTOMATED', 'SEMI_AUTOMATED', 'MANUAL', 'HYBRID'],
        default: 'SEMI_AUTOMATED'
      },
      integrations: [{
        system: String,
        integrationType: String,
        apiEndpoint: String,
        authentication: mongoose.Schema.Types.Mixed,
        dataFlow: String
      }],
      effectiveness: {
        score: {
          type: Number,
          min: 0,
          max: 100
        },
        lastAssessed: Date,
        assessmentMethod: String
      }
    }],
    
    processControls: [{
      processName: String,
      processType: String,
      steps: [{
        stepNumber: Number,
        description: String,
        responsible: String,
        sla: {
          duration: Number,
          unit: {
            type: String,
            enum: ['MINUTES', 'HOURS', 'DAYS', 'WEEKS']
          }
        },
        documentation: String
      }],
      approvalWorkflow: {
        required: Boolean,
        levels: [{
          level: Number,
          approverRole: String,
          conditions: mongoose.Schema.Types.Mixed,
          escalationTime: Number
        }]
      },
      documentation: {
        procedureDocument: String,
        trainingMaterials: [String],
        references: [String]
      }
    }],
    
    administrativeControls: [{
      controlName: String,
      type: {
        type: String,
        enum: ['POLICY', 'PROCEDURE', 'GUIDELINE', 'STANDARD', 'TRAINING']
      },
      description: String,
      targetAudience: [String],
      trainingRequired: {
        type: Boolean,
        default: false
      },
      trainingFrequency: String,
      acknowledgmentRequired: {
        type: Boolean,
        default: true
      },
      documentation: [String]
    }],
    
    physicalControls: [{
      controlName: String,
      location: String,
      type: {
        type: String,
        enum: ['ACCESS_CONTROL', 'SURVEILLANCE', 'ENVIRONMENTAL', 'PERIMETER', 'FACILITY']
      },
      devices: [{
        deviceType: String,
        deviceId: String,
        location: String,
        status: String,
        lastMaintenance: Date,
        nextMaintenance: Date
      }],
      monitoring: {
        automated: Boolean,
        frequency: String,
        responsibleTeam: String
      }
    }]
  },

  // ==================== Risk Management ====================
  riskManagement: {
    riskAssessment: {
      overallRiskLevel: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'],
        default: 'MEDIUM'
      },
      
      riskScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
      },
      
      lastAssessmentDate: Date,
      nextAssessmentDate: Date,
      assessmentMethodology: {
        type: String,
        enum: ['QUALITATIVE', 'QUANTITATIVE', 'HYBRID', 'CUSTOM']
      },
      
      assessmentCriteria: mongoose.Schema.Types.Mixed
    },
    
    identifiedRisks: [{
      riskId: {
        type: String,
        required: true
      },
      riskName: String,
      category: {
        type: String,
        enum: ['STRATEGIC', 'OPERATIONAL', 'FINANCIAL', 'COMPLIANCE', 'REPUTATIONAL', 
                'TECHNICAL', 'SECURITY', 'PRIVACY', 'THIRD_PARTY']
      },
      description: String,
      likelihood: {
        score: {
          type: Number,
          min: 1,
          max: 5
        },
        justification: String
      },
      impact: {
        score: {
          type: Number,
          min: 1,
          max: 5
        },
        areas: [String],
        financialImpact: {
          estimated: Number,
          currency: String
        },
        justification: String
      },
      inherentRisk: {
        type: Number,
        min: 1,
        max: 25
      },
      residualRisk: {
        type: Number,
        min: 1,
        max: 25
      },
      riskOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      status: {
        type: String,
        enum: ['IDENTIFIED', 'ASSESSED', 'MITIGATED', 'ACCEPTED', 'TRANSFERRED', 'AVOIDED'],
        default: 'IDENTIFIED'
      }
    }],
    
    mitigationStrategies: [{
      strategyId: String,
      riskIds: [String],
      strategyType: {
        type: String,
        enum: ['AVOID', 'MITIGATE', 'TRANSFER', 'ACCEPT']
      },
      description: String,
      controls: [String],
      implementationStatus: {
        type: String,
        enum: ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'VALIDATED'],
        default: 'PLANNED'
      },
      effectiveness: {
        expectedReduction: Number,
        actualReduction: Number,
        validated: Boolean,
        validationDate: Date
      },
      cost: {
        estimated: Number,
        actual: Number,
        currency: String
      },
      timeline: {
        startDate: Date,
        targetCompletionDate: Date,
        actualCompletionDate: Date
      },
      responsible: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    riskIndicators: [{
      indicatorName: String,
      type: {
        type: String,
        enum: ['KRI', 'LEADING', 'LAGGING', 'PREDICTIVE']
      },
      metric: String,
      threshold: {
        warning: Number,
        critical: Number
      },
      currentValue: Number,
      trend: {
        type: String,
        enum: ['INCREASING', 'STABLE', 'DECREASING']
      },
      lastUpdated: Date
    }],
    
    riskAppetite: {
      statement: String,
      tolerance: mongoose.Schema.Types.Mixed,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      approvalDate: Date,
      reviewDate: Date
    }
  },

  // ==================== Monitoring and Enforcement ====================
  monitoring: {
    continuousMonitoring: {
      enabled: {
        type: Boolean,
        default: true
      },
      frequency: {
        type: String,
        enum: ['REAL_TIME', 'MINUTE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'],
        default: 'HOURLY'
      },
      lastCheck: Date,
      nextCheck: Date,
      monitoringPoints: [{
        pointId: String,
        type: String,
        target: String,
        metrics: [String],
        thresholds: mongoose.Schema.Types.Mixed,
        alerting: {
          enabled: Boolean,
          channels: [String],
          recipients: [String]
        }
      }]
    },
    
    violationTracking: {
      totalViolations: {
        type: Number,
        default: 0
      },
      openViolations: {
        type: Number,
        default: 0
      },
      violations: [{
        violationId: String,
        detectedAt: Date,
        violationType: String,
        severity: {
          type: String,
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
        },
        description: String,
        affectedEntities: [{
          entityType: String,
          entityId: String,
          entityName: String
        }],
        evidence: mongoose.Schema.Types.Mixed,
        status: {
          type: String,
          enum: ['DETECTED', 'CONFIRMED', 'IN_REMEDIATION', 'RESOLVED', 'FALSE_POSITIVE'],
          default: 'DETECTED'
        },
        remediation: {
          requiredActions: [String],
          assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AdminUser'
          },
          deadline: Date,
          completedAt: Date,
          notes: String
        },
        escalation: {
          escalated: Boolean,
          escalatedTo: String,
          escalatedAt: Date,
          reason: String
        }
      }],
      violationTrends: {
        daily: [Number],
        weekly: [Number],
        monthly: [Number]
      }
    },
    
    enforcement: {
      automatedEnforcement: {
        enabled: {
          type: Boolean,
          default: true
        },
        actions: [{
          trigger: String,
          action: String,
          parameters: mongoose.Schema.Types.Mixed,
          lastExecuted: Date,
          executionCount: Number
        }]
      },
      manualEnforcement: {
        reviews: [{
          reviewDate: Date,
          reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AdminUser'
          },
          findings: [String],
          actionsToken: [String],
          nextReview: Date
        }]
      },
      enforcementMetrics: {
        complianceRate: {
          type: Number,
          min: 0,
          max: 100
        },
        enforcementEffectiveness: {
          type: Number,
          min: 0,
          max: 100
        },
        meanTimeToRemediation: Number,
        falsePositiveRate: Number
      }
    },
    
    alerting: {
      alertConfigurations: [{
        alertId: String,
        name: String,
        condition: mongoose.Schema.Types.Mixed,
        severity: String,
        channels: [{
          type: {
            type: String,
            enum: ['EMAIL', 'SMS', 'SLACK', 'WEBHOOK', 'DASHBOARD', 'PAGERDUTY', 'CUSTOM']
          },
          configuration: mongoose.Schema.Types.Mixed,
          enabled: Boolean
        }],
        recipients: [{
          type: {
            type: String,
            enum: ['USER', 'ROLE', 'GROUP', 'ESCALATION_CHAIN']
          },
          identifier: String,
          conditions: mongoose.Schema.Types.Mixed
        }],
        throttling: {
          enabled: Boolean,
          windowMinutes: Number,
          maxAlerts: Number
        },
        active: {
          type: Boolean,
          default: true
        }
      }],
      alertHistory: [{
        alertId: String,
        triggeredAt: Date,
        condition: String,
        severity: String,
        message: String,
        delivered: Boolean,
        acknowledged: Boolean,
        acknowledgedBy: String,
        acknowledgedAt: Date,
        resolution: String
      }]
    }
  },

  // ==================== Lifecycle Management ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'UNDER_REVIEW', 
              'SUSPENDED', 'DEPRECATED', 'ARCHIVED'],
      default: 'DRAFT',
      required: true,
      index: true
    },
    
    effectiveDates: {
      effectiveFrom: {
        type: Date,
        required: true
      },
      effectiveTo: Date,
      graceperiodEnd: Date
    },
    
    approval: {
      required: {
        type: Boolean,
        default: true
      },
      approvers: [{
        role: String,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        approvedAt: Date,
        comments: String,
        conditions: [String]
      }],
      approvalStatus: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'CONDITIONAL'],
        default: 'PENDING'
      },
      approvalDate: Date,
      approvalNotes: String
    },
    
    review: {
      reviewCycle: {
        frequency: {
          type: String,
          enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'BIENNIAL'],
          default: 'ANNUAL'
        },
        lastReview: Date,
        nextReview: Date
      },
      reviewHistory: [{
        reviewDate: Date,
        reviewer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        reviewType: {
          type: String,
          enum: ['SCHEDULED', 'TRIGGERED', 'EMERGENCY', 'COMPLIANCE']
        },
        findings: mongoose.Schema.Types.Mixed,
        recommendations: [String],
        changesRequired: Boolean,
        approvedChanges: [String]
      }],
      triggers: [{
        triggerType: {
          type: String,
          enum: ['INCIDENT', 'REGULATION_CHANGE', 'TECHNOLOGY_CHANGE', 'BUSINESS_CHANGE', 'CUSTOM']
        },
        condition: mongoose.Schema.Types.Mixed,
        lastTriggered: Date
      }]
    },
    
    deprecation: {
      isDeprecated: {
        type: Boolean,
        default: false
      },
      deprecatedAt: Date,
      deprecatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      reason: String,
      replacementPolicy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SecurityPolicy'
      },
      migrationGuidance: String,
      sunsetDate: Date
    },
    
    archival: {
      isArchived: {
        type: Boolean,
        default: false
      },
      archivedAt: Date,
      archivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      archivalReason: String,
      retentionPeriod: {
        duration: Number,
        unit: {
          type: String,
          enum: ['DAYS', 'MONTHS', 'YEARS']
        }
      },
      destructionDate: Date
    }
  },

  // ==================== Relationships and Dependencies ====================
  relationships: {
    parentPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityPolicy',
      index: true
    },
    
    childPolicies: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityPolicy'
    }],
    
    relatedPolicies: [{
      policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SecurityPolicy'
      },
      relationshipType: {
        type: String,
        enum: ['DEPENDS_ON', 'CONFLICTS_WITH', 'COMPLEMENTS', 'SUPERSEDES', 'REFERENCES']
      },
      description: String
    }],
    
    dependencies: {
      upstream: [{
        resourceType: String,
        resourceId: String,
        dependencyType: String,
        critical: Boolean,
        validationRequired: Boolean
      }],
      downstream: [{
        resourceType: String,
        resourceId: String,
        impactType: String,
        notificationRequired: Boolean
      }]
    },
    
    stakeholders: [{
      stakeholderType: {
        type: String,
        enum: ['OWNER', 'APPROVER', 'IMPLEMENTER', 'REVIEWER', 'CONSUMER', 'AUDITOR']
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      department: String,
      responsibilities: [String],
      notificationPreferences: {
        changes: Boolean,
        violations: Boolean,
        reviews: Boolean,
        incidents: Boolean
      }
    }]
  },

  // ==================== Audit and Documentation ====================
  auditTrail: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    
    modifications: [{
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      modifiedAt: {
        type: Date,
        default: Date.now
      },
      modificationType: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUSPEND', 'ACTIVATE', 'ARCHIVE']
      },
      changes: mongoose.Schema.Types.Mixed,
      changeReason: String,
      changeTicket: String,
      approvalRequired: Boolean,
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    accessLog: [{
      accessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      accessedAt: {
        type: Date,
        default: Date.now
      },
      accessType: {
        type: String,
        enum: ['VIEW', 'EXPORT', 'PRINT', 'SHARE']
      },
      ipAddress: String,
      userAgent: String,
      purpose: String
    }],
    
    complianceAudits: [{
      auditDate: Date,
      auditor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      auditType: {
        type: String,
        enum: ['INTERNAL', 'EXTERNAL', 'REGULATORY', 'CERTIFICATION']
      },
      scope: [String],
      findings: mongoose.Schema.Types.Mixed,
      nonConformities: [{
        finding: String,
        severity: String,
        remediation: String,
        deadline: Date,
        status: String
      }],
      recommendations: [String],
      nextAuditDate: Date
    }]
  },

  // ==================== Performance Metrics ====================
  metrics: {
    effectiveness: {
      complianceRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      violationReductionRate: {
        type: Number,
        min: -100,
        max: 100
      },
      incidentPreventionRate: Number,
      falsePositiveRate: Number,
      meanTimeToDetect: Number,
      meanTimeToRespond: Number,
      meanTimeToResolve: Number
    },
    
    coverage: {
      entitiesCovered: Number,
      percentageCoverage: Number,
      gapAnalysis: mongoose.Schema.Types.Mixed,
      uncoveredRisks: [String]
    },
    
    operationalMetrics: {
      evaluationsPerformed: {
        type: Number,
        default: 0
      },
      automatedChecks: {
        type: Number,
        default: 0
      },
      manualReviews: {
        type: Number,
        default: 0
      },
      exceptionsGranted: {
        type: Number,
        default: 0
      },
      overridesUsed: {
        type: Number,
        default: 0
      }
    },
    
    costMetrics: {
      implementationCost: {
        initial: Number,
        ongoing: Number,
        currency: String
      },
      violationCost: {
        total: Number,
        average: Number,
        currency: String
      },
      savingsAchieved: Number,
      roi: Number
    }
  }
}, {
  timestamps: true,
  collection: 'security_policies',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes for Performance ====================
securityPolicySchema.index({ 'policyMetadata.name': 1, 'lifecycle.status': 1 });
securityPolicySchema.index({ 'policyMetadata.category': 1, 'policyMetadata.priority': 1 });
securityPolicySchema.index({ 'lifecycle.status': 1, 'lifecycle.effectiveDates.effectiveFrom': 1 });
securityPolicySchema.index({ 'compliance.standards.standardName': 1 });
securityPolicySchema.index({ 'riskManagement.overallRiskLevel': 1 });
securityPolicySchema.index({ 'lifecycle.review.nextReview': 1 });
securityPolicySchema.index({ 'policyMetadata.tags': 1 });
securityPolicySchema.index({ 'policyMetadata.keywords': 1 });
securityPolicySchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
securityPolicySchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.lifecycle.status === 'ACTIVE' &&
         this.lifecycle.effectiveDates.effectiveFrom <= now &&
         (!this.lifecycle.effectiveDates.effectiveTo || this.lifecycle.effectiveDates.effectiveTo > now);
});

securityPolicySchema.virtual('versionString').get(function() {
  const v = this.policyMetadata.version;
  return `${v.major}.${v.minor}.${v.patch}`;
});

securityPolicySchema.virtual('complianceStatus').get(function() {
  const score = this.compliance.complianceMetrics.overallScore;
  if (score >= 95) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'SATISFACTORY';
  if (score >= 40) return 'NEEDS_IMPROVEMENT';
  return 'CRITICAL';
});

// ==================== Instance Methods ====================
securityPolicySchema.methods.evaluateRule = async function(ruleId, context) {
  try {
    const rule = this.policyRules.rules.find(r => r.ruleId === ruleId);
    if (!rule) {
      throw new AppError(`Rule ${ruleId} not found`, 404);
    }

    if (!rule.enabled) {
      return { result: 'SKIPPED', reason: 'Rule is disabled' };
    }

    let evaluationResult = { result: 'UNKNOWN', details: {} };

    // Evaluate based on condition type
    switch (rule.condition.type) {
      case 'ALWAYS':
        evaluationResult.result = 'APPLICABLE';
        break;
      
      case 'IF_THEN':
        evaluationResult = await this.evaluateIfThenCondition(rule.condition, context);
        break;
      
      case 'WHEN':
        evaluationResult = await this.evaluateWhenCondition(rule.condition, context);
        break;
      
      case 'UNLESS':
        evaluationResult = await this.evaluateUnlessCondition(rule.condition, context);
        break;
      
      case 'COMPLEX':
        evaluationResult = await this.evaluateComplexCondition(rule.condition, context);
        break;
    }

    // Apply the action if condition is met
    if (evaluationResult.result === 'APPLICABLE') {
      const actionResult = await this.applyAction(rule.action, context);
      evaluationResult.actionTaken = actionResult;
    }

    // Update rule metadata
    rule.metadata.lastEvaluated = new Date();
    rule.metadata.evaluationCount += 1;

    await this.save();
    return evaluationResult;

  } catch (error) {
    logger.error(`Error evaluating rule ${ruleId}:`, error);
    throw error;
  }
};

// Private helper methods for rule evaluation
securityPolicySchema.methods.evaluateIfThenCondition = async function(condition, context) {
  const expression = condition.expression;
  const result = await this.evaluateExpression(expression.if, context);
  
  if (result) {
    return { result: 'APPLICABLE', details: { conditionMet: true } };
  }
  return { result: 'NOT_APPLICABLE', details: { conditionMet: false } };
};

securityPolicySchema.methods.evaluateWhenCondition = async function(condition, context) {
  const expression = condition.expression;
  const timing = await this.evaluateTiming(expression.when, context);
  
  if (timing) {
    return { result: 'APPLICABLE', details: { timingMet: true } };
  }
  return { result: 'NOT_APPLICABLE', details: { timingMet: false } };
};

securityPolicySchema.methods.evaluateUnlessCondition = async function(condition, context) {
  const expression = condition.expression;
  const exception = await this.evaluateExpression(expression.unless, context);
  
  if (!exception) {
    return { result: 'APPLICABLE', details: { exceptionNotMet: true } };
  }
  return { result: 'NOT_APPLICABLE', details: { exceptionMet: true } };
};

securityPolicySchema.methods.evaluateComplexCondition = async function(condition, context) {
  // Complex evaluation logic for multiple conditions
  const expression = condition.expression;
  const results = [];

  for (const subCondition of expression.conditions) {
    const result = await this.evaluateExpression(subCondition, context);
    results.push(result);
  }

  const operator = expression.operator || 'AND';
  let finalResult;

  switch (operator) {
    case 'AND':
      finalResult = results.every(r => r === true);
      break;
    case 'OR':
      finalResult = results.some(r => r === true);
      break;
    case 'XOR':
      finalResult = results.filter(r => r === true).length === 1;
      break;
    default:
      finalResult = false;
  }

  return {
    result: finalResult ? 'APPLICABLE' : 'NOT_APPLICABLE',
    details: { operator, results }
  };
};

securityPolicySchema.methods.evaluateExpression = async function(expression, context) {
  // Generic expression evaluation
  if (typeof expression === 'function') {
    return await expression(context);
  }
  
  if (typeof expression === 'object') {
    // Handle object-based expressions
    const { field, operator, value } = expression;
    const contextValue = this.getNestedValue(context, field);
    
    switch (operator) {
      case 'equals':
        return contextValue === value;
      case 'notEquals':
        return contextValue !== value;
      case 'contains':
        return contextValue?.includes(value);
      case 'greaterThan':
        return contextValue > value;
      case 'lessThan':
        return contextValue < value;
      case 'in':
        return value.includes(contextValue);
      case 'notIn':
        return !value.includes(contextValue);
      default:
        return false;
    }
  }
  
  return Boolean(expression);
};

securityPolicySchema.methods.evaluateTiming = async function(timing, context) {
  const now = new Date();
  
  if (timing.schedule) {
    // Check if current time matches schedule
    const schedule = timing.schedule;
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }
    
    if (schedule.hoursOfDay && !schedule.hoursOfDay.includes(hour)) {
      return false;
    }
  }
  
  if (timing.dateRange) {
    if (timing.dateRange.start && now < new Date(timing.dateRange.start)) {
      return false;
    }
    if (timing.dateRange.end && now > new Date(timing.dateRange.end)) {
      return false;
    }
  }
  
  return true;
};

securityPolicySchema.methods.applyAction = async function(action, context) {
  const actionResult = {
    type: action.type,
    executed: false,
    timestamp: new Date(),
    details: {}
  };

  try {
    switch (action.type) {
      case 'ALLOW':
        actionResult.executed = true;
        actionResult.details = { access: 'granted' };
        break;
      
      case 'DENY':
        actionResult.executed = true;
        actionResult.details = { access: 'denied' };
        break;
      
      case 'REQUIRE':
        actionResult.executed = true;
        actionResult.details = { requirements: action.details };
        break;
      
      case 'RESTRICT':
        actionResult.executed = true;
        actionResult.details = { restrictions: action.details };
        break;
      
      case 'LOG':
        await this.logAction(action, context);
        actionResult.executed = true;
        actionResult.details = { logged: true };
        break;
      
      case 'ALERT':
        await this.sendAlert(action, context);
        actionResult.executed = true;
        actionResult.details = { alerted: true };
        break;
      
      case 'ESCALATE':
        await this.escalateAction(action, context);
        actionResult.executed = true;
        actionResult.details = { escalated: true };
        break;
      
      case 'CUSTOM':
        if (action.customHandler) {
          const customResult = await this.executeCustomHandler(action.customHandler, context);
          actionResult.executed = true;
          actionResult.details = customResult;
        }
        break;
    }
  } catch (error) {
    logger.error(`Error applying action ${action.type}:`, error);
    actionResult.error = error.message;
  }

  return actionResult;
};

securityPolicySchema.methods.getNestedValue = function(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value == null) return undefined;
    value = value[key];
  }
  
  return value;
};

securityPolicySchema.methods.logAction = async function(action, context) {
  logger.info(`Policy action logged: ${JSON.stringify({ action, context })}`);
};

securityPolicySchema.methods.sendAlert = async function(action, context) {
  // Alert sending logic
  const alert = {
    policyId: this.policyId,
    action: action.type,
    details: action.details,
    context,
    timestamp: new Date()
  };
  
  // Send to configured alert channels
  logger.warn(`Security alert triggered: ${JSON.stringify(alert)}`);
};

securityPolicySchema.methods.escalateAction = async function(action, context) {
  // Escalation logic
  logger.error(`Security escalation required: ${JSON.stringify({ action, context })}`);
};

securityPolicySchema.methods.executeCustomHandler = async function(handler, context) {
  // Execute custom handler logic
  logger.info(`Executing custom handler: ${handler}`);
  return { customHandler: handler, executed: true };
};

securityPolicySchema.methods.checkCompliance = async function(context) {
  const complianceResult = {
    policyId: this.policyId,
    policyName: this.policyMetadata.name,
    timestamp: new Date(),
    compliant: true,
    violations: [],
    score: 100
  };

  try {
    // Evaluate all active rules
    const activeRules = this.policyRules.rules.filter(r => r.enabled);
    let violationCount = 0;

    for (const rule of activeRules) {
      const evaluation = await this.evaluateRule(rule.ruleId, context);
      
      if (evaluation.result === 'VIOLATION') {
        violationCount++;
        complianceResult.violations.push({
          ruleId: rule.ruleId,
          ruleName: rule.ruleName,
          severity: rule.ruleType,
          details: evaluation.details
        });
      }
    }

    // Calculate compliance score
    if (activeRules.length > 0) {
      complianceResult.score = Math.round(((activeRules.length - violationCount) / activeRules.length) * 100);
    }

    complianceResult.compliant = violationCount === 0;

    // Update policy metrics
    this.metrics.effectiveness.complianceRate = complianceResult.score;
    this.monitoring.violationTracking.totalViolations += violationCount;

    await this.save();
    return complianceResult;

  } catch (error) {
    logger.error('Error checking compliance:', error);
    throw error;
  }
};

securityPolicySchema.methods.addViolation = async function(violationData) {
  try {
    const violation = {
      violationId: `VIOL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      detectedAt: new Date(),
      violationType: violationData.type,
      severity: violationData.severity,
      description: violationData.description,
      affectedEntities: violationData.affectedEntities,
      evidence: violationData.evidence,
      status: 'DETECTED',
      remediation: {
        requiredActions: violationData.requiredActions || [],
        assignedTo: violationData.assignedTo,
        deadline: violationData.deadline
      }
    };

    this.monitoring.violationTracking.violations.push(violation);
    this.monitoring.violationTracking.totalViolations += 1;
    this.monitoring.violationTracking.openViolations += 1;

    // Update violation counts in rules
    const relatedRule = this.policyRules.rules.find(r => r.ruleId === violationData.ruleId);
    if (relatedRule) {
      relatedRule.metadata.violationCount += 1;
    }

    await this.save();
    
    logger.info(`Violation ${violation.violationId} added to policy ${this.policyId}`);
    return violation;

  } catch (error) {
    logger.error('Error adding violation:', error);
    throw error;
  }
};

securityPolicySchema.methods.updateLifecycleStatus = async function(newStatus, updatedBy, reason) {
  try {
    const validTransitions = {
      'DRAFT': ['PENDING_APPROVAL', 'ARCHIVED'],
      'PENDING_APPROVAL': ['APPROVED', 'DRAFT', 'REJECTED'],
      'APPROVED': ['ACTIVE', 'PENDING_APPROVAL'],
      'ACTIVE': ['UNDER_REVIEW', 'SUSPENDED', 'DEPRECATED'],
      'UNDER_REVIEW': ['ACTIVE', 'SUSPENDED', 'DEPRECATED'],
      'SUSPENDED': ['ACTIVE', 'DEPRECATED', 'ARCHIVED'],
      'DEPRECATED': ['ARCHIVED'],
      'ARCHIVED': []
    };

    const currentStatus = this.lifecycle.status;
    
    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new AppError(`Invalid status transition from ${currentStatus} to ${newStatus}`, 400);
    }

    this.lifecycle.status = newStatus;

    // Add audit trail entry
    this.auditTrail.modifications.push({
      modifiedBy: updatedBy,
      modifiedAt: new Date(),
      modificationType: 'UPDATE',
      changes: { status: { from: currentStatus, to: newStatus } },
      changeReason: reason
    });

    // Handle status-specific actions
    switch (newStatus) {
      case 'ACTIVE':
        this.lifecycle.effectiveDates.effectiveFrom = new Date();
        break;
      case 'DEPRECATED':
        this.lifecycle.deprecation = {
          isDeprecated: true,
          deprecatedAt: new Date(),
          deprecatedBy: updatedBy,
          reason
        };
        break;
      case 'ARCHIVED':
        this.lifecycle.archival = {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: updatedBy,
          archivalReason: reason
        };
        break;
    }

    await this.save();
    
    logger.info(`Policy ${this.policyId} status updated from ${currentStatus} to ${newStatus}`);
    return this;

  } catch (error) {
    logger.error('Error updating lifecycle status:', error);
    throw error;
  }
};

// ==================== Static Methods ====================
securityPolicySchema.statics.findByCategory = async function(category, options = {}) {
  const query = { 'policyMetadata.category': category };
  
  if (options.activeOnly) {
    query['lifecycle.status'] = 'ACTIVE';
  }
  
  return this.find(query).sort({ 'policyMetadata.priority': 1 });
};

securityPolicySchema.statics.findActivePolicies = async function() {
  const now = new Date();
  return this.find({
    'lifecycle.status': 'ACTIVE',
    'lifecycle.effectiveDates.effectiveFrom': { $lte: now },
    $or: [
      { 'lifecycle.effectiveDates.effectiveTo': null },
      { 'lifecycle.effectiveDates.effectiveTo': { $gt: now } }
    ]
  });
};

securityPolicySchema.statics.findPoliciesForReview = async function() {
  const now = new Date();
  return this.find({
    'lifecycle.status': { $in: ['ACTIVE', 'UNDER_REVIEW'] },
    'lifecycle.review.nextReview': { $lte: now }
  });
};

securityPolicySchema.statics.findHighRiskPolicies = async function() {
  return this.find({
    $or: [
      { 'riskManagement.riskAssessment.overallRiskLevel': { $in: ['CRITICAL', 'HIGH'] } },
      { 'policyMetadata.priority': 'CRITICAL' }
    ]
  });
};

// ==================== Model Registration ====================
const SecurityPolicy = mongoose.model('SecurityPolicy', securityPolicySchema);

module.exports = SecurityPolicy;