'use strict';

/**
 * @fileoverview Enterprise access control model for comprehensive authorization management
 * @module servers/admin-server/modules/security-administration/models/access-control-model
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
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const EncryptionService = require('../../../../../security/encryption/encryption-service');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const { ROLES } = require('../../../../../utils/constants/roles');
const { PERMISSIONS } = require('../../../../../utils/constants/permissions');

/**
 * @class AccessControlSchema
 * @description Comprehensive access control schema for enterprise authorization management
 * @extends mongoose.Schema
 */
const accessControlSchema = new mongoose.Schema({
  // ==================== Core Access Control Identification ====================
  accessControlId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `AC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for access control record'
  },

  accessControlMetadata: {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
      index: true,
      description: 'Human-readable access control name'
    },
    
    type: {
      type: String,
      required: true,
      enum: ['ROLE_BASED', 'ATTRIBUTE_BASED', 'POLICY_BASED', 'CONTEXT_AWARE', 
              'MANDATORY', 'DISCRETIONARY', 'RULE_BASED', 'DYNAMIC', 'HYBRID'],
      index: true,
      description: 'Access control model type'
    },
    
    subtype: {
      type: String,
      trim: true,
      description: 'Specific subtype within main type'
    },
    
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2000,
      description: 'Detailed access control description'
    },
    
    purpose: {
      type: String,
      required: true,
      description: 'Business purpose and objectives'
    },
    
    classification: {
      level: {
        type: String,
        enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET'],
        default: 'INTERNAL',
        required: true
      },
      category: {
        type: String,
        enum: ['DATA_ACCESS', 'SYSTEM_ACCESS', 'APPLICATION_ACCESS', 'API_ACCESS', 
                'ADMINISTRATIVE_ACCESS', 'PRIVILEGED_ACCESS', 'SERVICE_ACCESS'],
        required: true
      },
      sensitivity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'MEDIUM'
      }
    },
    
    tags: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    
    priority: {
      type: Number,
      min: 1,
      max: 100,
      default: 50,
      index: true
    }
  },

  // ==================== Subject Definition ====================
  subjects: {
    principals: [{
      principalId: {
        type: String,
        required: true,
        index: true
      },
      principalType: {
        type: String,
        enum: ['USER', 'SERVICE_ACCOUNT', 'APPLICATION', 'SYSTEM', 'GROUP', 'ROLE', 'EXTERNAL'],
        required: true
      },
      principalName: String,
      principalSource: {
        type: String,
        enum: ['INTERNAL', 'LDAP', 'ACTIVE_DIRECTORY', 'OAUTH', 'SAML', 'CUSTOM']
      },
      attributes: mongoose.Schema.Types.Mixed,
      metadata: {
        department: String,
        organization: String,
        location: String,
        clearanceLevel: String,
        trustLevel: {
          type: Number,
          min: 0,
          max: 10,
          default: 5
        }
      },
      conditions: [{
        conditionType: {
          type: String,
          enum: ['TIME_BASED', 'LOCATION_BASED', 'DEVICE_BASED', 'CONTEXT_BASED', 'ATTRIBUTE_BASED']
        },
        expression: mongoose.Schema.Types.Mixed,
        enforced: {
          type: Boolean,
          default: true
        }
      }],
      constraints: {
        maxSessions: Number,
        allowedIPs: [String],
        allowedDevices: [String],
        timeRestrictions: {
          startTime: String,
          endTime: String,
          timezone: String,
          daysOfWeek: [Number]
        },
        geographicalRestrictions: {
          allowedCountries: [String],
          blockedCountries: [String],
          allowedRegions: [String]
        }
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'],
        default: 'ACTIVE'
      },
      validFrom: Date,
      validUntil: Date
    }],
    
    groups: [{
      groupId: {
        type: String,
        required: true
      },
      groupName: String,
      groupType: {
        type: String,
        enum: ['SECURITY', 'DISTRIBUTION', 'DYNAMIC', 'NESTED', 'ORGANIZATIONAL']
      },
      members: [{
        memberId: String,
        memberType: String,
        joinedAt: Date,
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        }
      }],
      parentGroups: [String],
      childGroups: [String],
      groupAttributes: mongoose.Schema.Types.Mixed,
      dynamicMembership: {
        enabled: {
          type: Boolean,
          default: false
        },
        rules: mongoose.Schema.Types.Mixed,
        lastEvaluated: Date,
        evaluationFrequency: String
      }
    }],
    
    roles: [{
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: true
      },
      roleName: {
        type: String,
        required: true,
        index: true
      },
      roleType: {
        type: String,
        enum: ['SYSTEM', 'APPLICATION', 'BUSINESS', 'TECHNICAL', 'CUSTOM'],
        default: 'BUSINESS'
      },
      permissions: [{
        permissionId: String,
        permissionName: String,
        resource: String,
        actions: [String],
        conditions: mongoose.Schema.Types.Mixed
      }],
      inheritance: {
        inheritsFrom: [String],
        inheritedPermissions: [String],
        overriddenPermissions: [String]
      },
      assignments: [{
        assignedTo: String,
        assignedToType: {
          type: String,
          enum: ['USER', 'GROUP', 'SERVICE_ACCOUNT']
        },
        assignedAt: Date,
        assignedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        },
        validFrom: Date,
        validUntil: Date,
        conditions: mongoose.Schema.Types.Mixed
      }],
      constraints: {
        maxAssignments: Number,
        mutuallyExclusive: [String],
        requiredRoles: [String],
        segregationOfDuties: [{
          conflictingRole: String,
          riskLevel: String,
          mitigationRequired: Boolean
        }]
      }
    }]
  },

  // ==================== Resource Definition ====================
  resources: {
    protectedResources: [{
      resourceId: {
        type: String,
        required: true,
        index: true
      },
      resourceType: {
        type: String,
        enum: ['DATA', 'API', 'SERVICE', 'SYSTEM', 'APPLICATION', 'INFRASTRUCTURE', 
                'FUNCTION', 'FEATURE', 'DOCUMENT', 'DATABASE', 'NETWORK'],
        required: true
      },
      resourceName: {
        type: String,
        required: true
      },
      resourcePath: String,
      resourceUri: String,
      resourceOwner: {
        ownerId: String,
        ownerType: String,
        ownerName: String,
        department: String
      },
      classification: {
        dataClassification: {
          type: String,
          enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET']
        },
        privacyLevel: {
          type: String,
          enum: ['NON_SENSITIVE', 'SENSITIVE', 'HIGHLY_SENSITIVE', 'PII', 'PHI', 'PCI']
        },
        regulatoryScope: [String]
      },
      attributes: mongoose.Schema.Types.Mixed,
      metadata: {
        createdAt: Date,
        lastModified: Date,
        lastAccessed: Date,
        accessCount: {
          type: Number,
          default: 0
        },
        size: Number,
        version: String
      },
      accessRequirements: {
        authenticationLevel: {
          type: String,
          enum: ['NONE', 'BASIC', 'STRONG', 'MULTI_FACTOR', 'CERTIFICATE', 'BIOMETRIC']
        },
        encryptionRequired: {
          type: Boolean,
          default: false
        },
        auditingRequired: {
          type: Boolean,
          default: true
        },
        approvalRequired: {
          type: Boolean,
          default: false
        }
      },
      status: {
        type: String,
        enum: ['AVAILABLE', 'RESTRICTED', 'MAINTENANCE', 'DEPRECATED', 'ARCHIVED'],
        default: 'AVAILABLE'
      }
    }],
    
    resourceGroups: [{
      groupId: String,
      groupName: String,
      resources: [String],
      groupType: {
        type: String,
        enum: ['LOGICAL', 'PHYSICAL', 'FUNCTIONAL', 'ORGANIZATIONAL']
      },
      accessPolicy: mongoose.Schema.Types.Mixed,
      inheritance: {
        enabled: Boolean,
        parentGroup: String,
        inheritedPolicies: [String]
      }
    }],
    
    resourceHierarchy: {
      rootResources: [String],
      relationships: [{
        parent: String,
        children: [String],
        relationshipType: {
          type: String,
          enum: ['CONTAINS', 'DEPENDS_ON', 'RELATED_TO', 'PART_OF']
        }
      }],
      inheritanceRules: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Permission Management ====================
  permissions: {
    permissionSets: [{
      setId: {
        type: String,
        required: true,
        default: function() {
          return `PERM-SET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }
      },
      setName: {
        type: String,
        required: true
      },
      description: String,
      category: {
        type: String,
        enum: ['READ', 'WRITE', 'EXECUTE', 'DELETE', 'ADMIN', 'CUSTOM', 'MIXED']
      },
      permissions: [{
        permissionId: {
          type: String,
          required: true
        },
        action: {
          type: String,
          required: true
        },
        resource: String,
        scope: {
          type: String,
          enum: ['GLOBAL', 'REGIONAL', 'LOCAL', 'INSTANCE', 'CUSTOM']
        },
        conditions: mongoose.Schema.Types.Mixed,
        effect: {
          type: String,
          enum: ['ALLOW', 'DENY'],
          default: 'ALLOW'
        },
        priority: {
          type: Number,
          default: 50
        }
      }],
      assignments: [{
        assignedTo: String,
        assignedToType: String,
        assignedAt: Date,
        assignedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        }
      }],
      constraints: {
        timebound: {
          validFrom: Date,
          validUntil: Date
        },
        usageLimit: {
          maxUses: Number,
          currentUses: {
            type: Number,
            default: 0
          }
        },
        contextual: mongoose.Schema.Types.Mixed
      }
    }],
    
    delegatedPermissions: [{
      delegationId: String,
      delegator: {
        id: String,
        type: String,
        name: String
      },
      delegatee: {
        id: String,
        type: String,
        name: String
      },
      permissions: [String],
      scope: mongoose.Schema.Types.Mixed,
      constraints: {
        canRedelegate: {
          type: Boolean,
          default: false
        },
        maxDelegationDepth: {
          type: Number,
          default: 1
        },
        timebound: {
          validFrom: Date,
          validUntil: Date
        },
        revocable: {
          type: Boolean,
          default: true
        }
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'],
        default: 'ACTIVE'
      },
      delegatedAt: Date,
      revokedAt: Date,
      revocationReason: String
    }],
    
    dynamicPermissions: [{
      ruleId: String,
      ruleName: String,
      conditions: mongoose.Schema.Types.Mixed,
      grantedPermissions: [String],
      evaluationFrequency: String,
      lastEvaluated: Date,
      cache: {
        enabled: Boolean,
        ttl: Number,
        lastCached: Date
      }
    }]
  },

  // ==================== Access Policies ====================
  policies: {
    accessPolicies: [{
      policyId: {
        type: String,
        required: true,
        default: function() {
          return `POL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }
      },
      policyName: {
        type: String,
        required: true
      },
      policyType: {
        type: String,
        enum: ['GRANT', 'DENY', 'CONDITIONAL', 'EXCEPTION', 'OVERRIDE'],
        required: true
      },
      subject: {
        selector: mongoose.Schema.Types.Mixed,
        type: {
          type: String,
          enum: ['USER', 'GROUP', 'ROLE', 'ATTRIBUTE', 'EXPRESSION']
        }
      },
      resource: {
        selector: mongoose.Schema.Types.Mixed,
        type: {
          type: String,
          enum: ['SPECIFIC', 'PATTERN', 'GROUP', 'TAG', 'EXPRESSION']
        }
      },
      actions: [{
        action: String,
        allowed: Boolean,
        conditions: mongoose.Schema.Types.Mixed
      }],
      conditions: {
        environmental: {
          time: mongoose.Schema.Types.Mixed,
          location: mongoose.Schema.Types.Mixed,
          network: mongoose.Schema.Types.Mixed,
          device: mongoose.Schema.Types.Mixed
        },
        contextual: mongoose.Schema.Types.Mixed,
        custom: mongoose.Schema.Types.Mixed
      },
      effect: {
        type: String,
        enum: ['PERMIT', 'DENY', 'INDETERMINATE', 'NOT_APPLICABLE'],
        required: true
      },
      obligations: [{
        obligationType: {
          type: String,
          enum: ['LOG', 'NOTIFY', 'ENCRYPT', 'WATERMARK', 'APPROVE', 'CUSTOM']
        },
        parameters: mongoose.Schema.Types.Mixed,
        fulfillmentRequired: Boolean
      }],
      priority: {
        type: Number,
        min: 1,
        max: 1000,
        default: 500
      },
      conflictResolution: {
        strategy: {
          type: String,
          enum: ['DENY_OVERRIDES', 'PERMIT_OVERRIDES', 'FIRST_APPLICABLE', 'PRIORITY_BASED']
        }
      },
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    
    policyGroups: [{
      groupId: String,
      groupName: String,
      policies: [String],
      combiningAlgorithm: {
        type: String,
        enum: ['ALL_MUST_PERMIT', 'ANY_PERMIT', 'MAJORITY_PERMIT', 'WEIGHTED', 'CUSTOM']
      },
      priority: Number,
      enabled: Boolean
    }],
    
    policyTemplates: [{
      templateId: String,
      templateName: String,
      templateType: String,
      parameters: mongoose.Schema.Types.Mixed,
      defaultValues: mongoose.Schema.Types.Mixed,
      instances: [{
        instanceId: String,
        parameterValues: mongoose.Schema.Types.Mixed,
        createdAt: Date,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        }
      }]
    }]
  },

  // ==================== Access Rules Engine ====================
  rulesEngine: {
    evaluationMode: {
      type: String,
      enum: ['STRICT', 'PERMISSIVE', 'BALANCED', 'CUSTOM'],
      default: 'BALANCED'
    },
    
    rules: [{
      ruleId: {
        type: String,
        required: true
      },
      ruleName: String,
      ruleType: {
        type: String,
        enum: ['AUTHORIZATION', 'AUTHENTICATION', 'VALIDATION', 'TRANSFORMATION', 'ENRICHMENT']
      },
      priority: {
        type: Number,
        min: 1,
        max: 1000,
        default: 500
      },
      conditions: {
        if: mongoose.Schema.Types.Mixed,
        then: mongoose.Schema.Types.Mixed,
        else: mongoose.Schema.Types.Mixed
      },
      logic: {
        type: {
          type: String,
          enum: ['SIMPLE', 'COMPLEX', 'SCRIPT', 'EXPRESSION', 'MACHINE_LEARNING']
        },
        expression: String,
        script: String,
        model: mongoose.Schema.Types.Mixed
      },
      actions: [{
        actionType: String,
        parameters: mongoose.Schema.Types.Mixed,
        sideEffects: [String]
      }],
      metadata: {
        author: String,
        version: String,
        lastModified: Date,
        testCoverage: Number,
        performance: {
          avgExecutionTime: Number,
          maxExecutionTime: Number,
          evaluationCount: Number
        }
      },
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    
    ruleChains: [{
      chainId: String,
      chainName: String,
      rules: [String],
      executionOrder: {
        type: String,
        enum: ['SEQUENTIAL', 'PARALLEL', 'CONDITIONAL', 'PRIORITY_BASED']
      },
      breakOnFirst: Boolean,
      fallbackAction: mongoose.Schema.Types.Mixed
    }],
    
    decisionCache: {
      enabled: {
        type: Boolean,
        default: true
      },
      ttl: {
        type: Number,
        default: 3600
      },
      maxSize: {
        type: Number,
        default: 10000
      },
      evictionPolicy: {
        type: String,
        enum: ['LRU', 'LFU', 'FIFO', 'TTL'],
        default: 'LRU'
      }
    }
  },

  // ==================== Session Management ====================
  sessionManagement: {
    activeSessions: [{
      sessionId: {
        type: String,
        required: true,
        index: true
      },
      principalId: String,
      principalType: String,
      startTime: {
        type: Date,
        default: Date.now
      },
      lastActivity: Date,
      expiryTime: Date,
      sessionType: {
        type: String,
        enum: ['INTERACTIVE', 'API', 'SERVICE', 'BATCH', 'SYSTEM']
      },
      sessionContext: {
        ipAddress: String,
        userAgent: String,
        deviceId: String,
        location: {
          country: String,
          region: String,
          city: String,
          coordinates: {
            latitude: Number,
            longitude: Number
          }
        },
        authenticationMethod: String,
        authenticationStrength: {
          type: Number,
          min: 1,
          max: 10
        }
      },
      permissions: {
        granted: [String],
        denied: [String],
        temporary: [{
          permission: String,
          expiresAt: Date
        }]
      },
      attributes: mongoose.Schema.Types.Mixed,
      status: {
        type: String,
        enum: ['ACTIVE', 'IDLE', 'LOCKED', 'EXPIRED', 'TERMINATED'],
        default: 'ACTIVE'
      },
      terminationReason: String
    }],
    
    sessionPolicies: {
      maxConcurrentSessions: {
        type: Number,
        default: 5
      },
      sessionTimeout: {
        interactive: {
          type: Number,
          default: 3600000
        },
        api: {
          type: Number,
          default: 86400000
        },
        service: {
          type: Number,
          default: 0
        }
      },
      idleTimeout: {
        type: Number,
        default: 900000
      },
      reauthentication: {
        required: Boolean,
        frequency: Number,
        triggers: [String]
      },
      sessionBinding: {
        bindToIP: Boolean,
        bindToDevice: Boolean,
        bindToLocation: Boolean
      }
    },
    
    sessionHistory: [{
      sessionId: String,
      principalId: String,
      startTime: Date,
      endTime: Date,
      duration: Number,
      activityLog: [{
        timestamp: Date,
        action: String,
        resource: String,
        result: String
      }],
      terminationReason: String
    }]
  },

  // ==================== Audit and Compliance ====================
  auditCompliance: {
    accessLogs: [{
      logId: {
        type: String,
        default: function() {
          return `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }
      },
      timestamp: {
        type: Date,
        default: Date.now,
        index: true
      },
      principalId: String,
      principalType: String,
      resource: String,
      action: String,
      result: {
        type: String,
        enum: ['ALLOWED', 'DENIED', 'ERROR', 'TIMEOUT'],
        required: true
      },
      reason: String,
      policyApplied: String,
      context: {
        ipAddress: String,
        userAgent: String,
        sessionId: String,
        requestId: String,
        correlationId: String
      },
      metadata: mongoose.Schema.Types.Mixed,
      sensitive: {
        type: Boolean,
        default: false
      }
    }],
    
    complianceChecks: [{
      checkId: String,
      checkType: {
        type: String,
        enum: ['SCHEDULED', 'TRIGGERED', 'MANUAL', 'CONTINUOUS']
      },
      timestamp: Date,
      standard: {
        type: String,
        enum: ['SOC2', 'ISO27001', 'GDPR', 'HIPAA', 'PCI_DSS', 'NIST', 'CUSTOM']
      },
      scope: mongoose.Schema.Types.Mixed,
      results: {
        compliant: Boolean,
        score: Number,
        findings: [{
          finding: String,
          severity: String,
          recommendation: String
        }],
        evidence: [String]
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      nextCheck: Date
    }],
    
    accessReviews: [{
      reviewId: String,
      reviewType: {
        type: String,
        enum: ['PERIODIC', 'RISK_BASED', 'CERTIFICATION', 'RECERTIFICATION']
      },
      reviewDate: Date,
      scope: {
        subjects: [String],
        resources: [String],
        permissions: [String]
      },
      findings: [{
        type: {
          type: String,
          enum: ['EXCESSIVE_PRIVILEGE', 'ORPHANED_ACCOUNT', 'POLICY_VIOLATION', 
                  'SEGREGATION_CONFLICT', 'STALE_PERMISSION']
        },
        description: String,
        risk: String,
        remediation: String,
        status: {
          type: String,
          enum: ['IDENTIFIED', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED']
        }
      }],
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      nextReview: Date
    }],
    
    privilegedAccessManagement: {
      privilegedAccounts: [{
        accountId: String,
        accountType: {
          type: String,
          enum: ['ADMIN', 'SERVICE', 'EMERGENCY', 'SYSTEM', 'ROOT']
        },
        vault: {
          stored: Boolean,
          vaultId: String,
          lastRotated: Date,
          rotationFrequency: Number
        },
        checkInOut: {
          required: Boolean,
          currentHolder: String,
          checkedOutAt: Date,
          expiresAt: Date
        },
        monitoring: {
          realTime: Boolean,
          recording: Boolean,
          alerting: Boolean
        }
      }],
      justInTimeAccess: [{
        requestId: String,
        requester: String,
        resource: String,
        permissions: [String],
        justification: String,
        approvals: [{
          approver: String,
          approvedAt: Date,
          comments: String
        }],
        grantedAt: Date,
        expiresAt: Date,
        revokedAt: Date
      }]
    }
  },

  // ==================== Risk Assessment ====================
  riskAssessment: {
    accessRiskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    
    riskFactors: [{
      factorType: {
        type: String,
        enum: ['USER_BEHAVIOR', 'RESOURCE_SENSITIVITY', 'PERMISSION_LEVEL', 
                'CONTEXT', 'HISTORICAL', 'PREDICTIVE']
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      details: mongoose.Schema.Types.Mixed,
      lastCalculated: Date
    }],
    
    anomalies: [{
      anomalyId: String,
      detectedAt: Date,
      type: {
        type: String,
        enum: ['UNUSUAL_ACCESS', 'PRIVILEGE_ESCALATION', 'POLICY_BYPASS', 
                'ABNORMAL_PATTERN', 'SUSPICIOUS_ACTIVITY']
      },
      severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      },
      description: String,
      affectedSubject: String,
      affectedResource: String,
      evidence: mongoose.Schema.Types.Mixed,
      response: {
        action: String,
        takenAt: Date,
        takenBy: String,
        result: String
      },
      status: {
        type: String,
        enum: ['DETECTED', 'INVESTIGATING', 'CONFIRMED', 'RESOLVED', 'FALSE_POSITIVE'],
        default: 'DETECTED'
      }
    }],
    
    riskMitigation: [{
      mitigationId: String,
      riskType: String,
      strategy: {
        type: String,
        enum: ['PREVENT', 'DETECT', 'RESPOND', 'RECOVER']
      },
      controls: [String],
      effectiveness: {
        type: Number,
        min: 0,
        max: 100
      },
      implementationStatus: {
        type: String,
        enum: ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'VALIDATED']
      }
    }],
    
    threatIntelligence: {
      feeds: [{
        feedName: String,
        feedType: String,
        lastUpdated: Date,
        indicators: mongoose.Schema.Types.Mixed
      }],
      threats: [{
        threatId: String,
        threatType: String,
        severity: String,
        indicators: [String],
        mitigations: [String],
        status: String
      }]
    }
  },

  // ==================== Integration and Federation ====================
  integration: {
    identityProviders: [{
      providerId: String,
      providerName: String,
      providerType: {
        type: String,
        enum: ['LDAP', 'ACTIVE_DIRECTORY', 'OAUTH', 'SAML', 'OIDC', 'CUSTOM']
      },
      configuration: {
        endpoint: String,
        authentication: mongoose.Schema.Types.Mixed,
        mapping: mongoose.Schema.Types.Mixed,
        synchronization: {
          enabled: Boolean,
          frequency: String,
          lastSync: Date,
          nextSync: Date
        }
      },
      trustLevel: {
        type: Number,
        min: 0,
        max: 10
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE']
      }
    }],
    
    federatedAccess: [{
      federationId: String,
      partner: {
        organizationId: String,
        organizationName: String,
        trustLevel: Number
      },
      sharedResources: [String],
      accessMappings: mongoose.Schema.Types.Mixed,
      agreement: {
        startDate: Date,
        endDate: Date,
        terms: [String],
        restrictions: [String]
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'SUSPENDED', 'TERMINATED']
      }
    }],
    
    apiIntegrations: [{
      apiId: String,
      apiName: String,
      apiType: {
        type: String,
        enum: ['REST', 'GRAPHQL', 'SOAP', 'GRPC', 'CUSTOM']
      },
      authentication: {
        method: {
          type: String,
          enum: ['API_KEY', 'OAUTH', 'JWT', 'CERTIFICATE', 'CUSTOM']
        },
        credentials: mongoose.Schema.Types.Mixed
      },
      permissions: [String],
      rateLimits: {
        requestsPerSecond: Number,
        requestsPerMinute: Number,
        requestsPerHour: Number
      },
      usage: {
        lastAccessed: Date,
        totalRequests: Number,
        failedRequests: Number
      }
    }]
  },

  // ==================== Lifecycle Management ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'ARCHIVED'],
      default: 'DRAFT',
      required: true,
      index: true
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true
    },
    
    lastModified: {
      timestamp: Date,
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      changes: mongoose.Schema.Types.Mixed
    },
    
    activation: {
      activatedAt: Date,
      activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      deactivatedAt: Date,
      deactivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      reason: String
    },
    
    review: {
      lastReview: Date,
      nextReview: Date,
      reviewFrequency: {
        type: String,
        enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']
      },
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    },
    
    expiration: {
      expiresAt: Date,
      autoRenew: {
        type: Boolean,
        default: false
      },
      renewalPeriod: Number,
      notifications: [{
        notifyBefore: Number,
        notified: Boolean,
        notifiedAt: Date
      }]
    }
  }
}, {
  timestamps: true,
  collection: 'access_controls',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes for Performance ====================
accessControlSchema.index({ 'accessControlMetadata.name': 1, 'lifecycle.status': 1 });
accessControlSchema.index({ 'accessControlMetadata.type': 1, 'accessControlMetadata.classification.level': 1 });
accessControlSchema.index({ 'subjects.principals.principalId': 1 });
accessControlSchema.index({ 'resources.protectedResources.resourceId': 1 });
accessControlSchema.index({ 'sessionManagement.activeSessions.sessionId': 1 });
accessControlSchema.index({ 'auditCompliance.accessLogs.timestamp': -1 });
accessControlSchema.index({ 'lifecycle.status': 1, 'lifecycle.review.nextReview': 1 });
accessControlSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
accessControlSchema.virtual('isActive').get(function() {
  return this.lifecycle.status === 'ACTIVE' && 
         (!this.lifecycle.expiration.expiresAt || this.lifecycle.expiration.expiresAt > new Date());
});

accessControlSchema.virtual('totalPrincipals').get(function() {
  return this.subjects.principals.filter(p => p.status === 'ACTIVE').length;
});

accessControlSchema.virtual('totalResources').get(function() {
  return this.resources.protectedResources.filter(r => r.status === 'AVAILABLE').length;
});

accessControlSchema.virtual('complianceLevel').get(function() {
  const latestCheck = this.auditCompliance.complianceChecks
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  
  if (!latestCheck) return 'UNKNOWN';
  
  const score = latestCheck.results.score || 0;
  if (score >= 95) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'ACCEPTABLE';
  if (score >= 40) return 'NEEDS_IMPROVEMENT';
  return 'CRITICAL';
});

// ==================== Instance Methods ====================
accessControlSchema.methods.evaluateAccess = async function(request) {
  try {
    const result = {
      decision: 'DENY',
      reasons: [],
      appliedPolicies: [],
      obligations: [],
      timestamp: new Date()
    };

    const { principalId, resource, action, context } = request;

    // Find applicable principal
    const principal = this.subjects.principals.find(p => p.principalId === principalId);
    if (!principal) {
      result.reasons.push('Principal not found');
      return result;
    }

    if (principal.status !== 'ACTIVE') {
      result.reasons.push(`Principal status: ${principal.status}`);
      return result;
    }

    // Check time-based constraints
    if (!this.#checkTimeConstraints(principal.constraints)) {
      result.reasons.push('Time constraint violation');
      return result;
    }

    // Check location-based constraints
    if (!this.#checkLocationConstraints(principal.constraints, context)) {
      result.reasons.push('Location constraint violation');
      return result;
    }

    // Find applicable resource
    const protectedResource = this.resources.protectedResources.find(r => r.resourceId === resource);
    if (!protectedResource) {
      result.reasons.push('Resource not found');
      return result;
    }

    if (protectedResource.status !== 'AVAILABLE') {
      result.reasons.push(`Resource status: ${protectedResource.status}`);
      return result;
    }

    // Evaluate policies
    const applicablePolicies = this.#findApplicablePolicies(principalId, resource, action);
    
    for (const policy of applicablePolicies) {
      const policyResult = await this.#evaluatePolicy(policy, request);
      result.appliedPolicies.push({
        policyId: policy.policyId,
        policyName: policy.policyName,
        effect: policyResult.effect
      });

      if (policyResult.effect === 'PERMIT') {
        result.decision = 'ALLOW';
        result.reasons.push(`Permitted by policy: ${policy.policyName}`);
        
        // Add any obligations
        if (policy.obligations) {
          result.obligations.push(...policy.obligations);
        }
      } else if (policyResult.effect === 'DENY') {
        result.decision = 'DENY';
        result.reasons.push(`Denied by policy: ${policy.policyName}`);
        break; // Deny overrides
      }
    }

    // Log access attempt
    await this.#logAccess({
      principalId,
      resource,
      action,
      result: result.decision,
      reason: result.reasons.join('; '),
      context
    });

    return result;

  } catch (error) {
    logger.error('Error evaluating access:', error);
    throw error;
  }
};

