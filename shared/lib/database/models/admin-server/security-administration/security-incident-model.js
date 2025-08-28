'use strict';

/**
 * @fileoverview Enterprise security incident model for comprehensive incident management and response
 * @module servers/admin-server/modules/security-administration/models/security-incident-model
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
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const EncryptionService = require('../../../../security/encryption/encryption-service');
const CommonValidator = require('../../../../utils/validators/common-validators');
const stringHelper = require('../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../utils/helpers/date-helper');
const { ROLES } = require('../../../../utils/constants/roles');
const { PERMISSIONS } = require('../../../../utils/constants/permissions');

/**
 * @class SecurityIncidentSchema
 * @description Comprehensive security incident schema for enterprise incident response management
 * @extends mongoose.Schema
 */
const securityIncidentSchemaDefinition = {
  // ==================== Core Incident Identification ====================
  incidentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `INC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for security incident'
  },

  incidentMetadata: {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 300,
      index: true,
      description: 'Brief incident title'
    },
    
    category: {
      type: String,
      required: true,
      enum: ['DATA_BREACH', 'UNAUTHORIZED_ACCESS', 'MALWARE', 'PHISHING', 'RANSOMWARE',
              'DENIAL_OF_SERVICE', 'INSIDER_THREAT', 'SOCIAL_ENGINEERING', 'PHYSICAL_SECURITY',
              'ACCOUNT_COMPROMISE', 'PRIVILEGE_ESCALATION', 'DATA_EXFILTRATION', 'SYSTEM_COMPROMISE',
              'POLICY_VIOLATION', 'COMPLIANCE_BREACH', 'SUPPLY_CHAIN', 'ZERO_DAY', 'OTHER'],
      index: true,
      description: 'Primary incident category'
    },
    
    subcategories: [{
      type: String,
      description: 'Additional categorization tags'
    }],
    
    severity: {
      level: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'],
        required: true,
        index: true,
        default: 'MEDIUM'
      },
      score: {
        type: Number,
        min: 0,
        max: 10,
        default: 5
      },
      justification: String,
      calculationMethod: {
        type: String,
        enum: ['CVSS', 'CUSTOM', 'RISK_MATRIX', 'IMPACT_BASED']
      }
    },
    
    priority: {
      level: {
        type: String,
        enum: ['P1', 'P2', 'P3', 'P4', 'P5'],
        required: true,
        default: 'P3'
      },
      escalationRequired: {
        type: Boolean,
        default: false
      },
      slaDeadline: Date,
      businessImpact: {
        type: String,
        enum: ['CRITICAL', 'SIGNIFICANT', 'MODERATE', 'MINOR', 'NONE']
      }
    },
    
    classification: {
      confidentiality: {
        type: String,
        enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET'],
        default: 'CONFIDENTIAL'
      },
      tlpLevel: {
        type: String,
        enum: ['WHITE', 'GREEN', 'AMBER', 'RED'],
        default: 'AMBER',
        description: 'Traffic Light Protocol classification'
      },
      pii: {
        type: Boolean,
        default: false,
        description: 'Contains personally identifiable information'
      },
      regulatory: {
        type: Boolean,
        default: false,
        description: 'Subject to regulatory requirements'
      }
    },
    
    tags: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    
    relatedIncidents: [{
      incidentId: String,
      relationshipType: {
        type: String,
        enum: ['PARENT', 'CHILD', 'RELATED', 'DUPLICATE', 'MERGED']
      },
      description: String
    }]
  },

  // ==================== Incident Details ====================
  incidentDetails: {
    description: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 5000,
      description: 'Detailed incident description'
    },
    
    summary: {
      executiveSummary: String,
      technicalSummary: String,
      businessSummary: String
    },
    
    timeline: {
      discoveredAt: {
        type: Date,
        required: true,
        index: true
      },
      reportedAt: {
        type: Date,
        required: true,
        default: Date.now
      },
      startedAt: Date,
      confirmedAt: Date,
      containedAt: Date,
      eradicatedAt: Date,
      recoveredAt: Date,
      closedAt: Date,
      
      estimatedStartTime: Date,
      actualStartTime: Date,
      detectionDelay: Number, // in minutes
      responseDelay: Number, // in minutes
      
      keyEvents: [{
        timestamp: Date,
        event: String,
        description: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        evidence: [String]
      }]
    },
    
    discovery: {
      method: {
        type: String,
        enum: ['AUTOMATED_DETECTION', 'USER_REPORT', 'SECURITY_AUDIT', 'EXTERNAL_NOTIFICATION',
                'MONITORING_ALERT', 'THREAT_INTELLIGENCE', 'PENETRATION_TEST', 'INCIDENT_RESPONSE',
                'VENDOR_NOTIFICATION', 'LAW_ENFORCEMENT', 'OTHER']
      },
      source: {
        type: {
          type: String,
          enum: ['INTERNAL', 'EXTERNAL', 'PARTNER', 'CUSTOMER', 'VENDOR', 'ANONYMOUS']
        },
        identifier: String,
        contactInfo: String
      },
      initialIndicators: [{
        indicator: String,
        type: {
          type: String,
          enum: ['IP_ADDRESS', 'DOMAIN', 'URL', 'FILE_HASH', 'EMAIL', 'BEHAVIOR', 'PATTERN', 'OTHER']
        },
        confidence: {
          type: Number,
          min: 0,
          max: 100
        }
      }]
    },
    
    attackVector: {
      primary: {
        type: String,
        enum: ['NETWORK', 'EMAIL', 'WEB_APPLICATION', 'ENDPOINT', 'PHYSICAL', 'SOCIAL', 'SUPPLY_CHAIN', 'UNKNOWN']
      },
      secondary: [String],
      techniques: [{
        techniqueId: String,
        techniqueName: String,
        mitreAttack: {
          tactic: String,
          technique: String,
          subtechnique: String
        }
      }],
      vulnerabilitiesExploited: [{
        cveId: String,
        description: String,
        cvssScore: Number,
        patchAvailable: Boolean,
        patchApplied: Boolean
      }]
    },
    
    scope: {
      systemsAffected: [{
        systemId: String,
        systemName: String,
        systemType: {
          type: String,
          enum: ['SERVER', 'WORKSTATION', 'NETWORK_DEVICE', 'APPLICATION', 'DATABASE', 'CLOUD_SERVICE', 'IOT_DEVICE']
        },
        criticality: {
          type: String,
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
        },
        impactType: [String],
        compromiseLevel: {
          type: String,
          enum: ['FULL', 'PARTIAL', 'ATTEMPTED', 'UNKNOWN']
        }
      }],
      
      dataAffected: [{
        dataType: {
          type: String,
          enum: ['PII', 'PHI', 'PCI', 'INTELLECTUAL_PROPERTY', 'FINANCIAL', 'OPERATIONAL', 'OTHER']
        },
        classification: String,
        recordCount: Number,
        dataVolume: {
          size: Number,
          unit: {
            type: String,
            enum: ['BYTES', 'KB', 'MB', 'GB', 'TB']
          }
        },
        exposure: {
          type: String,
          enum: ['ACCESSED', 'COPIED', 'MODIFIED', 'DELETED', 'ENCRYPTED', 'EXFILTRATED', 'UNKNOWN']
        }
      }],
      
      usersAffected: {
        internal: {
          count: Number,
          departments: [String],
          vipAffected: Boolean,
          userIds: [String]
        },
        external: {
          count: Number,
          customerCount: Number,
          partnerCount: Number,
          publicExposure: Boolean
        }
      },
      
      geographicalScope: {
        regions: [String],
        countries: [String],
        datacenters: [String],
        offices: [String]
      },
      
      businessImpact: {
        operationsDisrupted: Boolean,
        revenueImpact: {
          estimated: Number,
          actual: Number,
          currency: String
        },
        reputationalImpact: {
          type: String,
          enum: ['SEVERE', 'SIGNIFICANT', 'MODERATE', 'MINOR', 'NONE']
        },
        regulatoryImpact: {
          reportingRequired: Boolean,
          regulators: [String],
          potentialFines: Number
        },
        customerImpact: {
          serviceDisruption: Boolean,
          dataCompromise: Boolean,
          trustImpact: String
        }
      }
    }
  },

  // ==================== Threat Intelligence ====================
  threatIntelligence: {
    threatActor: {
      identified: {
        type: Boolean,
        default: false
      },
      name: String,
      type: {
        type: String,
        enum: ['NATION_STATE', 'ORGANIZED_CRIME', 'HACKTIVIST', 'INSIDER', 'COMPETITOR', 'UNKNOWN']
      },
      sophistication: {
        type: String,
        enum: ['ADVANCED', 'INTERMEDIATE', 'BASIC', 'UNKNOWN']
      },
      motivation: {
        type: String,
        enum: ['FINANCIAL', 'ESPIONAGE', 'DISRUPTION', 'IDEOLOGICAL', 'PERSONAL', 'UNKNOWN']
      },
      ttps: [{
        tactic: String,
        technique: String,
        procedure: String
      }],
      previousActivity: [String],
      attribution: {
        confidence: {
          type: Number,
          min: 0,
          max: 100
        },
        evidence: [String],
        source: String
      }
    },
    
    indicators: [{
      ioc: {
        type: String,
        required: true
      },
      iocType: {
        type: String,
        enum: ['IP', 'DOMAIN', 'URL', 'EMAIL', 'MD5', 'SHA1', 'SHA256', 'CVE', 'YARA', 'PATTERN']
      },
      confidence: {
        type: Number,
        min: 0,
        max: 100
      },
      firstSeen: Date,
      lastSeen: Date,
      context: String,
      malicious: {
        type: Boolean,
        default: true
      },
      shared: {
        withPartners: Boolean,
        withIsac: Boolean,
        withLawEnforcement: Boolean
      }
    }],
    
    intelligence: [{
      source: {
        type: String,
        enum: ['INTERNAL', 'OSINT', 'COMMERCIAL', 'GOVERNMENT', 'PARTNER', 'ISAC']
      },
      reliability: {
        type: String,
        enum: ['CONFIRMED', 'PROBABLE', 'POSSIBLE', 'DOUBTFUL', 'UNKNOWN']
      },
      credibility: {
        type: Number,
        min: 1,
        max: 5
      },
      information: String,
      classification: String,
      expiryDate: Date
    }],
    
    malwareAnalysis: {
      detected: {
        type: Boolean,
        default: false
      },
      samples: [{
        hash: {
          md5: String,
          sha1: String,
          sha256: String
        },
        fileName: String,
        fileType: String,
        fileSize: Number,
        malwareFamily: String,
        variant: String,
        capabilities: [String],
        sandbox: {
          analyzed: Boolean,
          report: String,
          verdict: String
        }
      }],
      behavior: {
        persistence: [String],
        communication: [String],
        lateralMovement: [String],
        dataExfiltration: [String],
        destruction: [String]
      }
    }
  },

  // ==================== Response Team ====================
  responseTeam: {
    incidentCommander: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      assignedAt: Date,
      contactInfo: {
        primary: String,
        secondary: String,
        escalation: String
      }
    },
    
    coreTeam: [{
      member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      role: {
        type: String,
        enum: ['LEAD', 'ANALYST', 'FORENSICS', 'COMMUNICATIONS', 'LEGAL', 'MANAGEMENT']
      },
      responsibilities: [String],
      assignedAt: Date,
      availability: {
        status: {
          type: String,
          enum: ['AVAILABLE', 'BUSY', 'OFF_DUTY', 'ON_CALL']
        },
        until: Date
      }
    }],
    
    supportTeam: [{
      member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      department: String,
      role: String,
      responsibilities: [String],
      assignedAt: Date
    }],
    
    externalSupport: [{
      organization: String,
      type: {
        type: String,
        enum: ['VENDOR', 'CONSULTANT', 'LAW_ENFORCEMENT', 'LEGAL', 'PR', 'INSURANCE']
      },
      contact: {
        name: String,
        email: String,
        phone: String
      },
      engagedAt: Date,
      scope: String,
      nda: {
        signed: Boolean,
        signedDate: Date
      }
    }],
    
    communications: {
      internalChannels: [{
        channel: {
          type: String,
          enum: ['EMAIL', 'SLACK', 'TEAMS', 'PHONE', 'WAR_ROOM', 'VIDEO_CONFERENCE']
        },
        identifier: String,
        purpose: String
      }],
      escalationChain: [{
        level: Number,
        role: String,
        contact: String,
        triggerCriteria: [String]
      }],
      statusUpdates: [{
        timestamp: Date,
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        audience: [String],
        message: String,
        channel: String
      }]
    }
  },

  // ==================== Investigation ====================
  investigation: {
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED'],
      default: 'NOT_STARTED',
      index: true
    },
    
    leadInvestigator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    
    forensics: {
      evidenceCollected: [{
        evidenceId: String,
        type: {
          type: String,
          enum: ['LOG_FILE', 'MEMORY_DUMP', 'DISK_IMAGE', 'NETWORK_CAPTURE', 'SCREENSHOT', 'DOCUMENT', 'OTHER']
        },
        description: String,
        source: String,
        collectedAt: Date,
        collectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        chainOfCustody: [{
          timestamp: Date,
          action: String,
          performedBy: String,
          location: String,
          hash: String
        }],
        storage: {
          location: String,
          encrypted: Boolean,
          retention: Date
        }
      }],
      
      analysis: [{
        analysisId: String,
        type: {
          type: String,
          enum: ['MALWARE', 'MEMORY', 'DISK', 'NETWORK', 'LOG', 'BEHAVIORAL']
        },
        tools: [String],
        findings: String,
        artifacts: [String],
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        performedAt: Date,
        report: String
      }],
      
      rootCause: {
        identified: {
          type: Boolean,
          default: false
        },
        description: String,
        contributingFactors: [String],
        preventablity: {
          type: String,
          enum: ['PREVENTABLE', 'PARTIALLY_PREVENTABLE', 'NOT_PREVENTABLE', 'UNKNOWN']
        }
      }
    },
    
    interviews: [{
      interviewId: String,
      subject: {
        name: String,
        role: String,
        department: String,
        type: {
          type: String,
          enum: ['WITNESS', 'VICTIM', 'SUSPECT', 'EXPERT']
        }
      },
      interviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      conductedAt: Date,
      location: String,
      notes: String,
      recording: String,
      followUpRequired: Boolean
    }],
    
    findings: {
      summary: String,
      detailedFindings: [{
        finding: String,
        evidence: [String],
        confidence: {
          type: Number,
          min: 0,
          max: 100
        },
        impact: String,
        recommendations: [String]
      }],
      lessonsLearned: [{
        lesson: String,
        category: String,
        priority: String,
        actionItems: [String]
      }],
      gaps: [{
        gap: String,
        type: {
          type: String,
          enum: ['TECHNICAL', 'PROCESS', 'PEOPLE', 'POLICY']
        },
        remediation: String,
        priority: String
      }]
    },
    
    timeline: [{
      timestamp: Date,
      event: String,
      type: {
        type: String,
        enum: ['INITIAL_COMPROMISE', 'LATERAL_MOVEMENT', 'ESCALATION', 'EXFILTRATION', 
                'DISCOVERY', 'CONTAINMENT', 'ERADICATION', 'RECOVERY']
      },
      actor: String,
      system: String,
      evidence: [String],
      confidence: {
        type: Number,
        min: 0,
        max: 100
      }
    }]
  },

  // ==================== Response Actions ====================
  responseActions: {
    containment: {
      strategy: {
        type: String,
        enum: ['IMMEDIATE', 'DELAYED', 'PARTIAL', 'FULL', 'NONE']
      },
      actions: [{
        actionId: String,
        type: {
          type: String,
          enum: ['ISOLATE_SYSTEM', 'BLOCK_IP', 'DISABLE_ACCOUNT', 'REVOKE_ACCESS', 
                  'QUARANTINE', 'PATCH', 'CONFIGURATION_CHANGE', 'OTHER']
        },
        description: String,
        target: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        performedAt: Date,
        status: {
          type: String,
          enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK']
        },
        result: String,
        rollbackPlan: String
      }],
      effectiveness: {
        type: String,
        enum: ['EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'UNKNOWN']
      }
    },
    
    eradication: {
      actions: [{
        actionId: String,
        type: {
          type: String,
          enum: ['REMOVE_MALWARE', 'REBUILD_SYSTEM', 'RESET_PASSWORDS', 'REVOKE_CERTIFICATES',
                  'UPDATE_SIGNATURES', 'PATCH_VULNERABILITY', 'OTHER']
        },
        description: String,
        target: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        performedAt: Date,
        verification: {
          verified: Boolean,
          verifiedBy: String,
          verifiedAt: Date,
          method: String
        }
      }],
      completeness: {
        type: String,
        enum: ['COMPLETE', 'PARTIAL', 'ONGOING', 'NOT_STARTED']
      }
    },
    
    recovery: {
      plan: {
        approved: Boolean,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        approvalDate: Date
      },
      actions: [{
        actionId: String,
        type: {
          type: String,
          enum: ['RESTORE_SERVICE', 'RESTORE_DATA', 'REBUILD_SYSTEM', 'VALIDATE_INTEGRITY',
                  'MONITOR', 'TEST', 'OTHER']
        },
        description: String,
        priority: Number,
        dependencies: [String],
        assignedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        scheduledStart: Date,
        actualStart: Date,
        scheduledEnd: Date,
        actualEnd: Date,
        status: {
          type: String,
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED']
        },
        validation: {
          required: Boolean,
          performed: Boolean,
          result: String
        }
      }],
      monitoring: {
        enhanced: Boolean,
        duration: Number,
        metrics: [String],
        thresholds: mongoose.Schema.Types.Mixed
      }
    },
    
    preventiveMeasures: [{
      measureId: String,
      type: {
        type: String,
        enum: ['TECHNICAL', 'PROCESS', 'TRAINING', 'POLICY']
      },
      description: String,
      priority: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      },
      owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      deadline: Date,
      status: {
        type: String,
        enum: ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'VALIDATED', 'CLOSED']
      },
      effectiveness: {
        measured: Boolean,
        metric: String,
        target: Number,
        actual: Number
      }
    }]
  },

  // ==================== Communication & Reporting ====================
  communicationReporting: {
    notifications: [{
      notificationId: String,
      type: {
        type: String,
        enum: ['INITIAL', 'UPDATE', 'ESCALATION', 'RESOLUTION', 'FINAL']
      },
      audience: {
        internal: {
          executives: Boolean,
          management: Boolean,
          technical: Boolean,
          allStaff: Boolean,
          specific: [String]
        },
        external: {
          customers: Boolean,
          partners: Boolean,
          vendors: Boolean,
          media: Boolean,
          specific: [String]
        },
        regulatory: {
          required: Boolean,
          agencies: [String],
          deadline: Date
        }
      },
      sentAt: Date,
      sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      channel: String,
      content: {
        subject: String,
        message: String,
        attachments: [String]
      },
      acknowledgments: [{
        acknowledgedBy: String,
        acknowledgedAt: Date
      }]
    }],
    
    reports: [{
      reportId: String,
      type: {
        type: String,
        enum: ['INITIAL', 'INTERIM', 'FINAL', 'EXECUTIVE', 'TECHNICAL', 'COMPLIANCE', 'POST_MORTEM']
      },
      version: Number,
      status: {
        type: String,
        enum: ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']
      },
      authors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }],
      reviewers: [{
        reviewer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        reviewedAt: Date,
        comments: String,
        approved: Boolean
      }],
      content: {
        sections: mongoose.Schema.Types.Mixed,
        attachments: [String],
        classification: String
      },
      distribution: {
        internal: [String],
        external: [String],
        restricted: Boolean
      },
      publishedAt: Date,
      expiryDate: Date
    }],
    
    publicRelations: {
      mediaInvolved: Boolean,
      pressRelease: {
        required: Boolean,
        drafted: Boolean,
        approved: Boolean,
        released: Boolean,
        releaseDate: Date,
        content: String
      },
      socialMedia: {
        monitoring: Boolean,
        response: String,
        sentiment: {
          type: String,
          enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']
        }
      },
      customerCommunication: {
        required: Boolean,
        method: [String],
        sentAt: Date,
        content: String
      }
    },
    
    regulatoryCompliance: {
      reportingRequired: Boolean,
      regulations: [{
        regulation: {
          type: String,
          enum: ['GDPR', 'CCPA', 'HIPAA', 'PCI_DSS', 'SOX', 'GLBA', 'FERPA', 'OTHER']
        },
        reportingDeadline: Date,
        reported: Boolean,
        reportedAt: Date,
        referenceNumber: String,
        response: String
      }],
      legalInvolvement: {
        required: Boolean,
        counsel: String,
        advisoryNotes: String,
        litigation: {
          expected: Boolean,
          status: String
        }
      },
      lawEnforcement: {
        involved: Boolean,
        agency: String,
        caseNumber: String,
        contact: String,
        cooperation: String
      }
    }
  },

  // ==================== Cost & Impact Analysis ====================
  costImpact: {
    directCosts: {
      investigation: {
        internal: Number,
        external: Number
      },
      containment: Number,
      eradication: Number,
      recovery: Number,
      legal: Number,
      regulatory: {
        fines: Number,
        compliance: Number
      },
      notification: Number,
      creditMonitoring: Number,
      publicRelations: Number,
      total: Number,
      currency: String
    },
    
    indirectCosts: {
      downtime: {
        duration: Number,
        costPerHour: Number,
        totalCost: Number
      },
      productivity: {
        hoursLost: Number,
        costPerHour: Number,
        totalCost: Number
      },
      reputation: {
        customerChurn: Number,
        lostBusiness: Number,
        brandValue: Number
      },
      opportunity: Number,
      total: Number,
      currency: String
    },
    
    insurance: {
      covered: Boolean,
      provider: String,
      policyNumber: String,
      claimNumber: String,
      claimStatus: {
        type: String,
        enum: ['NOT_FILED', 'FILED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'PAID']
      },
      coveredAmount: Number,
      deductible: Number,
      exclusions: [String]
    },
    
    recovery: {
      rto: {
        target: Number,
        actual: Number,
        met: Boolean
      },
      rpo: {
        target: Number,
        actual: Number,
        met: Boolean
      },
      dataRecovered: {
        percentage: Number,
        critical: Boolean
      }
    }
  },

  // ==================== Post-Incident Activities ====================
  postIncident: {
    review: {
      scheduled: Date,
      conducted: Boolean,
      conductedAt: Date,
      participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }],
      findings: {
        whatWentWell: [String],
        whatWentWrong: [String],
        improvements: [String]
      },
      actionItems: [{
        item: String,
        owner: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        deadline: Date,
        status: {
          type: String,
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
        }
      }]
    },
    
    improvements: [{
      improvementId: String,
      type: {
        type: String,
        enum: ['TECHNICAL', 'PROCESS', 'TRAINING', 'POLICY', 'TOOLING']
      },
      description: String,
      justification: String,
      priority: String,
      cost: Number,
      owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      approvalStatus: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'DEFERRED']
      },
      implementationStatus: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED']
      },
      effectiveness: {
        measured: Boolean,
        metrics: [String],
        results: mongoose.Schema.Types.Mixed
      }
    }],
    
    documentation: {
      playbook: {
        created: Boolean,
        updated: Boolean,
        reference: String
      },
      knowledgeBase: {
        article: String,
        tags: [String],
        published: Boolean
      },
      training: {
        materialsCreated: Boolean,
        sessionsDelivered: Number,
        attendees: Number
      }
    },
    
    monitoring: {
      enhanced: Boolean,
      duration: Number,
      indicators: [String],
      alerts: [{
        alertId: String,
        timestamp: Date,
        description: String,
        falsePositive: Boolean
      }],
      recurrence: {
        detected: Boolean,
        incidents: [String]
      }
    },
    
    closure: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      approvalDate: Date,
      closureNotes: String,
      outstandingItems: [String],
      archivalDate: Date,
      retentionPeriod: Number
    }
  },

  // ==================== Audit Trail ====================
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
    
    updates: [{
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      updatedAt: {
        type: Date,
        default: Date.now
      },
      updateType: {
        type: String,
        enum: ['STATUS_CHANGE', 'SEVERITY_CHANGE', 'ASSIGNMENT', 'ESCALATION', 
                'CONTAINMENT', 'RESOLUTION', 'CLOSURE', 'GENERAL_UPDATE']
      },
      previousValues: mongoose.Schema.Types.Mixed,
      newValues: mongoose.Schema.Types.Mixed,
      reason: String,
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
        enum: ['VIEW', 'EDIT', 'EXPORT', 'SHARE']
      },
      ipAddress: String,
      purpose: String
    }],
    
    statusHistory: [{
      status: String,
      changedFrom: String,
      changedTo: String,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      changedAt: Date,
      reason: String
    }]
  },

  // ==================== Lifecycle Management ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['NEW', 'TRIAGED', 'IN_PROGRESS', 'CONTAINED', 'ERADICATED', 
              'RECOVERED', 'POST_INCIDENT', 'CLOSED', 'ARCHIVED'],
      default: 'NEW',
      required: true,
      index: true
    },
    
    phase: {
      type: String,
      enum: ['DETECTION', 'ANALYSIS', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'POST_INCIDENT'],
      default: 'DETECTION'
    },
    
    workflow: {
      currentStep: String,
      completedSteps: [String],
      nextSteps: [String],
      blockers: [String]
    },
    
    sla: {
      responseTime: {
        target: Number,
        actual: Number,
        breached: Boolean
      },
      resolutionTime: {
        target: Number,
        actual: Number,
        breached: Boolean
      },
      escalationTime: {
        target: Number,
        actual: Number,
        breached: Boolean
      }
    },
    
    metrics: {
      mttr: Number, // Mean Time To Respond
      mttc: Number, // Mean Time To Contain
      mtte: Number, // Mean Time To Eradicate
      mttrec: Number, // Mean Time To Recover
      totalDuration: Number,
      touchPoints: Number,
      escalations: Number
    }
  }
}

const securityIncidentSchema = BaseModel.createSchema(securityIncidentSchemaDefinition, {
  collection: 'security_incidents',
  timestamps: true,
  strict: true,
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes for Performance ====================
securityIncidentSchema.index({ 'incidentMetadata.title': 1, 'lifecycle.status': 1 });
securityIncidentSchema.index({ 'incidentMetadata.category': 1, 'incidentMetadata.severity.level': 1 });
securityIncidentSchema.index({ 'incidentDetails.timeline.discoveredAt': -1 });
securityIncidentSchema.index({ 'lifecycle.status': 1, 'lifecycle.phase': 1 });
securityIncidentSchema.index({ 'incidentMetadata.priority.level': 1 });
securityIncidentSchema.index({ 'responseTeam.incidentCommander.user': 1 });
securityIncidentSchema.index({ createdAt: -1 });

// ==================== Model Registration ====================
const SecurityIncidentModels = mongoose.model('SecurityIncident', securityIncidentSchema);

module.exports = SecurityIncidentModels;