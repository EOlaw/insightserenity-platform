'use strict';

/**
 * @fileoverview Enterprise organization administration model for comprehensive multi-tenant platform management
 * @module servers/admin-server/modules/organization-management/models/organization-admin-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/roles
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

/**
 * @class OrganizationAdminSchema
 * @description Comprehensive organization administration schema for enterprise multi-tenant management
 * @extends mongoose.Schema
 */
const organizationAdminSchema = new mongoose.Schema({
  // ==================== Core Organization Identification ====================
  organizationAdminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `ORG-ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for organization administration record'
  },

  organizationRef: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to core organization entity'
    },
    externalId: {
      type: String,
      unique: true,
      sparse: true,
      description: 'External system identifier'
    },
    legacyId: {
      type: String,
      sparse: true,
      description: 'Legacy system migration identifier'
    }
  },

  // ==================== Organization Metadata ====================
  organizationMetadata: {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
      index: true,
      description: 'Organization display name'
    },
    
    legalName: {
      type: String,
      required: true,
      trim: true,
      description: 'Legal registered business name'
    },
    
    businessType: {
      type: String,
      enum: ['CORPORATION', 'LLC', 'PARTNERSHIP', 'SOLE_PROPRIETORSHIP', 'NON_PROFIT', 
              'GOVERNMENT', 'EDUCATIONAL', 'HEALTHCARE', 'ENTERPRISE', 'SMB', 'STARTUP'],
      required: true,
      index: true
    },
    
    industry: {
      primary: {
        type: String,
        enum: ['TECHNOLOGY', 'FINANCE', 'HEALTHCARE', 'RETAIL', 'MANUFACTURING', 
                'EDUCATION', 'GOVERNMENT', 'CONSULTING', 'REAL_ESTATE', 'HOSPITALITY',
                'TRANSPORTATION', 'ENERGY', 'TELECOMMUNICATIONS', 'MEDIA', 'OTHER'],
        required: true,
        index: true
      },
      secondary: [String],
      sicCode: String,
      naicsCode: String
    },
    
    size: {
      category: {
        type: String,
        enum: ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'],
        required: true,
        index: true
      },
      employeeCount: {
        min: Number,
        max: Number,
        lastUpdated: Date
      },
      annualRevenue: {
        amount: Number,
        currency: {
          type: String,
          default: 'USD'
        },
        fiscalYear: Number
      }
    },
    
    geography: {
      headquarters: {
        country: {
          type: String,
          required: true
        },
        state: String,
        city: String,
        timezone: {
          type: String,
          required: true
        }
      },
      operatingRegions: [{
        region: String,
        countries: [String],
        primaryLanguage: String,
        currencies: [String]
      }],
      dataResidency: [{
        region: String,
        requirement: {
          type: String,
          enum: ['REQUIRED', 'PREFERRED', 'NONE']
        },
        complianceFramework: String
      }]
    },
    
    branding: {
      logoUrl: String,
      primaryColor: String,
      secondaryColor: String,
      faviconUrl: String,
      customDomain: String,
      brandGuidelines: String
    },
    
    tags: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    
    classification: {
      tier: {
        type: String,
        enum: ['STRATEGIC', 'PREMIUM', 'STANDARD', 'BASIC', 'TRIAL'],
        default: 'STANDARD',
        index: true
      },
      segment: {
        type: String,
        enum: ['ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP', 'INDIVIDUAL']
      },
      priority: {
        type: Number,
        min: 1,
        max: 10,
        default: 5
      },
      accountType: {
        type: String,
        enum: ['DIRECT', 'CHANNEL', 'PARTNER', 'RESELLER', 'REFERRAL']
      }
    }
  },

  // ==================== Provisioning Configuration ====================
  provisioningConfig: {
    status: {
      type: String,
      enum: ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONING', 'TERMINATED'],
      default: 'PENDING',
      required: true,
      index: true
    },
    
    provisioningDetails: {
      requestedAt: {
        type: Date,
        default: Date.now
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      provisionedAt: Date,
      provisionedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      method: {
        type: String,
        enum: ['AUTOMATED', 'MANUAL', 'HYBRID', 'IMPORTED'],
        default: 'AUTOMATED'
      },
      source: {
        type: String,
        enum: ['SELF_SERVICE', 'SALES', 'PARTNER', 'MIGRATION', 'ADMIN']
      }
    },
    
    resourceAllocation: {
      compute: {
        vcpuCount: {
          type: Number,
          default: 2
        },
        memoryGB: {
          type: Number,
          default: 4
        },
        storageGB: {
          type: Number,
          default: 100
        },
        bandwidthMbps: {
          type: Number,
          default: 100
        }
      },
      
      limits: {
        maxUsers: {
          type: Number,
          default: 50
        },
        maxProjects: {
          type: Number,
          default: 10
        },
        maxApiCalls: {
          type: Number,
          default: 100000
        },
        maxStorage: {
          type: Number,
          default: 500
        },
        maxBandwidth: {
          type: Number,
          default: 1000
        }
      },
      
      quotas: {
        monthly: {
          apiCalls: Number,
          storageGB: Number,
          bandwidthGB: Number,
          computeHours: Number
        },
        daily: {
          apiCalls: Number,
          emailsSent: Number,
          reportGeneration: Number
        }
      },
      
      scaling: {
        autoScalingEnabled: {
          type: Boolean,
          default: false
        },
        scaleUpThreshold: {
          type: Number,
          default: 80
        },
        scaleDownThreshold: {
          type: Number,
          default: 20
        },
        maxInstances: {
          type: Number,
          default: 10
        },
        minInstances: {
          type: Number,
          default: 1
        }
      }
    },
    
    infrastructure: {
      deploymentType: {
        type: String,
        enum: ['SHARED', 'DEDICATED', 'ISOLATED', 'HYBRID', 'ON_PREMISE'],
        default: 'SHARED'
      },
      
      environment: {
        type: String,
        enum: ['PRODUCTION', 'STAGING', 'DEVELOPMENT', 'QA', 'DEMO'],
        default: 'PRODUCTION'
      },
      
      region: {
        primary: {
          type: String,
          required: true
        },
        secondary: String,
        disaster_recovery: String
      },
      
      networking: {
        vpcId: String,
        subnetIds: [String],
        securityGroupIds: [String],
        privateIpRange: String,
        publicIpAddresses: [String],
        customDnsRecords: [{
          type: String,
          name: String,
          value: String,
          ttl: Number
        }]
      },
      
      storage: {
        databaseType: {
          type: String,
          enum: ['MONGODB', 'POSTGRESQL', 'MYSQL', 'DYNAMODB', 'CUSTOM'],
          default: 'MONGODB'
        },
        databaseCluster: String,
        databaseName: String,
        fileStorageBucket: String,
        backupLocation: String,
        archiveLocation: String
      }
    },
    
    features: {
      enabledModules: [{
        moduleId: String,
        moduleName: String,
        enabled: {
          type: Boolean,
          default: true
        },
        configuration: mongoose.Schema.Types.Mixed,
        limitations: mongoose.Schema.Types.Mixed
      }],
      
      customFeatures: [{
        featureId: String,
        featureName: String,
        enabled: Boolean,
        configuration: mongoose.Schema.Types.Mixed,
        validUntil: Date
      }],
      
      integrations: [{
        integrationId: String,
        integrationType: String,
        provider: String,
        enabled: Boolean,
        configuration: mongoose.Schema.Types.Mixed,
        credentials: mongoose.Schema.Types.Mixed,
        lastSync: Date
      }],
      
      featureFlags: [{
        flagName: String,
        enabled: Boolean,
        rolloutPercentage: Number,
        targetGroups: [String]
      }]
    }
  },

  // ==================== Tenant Management ====================
  tenantManagement: {
    tenants: [{
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant'
      },
      tenantCode: {
        type: String,
        unique: true,
        sparse: true
      },
      tenantName: String,
      tenantType: {
        type: String,
        enum: ['PRIMARY', 'SUBSIDIARY', 'DEPARTMENT', 'PROJECT', 'TEST']
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_DELETION']
      },
      createdAt: Date,
      activatedAt: Date,
      lastAccessedAt: Date,
      configuration: mongoose.Schema.Types.Mixed,
      resourceUsage: {
        users: Number,
        storage: Number,
        apiCalls: Number,
        lastUpdated: Date
      }
    }],
    
    tenantConfiguration: {
      multiTenantMode: {
        type: String,
        enum: ['SINGLE', 'MULTI_SHARED', 'MULTI_ISOLATED', 'HYBRID'],
        default: 'SINGLE'
      },
      
      tenantIsolation: {
        databaseLevel: {
          type: String,
          enum: ['SHARED_SCHEMA', 'SEPARATE_SCHEMA', 'SEPARATE_DATABASE'],
          default: 'SHARED_SCHEMA'
        },
        applicationLevel: {
          type: String,
          enum: ['SHARED_INSTANCE', 'SEPARATE_INSTANCE', 'CONTAINERIZED'],
          default: 'SHARED_INSTANCE'
        },
        networkLevel: {
          type: String,
          enum: ['SHARED_NETWORK', 'VLAN_SEGREGATED', 'VPC_ISOLATED'],
          default: 'SHARED_NETWORK'
        }
      },
      
      tenantLimits: {
        maxTenants: {
          type: Number,
          default: 1
        },
        maxUsersPerTenant: {
          type: Number,
          default: 100
        },
        maxStoragePerTenant: {
          type: Number,
          default: 100
        },
        maxProjectsPerTenant: {
          type: Number,
          default: 10
        }
      },
      
      tenantDefaults: {
        defaultRole: String,
        defaultPermissions: [String],
        defaultModules: [String],
        defaultConfiguration: mongoose.Schema.Types.Mixed
      }
    },
    
    tenantOperations: [{
      operationId: String,
      operationType: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'SUSPEND', 'ACTIVATE', 'DELETE', 'MIGRATE', 'BACKUP', 'RESTORE']
      },
      tenantId: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      performedAt: Date,
      status: {
        type: String,
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK']
      },
      details: mongoose.Schema.Types.Mixed,
      errorDetails: String
    }]
  },

  // ==================== Member Administration ====================
  memberAdministration: {
    organizationRoles: [{
      roleId: String,
      roleName: {
        type: String,
        required: true
      },
      roleType: {
        type: String,
        enum: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST', 'CUSTOM'],
        required: true
      },
      permissions: [{
        resource: String,
        actions: [String],
        conditions: mongoose.Schema.Types.Mixed
      }],
      inheritsFrom: String,
      priority: Number,
      isSystem: {
        type: Boolean,
        default: false
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    
    memberManagement: {
      totalMembers: {
        type: Number,
        default: 0
      },
      activeMembers: {
        type: Number,
        default: 0
      },
      pendingInvitations: {
        type: Number,
        default: 0
      },
      
      memberTracking: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        email: String,
        role: String,
        status: {
          type: String,
          enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'INVITED']
        },
        joinedAt: Date,
        lastActiveAt: Date,
        invitedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        department: String,
        title: String,
        accessLevel: String
      }],
      
      invitations: [{
        invitationId: String,
        email: {
          type: String,
          required: true
        },
        role: String,
        invitedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        invitedAt: Date,
        expiresAt: Date,
        status: {
          type: String,
          enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED']
        },
        token: String,
        metadata: mongoose.Schema.Types.Mixed
      }],
      
      accessControls: {
        ssoEnabled: {
          type: Boolean,
          default: false
        },
        ssoProvider: String,
        mfaRequired: {
          type: Boolean,
          default: false
        },
        ipWhitelist: [String],
        ipBlacklist: [String],
        passwordPolicy: {
          minLength: Number,
          requireUppercase: Boolean,
          requireLowercase: Boolean,
          requireNumbers: Boolean,
          requireSpecialChars: Boolean,
          expirationDays: Number,
          preventReuse: Number
        },
        sessionPolicy: {
          maxSessionDuration: Number,
          idleTimeout: Number,
          concurrentSessions: Boolean,
          rememberMeDuration: Number
        }
      }
    },
    
    teamStructure: {
      departments: [{
        departmentId: String,
        departmentName: String,
        parentDepartment: String,
        manager: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        memberCount: Number,
        budget: Number,
        costCenter: String
      }],
      
      teams: [{
        teamId: String,
        teamName: String,
        departmentId: String,
        teamLead: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        members: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }],
        projects: [String],
        responsibilities: [String]
      }],
      
      reportingStructure: [{
        employeeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        managerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        reportingType: {
          type: String,
          enum: ['DIRECT', 'DOTTED', 'MATRIX']
        },
        effectiveDate: Date
      }]
    }
  },

  // ==================== Resource Monitoring ====================
  resourceMonitoring: {
    usage: {
      current: {
        users: {
          active: Number,
          total: Number,
          percentage: Number
        },
        storage: {
          used: Number,
          allocated: Number,
          percentage: Number,
          unit: {
            type: String,
            default: 'GB'
          }
        },
        compute: {
          cpuUsage: Number,
          memoryUsage: Number,
          networkUsage: Number
        },
        api: {
          callsToday: Number,
          callsThisMonth: Number,
          averageLatency: Number,
          errorRate: Number
        }
      },
      
      historical: [{
        timestamp: Date,
        metrics: {
          users: Number,
          storage: Number,
          apiCalls: Number,
          bandwidth: Number,
          compute: Number
        },
        cost: Number
      }],
      
      projections: {
        nextMonth: {
          estimatedUsage: mongoose.Schema.Types.Mixed,
          estimatedCost: Number,
          recommendations: [String]
        },
        capacity: {
          usersCapacity: Number,
          storageCapacity: Number,
          apiCapacity: Number,
          daysUntilLimit: Number
        }
      }
    },
    
    performance: {
      sla: {
        target: {
          uptime: {
            type: Number,
            default: 99.9
          },
          responseTime: {
            type: Number,
            default: 200
          },
          errorRate: {
            type: Number,
            default: 0.1
          }
        },
        current: {
          uptime: Number,
          responseTime: Number,
          errorRate: Number,
          lastUpdated: Date
        },
        violations: [{
          metricType: String,
          violationTime: Date,
          duration: Number,
          severity: String,
          impact: String
        }]
      },
      
      healthScore: {
        overall: {
          type: Number,
          min: 0,
          max: 100
        },
        components: {
          api: Number,
          database: Number,
          storage: Number,
          network: Number
        },
        trend: {
          type: String,
          enum: ['IMPROVING', 'STABLE', 'DEGRADING']
        }
      },
      
      incidents: [{
        incidentId: String,
        type: String,
        severity: String,
        startTime: Date,
        endTime: Date,
        duration: Number,
        impact: String,
        resolution: String
      }]
    },
    
    optimization: {
      recommendations: [{
        recommendationId: String,
        type: {
          type: String,
          enum: ['COST', 'PERFORMANCE', 'SECURITY', 'CAPACITY', 'EFFICIENCY']
        },
        priority: {
          type: String,
          enum: ['HIGH', 'MEDIUM', 'LOW']
        },
        description: String,
        estimatedSavings: Number,
        estimatedImprovement: Number,
        implementationEffort: String,
        status: {
          type: String,
          enum: ['PENDING', 'REVIEWING', 'APPROVED', 'IMPLEMENTING', 'COMPLETED', 'REJECTED']
        }
      }],
      
      automations: [{
        automationId: String,
        name: String,
        type: String,
        trigger: mongoose.Schema.Types.Mixed,
        actions: [mongoose.Schema.Types.Mixed],
        enabled: Boolean,
        lastRun: Date,
        runCount: Number,
        successRate: Number
      }],
      
      costOptimization: {
        currentMonthlyCost: Number,
        projectedMonthlyCost: Number,
        potentialSavings: Number,
        unusedResources: [{
          resourceType: String,
          resourceId: String,
          cost: Number,
          lastUsed: Date
        }],
        rightsizingOpportunities: [{
          currentSize: String,
          recommendedSize: String,
          monthlySavings: Number,
          resource: String
        }]
      }
    }
  },

  // ==================== Analytics Configuration ====================
  analyticsConfig: {
    tracking: {
      enabled: {
        type: Boolean,
        default: true
      },
      level: {
        type: String,
        enum: ['BASIC', 'STANDARD', 'ADVANCED', 'CUSTOM'],
        default: 'STANDARD'
      },
      retentionDays: {
        type: Number,
        default: 90
      }
    },
    
    kpis: [{
      kpiId: String,
      name: String,
      category: String,
      calculation: String,
      target: Number,
      current: Number,
      trend: String,
      frequency: String,
      owner: String
    }],
    
    dashboards: [{
      dashboardId: String,
      name: String,
      type: String,
      widgets: [{
        widgetId: String,
        type: String,
        dataSource: String,
        configuration: mongoose.Schema.Types.Mixed
      }],
      refreshInterval: Number,
      visibility: String
    }],
    
    reports: [{
      reportId: String,
      name: String,
      type: String,
      schedule: {
        frequency: String,
        dayOfWeek: Number,
        dayOfMonth: Number,
        time: String
      },
      recipients: [String],
      format: String,
      includeData: [String]
    }],
    
    customMetrics: [{
      metricId: String,
      name: String,
      formula: String,
      aggregation: String,
      dimensions: [String],
      filters: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Compliance and Governance ====================
  compliance: {
    frameworks: [{
      framework: {
        type: String,
        enum: ['SOC2', 'ISO27001', 'GDPR', 'HIPAA', 'PCI_DSS', 'CCPA', 'FedRAMP', 'CUSTOM']
      },
      status: {
        type: String,
        enum: ['NOT_APPLICABLE', 'IN_PROGRESS', 'COMPLIANT', 'NON_COMPLIANT', 'CERTIFIED']
      },
      certificationDate: Date,
      expirationDate: Date,
      auditDate: Date,
      auditor: String,
      findings: [mongoose.Schema.Types.Mixed]
    }],
    
    dataGovernance: {
      dataClassification: {
        public: Boolean,
        internal: Boolean,
        confidential: Boolean,
        restricted: Boolean
      },
      dataRetention: {
        policy: String,
        retentionPeriod: Number,
        deletionSchedule: String
      },
      dataPrivacy: {
        privacyOfficer: String,
        privacyPolicy: String,
        consentManagement: Boolean,
        dataSubjectRequests: [{
          requestId: String,
          type: String,
          status: String,
          requestDate: Date,
          completionDate: Date
        }]
      }
    },
    
    auditLog: {
      retentionDays: {
        type: Number,
        default: 365
      },
      logLevel: {
        type: String,
        enum: ['MINIMAL', 'STANDARD', 'DETAILED', 'VERBOSE'],
        default: 'STANDARD'
      },
      exportSchedule: String,
      archiveLocation: String
    }
  },

  // ==================== Lifecycle Management ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CHURNED', 'ARCHIVED'],
      default: 'PROSPECT',
      required: true,
      index: true
    },
    
    timeline: {
      prospectDate: Date,
      trialStartDate: Date,
      trialEndDate: Date,
      activationDate: Date,
      lastRenewalDate: Date,
      nextRenewalDate: Date,
      suspensionDate: Date,
      churnDate: Date,
      archivalDate: Date
    },
    
    health: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      indicators: {
        usage: Number,
        engagement: Number,
        satisfaction: Number,
        payment: Number,
        support: Number
      },
      riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      },
      churnRisk: {
        score: Number,
        factors: [String],
        mitigationActions: [String]
      }
    },
    
    transitions: [{
      fromStatus: String,
      toStatus: String,
      transitionDate: Date,
      transitionedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      reason: String,
      notes: String
    }]
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
        enum: ['UPDATE', 'PROVISION', 'DEPROVISION', 'SUSPEND', 'ACTIVATE', 'CONFIGURE', 'MIGRATE']
      },
      changes: mongoose.Schema.Types.Mixed,
      reason: String
    }],
    lastActivity: {
      timestamp: Date,
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      ipAddress: String,
      userAgent: String
    }
  }
}, {
  timestamps: true,
  collection: 'organization_admin',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
organizationAdminSchema.index({ 'organizationMetadata.displayName': 1, 'lifecycle.status': 1 });
organizationAdminSchema.index({ 'organizationMetadata.businessType': 1, 'organizationMetadata.industry.primary': 1 });
organizationAdminSchema.index({ 'provisioningConfig.status': 1 });
organizationAdminSchema.index({ 'lifecycle.status': 1, 'lifecycle.health.riskLevel': 1 });
organizationAdminSchema.index({ 'tenantManagement.tenants.tenantCode': 1 });
organizationAdminSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
organizationAdminSchema.virtual('isActive').get(function() {
  return this.lifecycle.status === 'ACTIVE' && this.provisioningConfig.status === 'ACTIVE';
});

organizationAdminSchema.virtual('resourceUtilization').get(function() {
  const usage = this.resourceMonitoring.usage.current;
  return {
    users: usage.users.percentage || 0,
    storage: usage.storage.percentage || 0,
    overall: ((usage.users.percentage || 0) + (usage.storage.percentage || 0)) / 2
  };
});

// ==================== Instance Methods ====================
organizationAdminSchema.methods.provisionOrganization = async function(config, provisionedBy) {
  try {
    this.provisioningConfig.status = 'PROVISIONING';
    this.provisioningConfig.provisioningDetails.provisionedAt = new Date();
    this.provisioningConfig.provisioningDetails.provisionedBy = provisionedBy;
    
    if (config.resources) {
      Object.assign(this.provisioningConfig.resourceAllocation, config.resources);
    }
    
    if (config.features) {
      this.provisioningConfig.features.enabledModules = config.features.modules || [];
    }
    
    await this.save();
    
    logger.info(`Organization ${this.organizationAdminId} provisioned successfully`);
    return { success: true, organization: this };
    
  } catch (error) {
    logger.error(`Failed to provision organization ${this.organizationAdminId}:`, error);
    throw error;
  }
};

organizationAdminSchema.methods.addTenant = async function(tenantData) {
  try {
    const tenant = {
      tenantId: tenantData.tenantId,
      tenantCode: tenantData.tenantCode || `TNT-${Date.now()}`,
      tenantName: tenantData.tenantName,
      tenantType: tenantData.tenantType || 'PRIMARY',
      status: 'ACTIVE',
      createdAt: new Date(),
      activatedAt: new Date(),
      configuration: tenantData.configuration || {}
    };
    
    this.tenantManagement.tenants.push(tenant);
    await this.save();
    
    return tenant;
    
  } catch (error) {
    logger.error(`Failed to add tenant:`, error);
    throw error;
  }
};

organizationAdminSchema.methods.updateResourceUsage = async function(metrics) {
  try {
    const current = this.resourceMonitoring.usage.current;
    
    if (metrics.users !== undefined) {
      current.users.active = metrics.users;
      current.users.percentage = (metrics.users / this.provisioningConfig.resourceAllocation.limits.maxUsers) * 100;
    }
    
    if (metrics.storage !== undefined) {
      current.storage.used = metrics.storage;
      current.storage.percentage = (metrics.storage / current.storage.allocated) * 100;
    }
    
    if (metrics.apiCalls !== undefined) {
      current.api.callsToday = metrics.apiCalls;
    }
    
    this.resourceMonitoring.usage.historical.push({
      timestamp: new Date(),
      metrics: {
        users: current.users.active,
        storage: current.storage.used,
        apiCalls: current.api.callsToday
      }
    });
    
    await this.save();
    return current;
    
  } catch (error) {
    logger.error(`Failed to update resource usage:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================
organizationAdminSchema.statics.findActiveOrganizations = async function(filters = {}) {
  const query = {
    'lifecycle.status': 'ACTIVE',
    'provisioningConfig.status': 'ACTIVE'
  };
  
  if (filters.businessType) {
    query['organizationMetadata.businessType'] = filters.businessType;
  }
  
  if (filters.tier) {
    query['organizationMetadata.classification.tier'] = filters.tier;
  }
  
  return this.find(query).sort({ 'organizationMetadata.classification.priority': -1 });
};

organizationAdminSchema.statics.findOrganizationsAtRisk = async function() {
  return this.find({
    'lifecycle.status': 'ACTIVE',
    'lifecycle.health.riskLevel': { $in: ['HIGH', 'CRITICAL'] }
  }).sort({ 'lifecycle.health.churnRisk.score': -1 });
};

// ==================== Model Export ====================
const OrganizationAdmin = mongoose.model('OrganizationAdmin', organizationAdminSchema);

module.exports = OrganizationAdmin;