// Private helper methods
accessControlSchema.methods.#checkTimeConstraints = function(constraints) {
  if (!constraints?.timeRestrictions) return true;
  
  const now = new Date();
  const currentTime = now.toTimeString().substr(0, 5);
  const dayOfWeek = now.getDay();
  
  const { startTime, endTime, daysOfWeek } = constraints.timeRestrictions;
  
  if (daysOfWeek && !daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  
  if (startTime && endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  }
  
  return true;
};

accessControlSchema.methods.#checkLocationConstraints = function(constraints, context) {
  if (!constraints?.geographicalRestrictions) return true;
  
  const { allowedCountries, blockedCountries } = constraints.geographicalRestrictions;
  const userCountry = context?.location?.country;
  
  if (!userCountry) return false;
  
  if (blockedCountries?.includes(userCountry)) {
    return false;
  }
  
  if (allowedCountries?.length > 0 && !allowedCountries.includes(userCountry)) {
    return false;
  }
  
  return true;
};

accessControlSchema.methods.#findApplicablePolicies = function(principalId, resource, action) {
  return this.policies.accessPolicies.filter(policy => {
    if (!policy.enabled) return false;
    
    // Check subject match
    const subjectMatch = this.#matchesSubject(policy.subject, principalId);
    if (!subjectMatch) return false;
    
    // Check resource match
    const resourceMatch = this.#matchesResource(policy.resource, resource);
    if (!resourceMatch) return false;
    
    // Check action match
    const actionMatch = policy.actions.some(a => a.action === action || a.action === '*');
    if (!actionMatch) return false;
    
    return true;
  }).sort((a, b) => b.priority - a.priority);
};

accessControlSchema.methods.#matchesSubject = function(subject, principalId) {
  if (subject.type === 'USER') {
    return subject.selector === principalId || subject.selector === '*';
  }
  
  if (subject.type === 'GROUP') {
    const group = this.subjects.groups.find(g => g.groupId === subject.selector);
    return group?.members.some(m => m.memberId === principalId);
  }
  
  if (subject.type === 'ROLE') {
    const role = this.subjects.roles.find(r => r.roleId.toString() === subject.selector);
    return role?.assignments.some(a => a.assignedTo === principalId);
  }
  
  return false;
};

accessControlSchema.methods.#matchesResource = function(resource, targetResource) {
  if (resource.type === 'SPECIFIC') {
    return resource.selector === targetResource || resource.selector === '*';
  }
  
  if (resource.type === 'PATTERN') {
    const pattern = new RegExp(resource.selector);
    return pattern.test(targetResource);
  }
  
  if (resource.type === 'GROUP') {
    const group = this.resources.resourceGroups.find(g => g.groupId === resource.selector);
    return group?.resources.includes(targetResource);
  }
  
  return false;
};

accessControlSchema.methods.#evaluatePolicy = async function(policy, request) {
  const result = {
    effect: 'NOT_APPLICABLE',
    obligations: []
  };

  try {
    // Evaluate conditions
    if (policy.conditions) {
      const conditionsMet = await this.#evaluateConditions(policy.conditions, request);
      if (!conditionsMet) {
        return result;
      }
    }

    // Find the specific action
    const actionPolicy = policy.actions.find(a => a.action === request.action || a.action === '*');
    
    if (actionPolicy) {
      if (actionPolicy.allowed) {
        result.effect = 'PERMIT';
      } else {
        result.effect = 'DENY';
      }
      
      // Add obligations
      if (policy.obligations) {
        result.obligations = policy.obligations;
      }
    }

    return result;

  } catch (error) {
    logger.error('Error evaluating policy:', error);
    result.effect = 'INDETERMINATE';
    return result;
  }
};

accessControlSchema.methods.#evaluateConditions = async function(conditions, request) {
  // Evaluate environmental conditions
  if (conditions.environmental) {
    if (conditions.environmental.time) {
      const timeConditionMet = this.#evaluateTimeCondition(conditions.environmental.time);
      if (!timeConditionMet) return false;
    }
    
    if (conditions.environmental.location) {
      const locationConditionMet = this.#evaluateLocationCondition(
        conditions.environmental.location, 
        request.context?.location
      );
      if (!locationConditionMet) return false;
    }
  }
  
  // Evaluate custom conditions
  if (conditions.custom) {
    // Custom condition evaluation logic
    return true;
  }
  
  return true;
};

accessControlSchema.methods.#evaluateTimeCondition = function(timeCondition) {
  const now = new Date();
  
  if (timeCondition.after && now < new Date(timeCondition.after)) {
    return false;
  }
  
  if (timeCondition.before && now > new Date(timeCondition.before)) {
    return false;
  }
  
  if (timeCondition.businessHours) {
    const hour = now.getHours();
    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
    const isBusinessHours = isWeekday && hour >= 9 && hour < 17;
    
    if (timeCondition.businessHours && !isBusinessHours) {
      return false;
    }
  }
  
  return true;
};

accessControlSchema.methods.#evaluateLocationCondition = function(locationCondition, userLocation) {
  if (!userLocation) return false;
  
  if (locationCondition.countries) {
    if (!locationCondition.countries.includes(userLocation.country)) {
      return false;
    }
  }
  
  if (locationCondition.regions) {
    if (!locationCondition.regions.includes(userLocation.region)) {
      return false;
    }
  }
  
  return true;
};

accessControlSchema.methods.#logAccess = async function(accessData) {
  this.auditCompliance.accessLogs.push({
    timestamp: new Date(),
    principalId: accessData.principalId,
    resource: accessData.resource,
    action: accessData.action,
    result: accessData.result,
    reason: accessData.reason,
    context: accessData.context
  });
  
  // Keep only last 10000 logs
  if (this.auditCompliance.accessLogs.length > 10000) {
    this.auditCompliance.accessLogs = this.auditCompliance.accessLogs.slice(-10000);
  }
  
  await this.save();
};

accessControlSchema.methods.grantPermission = async function(grantData) {
  try {
    const { principalId, permissions, grantedBy, validUntil, conditions } = grantData;
    
    // Find or create permission set
    let permissionSet = this.permissions.permissionSets.find(
      ps => ps.assignments.some(a => a.assignedTo === principalId)
    );
    
    if (!permissionSet) {
      permissionSet = {
        setId: `PERM-SET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        setName: `Permissions for ${principalId}`,
        description: `Dynamically granted permissions`,
        category: 'CUSTOM',
        permissions: [],
        assignments: [{
          assignedTo: principalId,
          assignedToType: 'USER',
          assignedAt: new Date(),
          assignedBy: grantedBy
        }],
        constraints: {
          timebound: validUntil ? { validUntil } : undefined,
          contextual: conditions
        }
      };
      
      this.permissions.permissionSets.push(permissionSet);
    }
    
    // Add permissions
    for (const permission of permissions) {
      permissionSet.permissions.push({
        permissionId: `PERM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        action: permission.action,
        resource: permission.resource,
        scope: permission.scope || 'LOCAL',
        conditions: permission.conditions,
        effect: 'ALLOW',
        priority: 50
      });
    }
    
    await this.save();
    
    logger.info(`Permissions granted to principal ${principalId}`);
    return permissionSet;
    
  } catch (error) {
    logger.error('Error granting permission:', error);
    throw error;
  }
};

accessControlSchema.methods.revokePermission = async function(revokeData) {
  try {
    const { principalId, permissions, revokedBy, reason } = revokeData;
    
    // Find permission set
    const permissionSet = this.permissions.permissionSets.find(
      ps => ps.assignments.some(a => a.assignedTo === principalId)
    );
    
    if (!permissionSet) {
      throw new AppError('Permission set not found', 404);
    }
    
    // Remove specific permissions or all
    if (permissions && permissions.length > 0) {
      permissionSet.permissions = permissionSet.permissions.filter(
        p => !permissions.some(rp => rp.action === p.action && rp.resource === p.resource)
      );
    } else {
      // Remove entire assignment
      const setIndex = this.permissions.permissionSets.indexOf(permissionSet);
      this.permissions.permissionSets.splice(setIndex, 1);
    }
    
    // Log the revocation
    this.auditCompliance.accessLogs.push({
      timestamp: new Date(),
      principalId,
      action: 'REVOKE_PERMISSION',
      result: 'ALLOWED',
      reason,
      context: { revokedBy: revokedBy.toString() }
    });
    
    await this.save();
    
    logger.info(`Permissions revoked from principal ${principalId}`);
    return this;
    
  } catch (error) {
    logger.error('Error revoking permission:', error);
    throw error;
  }
};

accessControlSchema.methods.createSession = async function(sessionData) {
  try {
    const session = {
      sessionId: `SESS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      principalId: sessionData.principalId,
      principalType: sessionData.principalType,
      startTime: new Date(),
      lastActivity: new Date(),
      expiryTime: new Date(Date.now() + (sessionData.ttl || 3600000)),
      sessionType: sessionData.sessionType || 'INTERACTIVE',
      sessionContext: sessionData.context,
      permissions: {
        granted: sessionData.permissions || [],
        denied: [],
        temporary: []
      },
      attributes: sessionData.attributes || {},
      status: 'ACTIVE'
    };
    
    // Check concurrent session limits
    const activeSessions = this.sessionManagement.activeSessions.filter(
      s => s.principalId === sessionData.principalId && s.status === 'ACTIVE'
    );
    
    if (activeSessions.length >= this.sessionManagement.sessionPolicies.maxConcurrentSessions) {
      // Terminate oldest session
      const oldestSession = activeSessions.sort((a, b) => a.startTime - b.startTime)[0];
      oldestSession.status = 'TERMINATED';
      oldestSession.terminationReason = 'Max concurrent sessions exceeded';
    }
    
    this.sessionManagement.activeSessions.push(session);
    
    await this.save();
    
    logger.info(`Session created: ${session.sessionId}`);
    return session;
    
  } catch (error) {
    logger.error('Error creating session:', error);
    throw error;
  }
};

accessControlSchema.methods.terminateSession = async function(sessionId, reason) {
  try {
    const session = this.sessionManagement.activeSessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      throw new AppError('Session not found', 404);
    }
    
    session.status = 'TERMINATED';
    session.terminationReason = reason;
    
    // Move to history
    this.sessionManagement.sessionHistory.push({
      sessionId: session.sessionId,
      principalId: session.principalId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: Date.now() - session.startTime.getTime(),
      terminationReason: reason
    });
    
    // Remove from active sessions
    const sessionIndex = this.sessionManagement.activeSessions.indexOf(session);
    this.sessionManagement.activeSessions.splice(sessionIndex, 1);
    
    await this.save();
    
    logger.info(`Session terminated: ${sessionId}`);
    return this;
    
  } catch (error) {
    logger.error('Error terminating session:', error);
    throw error;
  }
};

accessControlSchema.methods.performAccessReview = async function(reviewData) {
  try {
    const review = {
      reviewId: `REV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      reviewType: reviewData.type,
      reviewDate: new Date(),
      scope: reviewData.scope,
      findings: [],
      reviewer: reviewData.reviewer,
      nextReview: new Date(Date.now() + (reviewData.reviewFrequency || 90 * 24 * 60 * 60 * 1000))
    };
    
    // Perform review checks
    const principals = this.subjects.principals.filter(p => 
      !reviewData.scope.subjects || reviewData.scope.subjects.includes(p.principalId)
    );
    
    for (const principal of principals) {
      // Check for excessive privileges
      const permissions = this.#getPrincipalPermissions(principal.principalId);
      if (permissions.length > 20) {
        review.findings.push({
          type: 'EXCESSIVE_PRIVILEGE',
          description: `Principal ${principal.principalId} has ${permissions.length} permissions`,
          risk: 'HIGH',
          remediation: 'Review and reduce permissions',
          status: 'IDENTIFIED'
        });
      }
      
      // Check for stale permissions
      const lastActivity = this.#getLastActivity(principal.principalId);
      const daysSinceActivity = lastActivity ? 
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
      
      if (daysSinceActivity > 90) {
        review.findings.push({
          type: 'STALE_PERMISSION',
          description: `Principal ${principal.principalId} inactive for ${Math.floor(daysSinceActivity)} days`,
          risk: 'MEDIUM',
          remediation: 'Consider revoking access',
          status: 'IDENTIFIED'
        });
      }
    }
    
    this.auditCompliance.accessReviews.push(review);
    
    await this.save();
    
    logger.info(`Access review completed: ${review.reviewId}`);
    return review;
    
  } catch (error) {
    logger.error('Error performing access review:', error);
    throw error;
  }
};

accessControlSchema.methods.#getPrincipalPermissions = function(principalId) {
  const permissions = [];
  
  // Get direct permissions
  for (const permSet of this.permissions.permissionSets) {
    if (permSet.assignments.some(a => a.assignedTo === principalId)) {
      permissions.push(...permSet.permissions);
    }
  }
  
  // Get role-based permissions
  for (const role of this.subjects.roles) {
    if (role.assignments.some(a => a.assignedTo === principalId)) {
      permissions.push(...role.permissions);
    }
  }
  
  return permissions;
};

accessControlSchema.methods.#getLastActivity = function(principalId) {
  const logs = this.auditCompliance.accessLogs
    .filter(log => log.principalId === principalId)
    .sort((a, b) => b.timestamp - a.timestamp);
  
  return logs[0]?.timestamp;
};

// ==================== Static Methods ====================
accessControlSchema.statics.findByType = async function(type, options = {}) {
  const query = { 'accessControlMetadata.type': type };
  
  if (options.activeOnly) {
    query['lifecycle.status'] = 'ACTIVE';
  }
  
  return this.find(query);
};

accessControlSchema.statics.findActiveControls = async function() {
  return this.find({
    'lifecycle.status': 'ACTIVE',
    $or: [
      { 'lifecycle.expiration.expiresAt': null },
      { 'lifecycle.expiration.expiresAt': { $gt: new Date() } }
    ]
  });
};

accessControlSchema.statics.findControlsForReview = async function() {
  const now = new Date();
  return this.find({
    'lifecycle.status': 'ACTIVE',
    'lifecycle.review.nextReview': { $lte: now }
  });
};

accessControlSchema.statics.findHighRiskAccess = async function() {
  return this.find({
    'riskAssessment.accessRiskScore': { $gte: 70 }
  });
};

// ==================== Model Registration ====================
const AccessControl = mongoose.model('AccessControl', accessControlSchema);

module.exports = AccessControl;