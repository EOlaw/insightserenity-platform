'use strict';

/**
 * @fileoverview Enterprise tenant management model for multi-tenant platform administration
 * @module servers/admin-server/modules/organization-management/models/tenant-management-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * @class TenantManagementSchema
 * @description Comprehensive tenant lifecycle management schema for enterprise multi-tenant administration
 * @extends mongoose.Schema
 */
const tenantManagementSchema = new mongoose.Schema({
  // ==================== Core Tenant Identification ====================
  tenantManagementId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `TNT-MGT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
  },

  tenantReference: {
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
    tenantCode: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    externalTenantId: {
      type: String,
      sparse: true
    }
  },

  // ==================== Tenant Configuration ====================
  tenantConfiguration: {
    general: {
      tenantName: {
        type: String,
        required: true,
        trim: true
      },
      tenantType: {
        type: String,
        enum: ['PRIMARY', 'SUBSIDIARY', 'DEPARTMENT', 'PROJECT', 'SANDBOX', 'DEMO', 'TEST'],
        default: 'PRIMARY',
        required: true
      },
      tenantTier: {
        type: String,
        enum: ['PREMIUM', 'STANDARD', 'BASIC', 'TRIAL', 'FREE'],
        default: 'STANDARD'
      },
      description: String,
      businessUnit: String,
      costCenter: String,
      region: {
        type: String,
        required: true
      },
      timezone: {
        type: String,
        required: true
      },
      language: {
        type: String,
        default: 'en'
      },
      currency: {
        type: String,
        default: 'USD'
      }
    },

    isolation: {
      isolationLevel: {
        type: String,
        enum: ['SHARED', 'ISOLATED', 'DEDICATED', 'HYBRID'],
        default: 'SHARED',
        required: true
      },
      
      database: {
        strategy: {
          type: String,
          enum: ['SHARED_SCHEMA', 'SEPARATE_SCHEMA', 'SEPARATE_DATABASE', 'SEPARATE_CLUSTER'],
          default: 'SHARED_SCHEMA'
        },
        connectionString: String,
        databaseName: String,
        schemaName: String,
        poolSize: {
          type: Number,
          default: 10
        },
        encryptionEnabled: {
          type: Boolean,
          default: true
        }
      },
      
      storage: {
        strategy: {
          type: String,
          enum: ['SHARED_BUCKET', 'SEPARATE_BUCKET', 'SEPARATE_ACCOUNT'],
          default: 'SHARED_BUCKET'
        },
        bucketName: String,
        prefix: String,
        quota: {
          type: Number,
          default: 100
        },
        encryptionKey: String
      },
      
      compute: {
        strategy: {
          type: String,
          enum: ['SHARED_INSTANCE', 'DEDICATED_INSTANCE', 'CONTAINERIZED', 'SERVERLESS'],
          default: 'SHARED_INSTANCE'
        },
        instanceIds: [String],
        containerIds: [String],
        functionArns: [String],
        resourcePool: String
      },
      
      network: {
        strategy: {
          type: String,
          enum: ['SHARED_NETWORK', 'VLAN', 'VPC', 'PRIVATE_LINK'],
          default: 'SHARED_NETWORK'
        },
        vpcId: String,
        subnetIds: [String],
        securityGroups: [String],
        privateEndpoints: [String]
      }
    },

    resources: {
      allocated: {
        users: {
          max: {
            type: Number,
            default: 100
          },
          current: {
            type: Number,
            default: 0
          }
        },
        storage: {
          maxGB: {
            type: Number,
            default: 100
          },
          usedGB: {
            type: Number,
            default: 0
          }
        },
        compute: {
          vcpus: {
            type: Number,
            default: 2
          },
          memoryGB: {
            type: Number,
            default: 4
          }
        },
        bandwidth: {
          maxMbps: {
            type: Number,
            default: 100
          }
        },
        apiCalls: {
          monthlyLimit: {
            type: Number,
            default: 1000000
          },
          dailyLimit: {
            type: Number,
            default: 50000
          }
        }
      },
      
      scaling: {
        autoScaling: {
          enabled: {
            type: Boolean,
            default: false
          },
          minInstances: {
            type: Number,
            default: 1
          },
          maxInstances: {
            type: Number,
            default: 5
          },
          targetUtilization: {
            type: Number,
            default: 70
          },
          scaleUpThreshold: {
            type: Number,
            default: 80
          },
          scaleDownThreshold: {
            type: Number,
            default: 20
          },
          cooldownPeriod: {
            type: Number,
            default: 300
          }
        },
        
        burstCapacity: {
          enabled: {
            type: Boolean,
            default: true
          },
          maxBurstSize: Number,
          burstDuration: Number,
          burstCooldown: Number
        }
      },
      
      quotas: {
        enforced: {
          type: Boolean,
          default: true
        },
        quotaDefinitions: [{
          resourceType: String,
          limit: Number,
          period: {
            type: String,
            enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']
          },
          action: {
            type: String,
            enum: ['BLOCK', 'THROTTLE', 'ALERT', 'CHARGE']
          }
        }],
        overageHandling: {
          strategy: {
            type: String,
            enum: ['HARD_LIMIT', 'SOFT_LIMIT', 'PAY_AS_YOU_GO'],
            default: 'SOFT_LIMIT'
          },
          notificationThreshold: Number,
          autoIncreaseEnabled: Boolean
        }
      }
    },

    features: {
      modules: [{
        moduleId: String,
        moduleName: String,
        enabled: {
          type: Boolean,
          default: true
        },
        configuration: mongoose.Schema.Types.Mixed,
        permissions: [String],
        limitations: mongoose.Schema.Types.Mixed,
        customizations: mongoose.Schema.Types.Mixed
      }],
      
      capabilities: {
        apiAccess: {
          type: Boolean,
          default: true
        },
        webhooks: {
          type: Boolean,
          default: true
        },
        customIntegrations: {
          type: Boolean,
          default: false
        },
        advancedAnalytics: {
          type: Boolean,
          default: false
        },
        whiteLabeling: {
          type: Boolean,
          default: false
        },
        customDomain: {
          type: Boolean,
          default: false
        },
        ssoIntegration: {
          type: Boolean,
          default: false
        },
        apiRateLimiting: {
          type: Boolean,
          default: true
        }
      },
      
      integrations: [{
        integrationId: String,
        name: String,
        type: String,
        enabled: Boolean,
        configuration: mongoose.Schema.Types.Mixed,
        credentials: mongoose.Schema.Types.Mixed,
        webhookUrl: String,
        lastSync: Date,
        syncStatus: String
      }],
      
      customizations: {
        branding: {
          logoUrl: String,
          primaryColor: String,
          secondaryColor: String,
          customCss: String,
          emailTemplates: mongoose.Schema.Types.Mixed
        },
        
        workflows: [{
          workflowId: String,
          name: String,
          trigger: String,
          steps: [mongoose.Schema.Types.Mixed],
          enabled: Boolean
        }],
        
        rules: [{
          ruleId: String,
          name: String,
          condition: mongoose.Schema.Types.Mixed,
          action: mongoose.Schema.Types.Mixed,
          priority: Number,
          enabled: Boolean
        }]
      }
    }
  },

  // ==================== Lifecycle Management ====================
  lifecycleManagement: {
    currentPhase: {
      type: String,
      enum: ['PROVISIONING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONING', 'TERMINATED', 'ARCHIVED'],
      default: 'PROVISIONING',
      required: true,
      index: true
    },
    
    provisioning: {
      status: {
        type: String,
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK'],
        default: 'PENDING'
      },
      startedAt: Date,
      completedAt: Date,
      duration: Number,
      steps: [{
        stepName: String,
        status: String,
        startedAt: Date,
        completedAt: Date,
        error: String
      }],
      provisionedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      method: {
        type: String,
        enum: ['AUTOMATED', 'MANUAL', 'API', 'MIGRATION']
      }
    },
    
    activation: {
      activatedAt: Date,
      activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      trialStartDate: Date,
      trialEndDate: Date,
      trialExtended: Boolean,
      conversionDate: Date,
      conversionRate: Number
    },
    
    suspension: {
      isSuspended: {
        type: Boolean,
        default: false
      },
      suspendedAt: Date,
      suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      suspensionReason: String,
      suspensionType: {
        type: String,
        enum: ['BILLING', 'VIOLATION', 'MAINTENANCE', 'REQUESTED', 'SECURITY']
      },
      expectedResumption: Date,
      autoResume: Boolean
    },
    
    termination: {
      isTerminated: {
        type: Boolean,
        default: false
      },
      terminatedAt: Date,
      terminatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      terminationReason: String,
      dataRetentionDays: Number,
      dataExported: Boolean,
      finalBackup: String
    },
    
    migrations: [{
      migrationId: String,
      type: {
        type: String,
        enum: ['UPGRADE', 'DOWNGRADE', 'REGION_CHANGE', 'ISOLATION_CHANGE', 'MERGE', 'SPLIT']
      },
      fromConfiguration: mongoose.Schema.Types.Mixed,
      toConfiguration: mongoose.Schema.Types.Mixed,
      status: String,
      startedAt: Date,
      completedAt: Date,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }]
  },

  // ==================== Operations Management ====================
  operationsManagement: {
    maintenance: {
      maintenanceWindows: [{
        windowId: String,
        type: {
          type: String,
          enum: ['SCHEDULED', 'EMERGENCY', 'ROUTINE']
        },
        startTime: Date,
        endTime: Date,
        description: String,
        impact: String,
        notificationSent: Boolean
      }],
      
      lastMaintenance: Date,
      nextScheduledMaintenance: Date,
      maintenanceMode: {
        type: Boolean,
        default: false
      }
    },
    
    backup: {
      strategy: {
        type: String,
        enum: ['CONTINUOUS', 'SCHEDULED', 'ON_DEMAND', 'NONE'],
        default: 'SCHEDULED'
      },
      schedule: {
        frequency: String,
        time: String,
        retentionDays: Number
      },
      lastBackup: {
        timestamp: Date,
        size: Number,
        duration: Number,
        location: String,
        status: String
      },
      backupHistory: [{
        backupId: String,
        timestamp: Date,
        type: String,
        size: Number,
        location: String,
        status: String
      }]
    },
    
    monitoring: {
      healthChecks: {
        enabled: {
          type: Boolean,
          default: true
        },
        frequency: Number,
        endpoints: [String],
        lastCheck: Date,
        status: String
      },
      
      metrics: {
        availability: {
          current: Number,
          target: Number,
          slaCompliant: Boolean
        },
        performance: {
          responseTime: Number,
          throughput: Number,
          errorRate: Number
        },
        usage: {
          cpu: Number,
          memory: Number,
          storage: Number,
          bandwidth: Number
        }
      },
      
      alerts: [{
        alertId: String,
        type: String,
        severity: String,
        message: String,
        timestamp: Date,
        acknowledged: Boolean,
        resolvedAt: Date
      }]
    },
    
    incidents: [{
      incidentId: String,
      type: String,
      severity: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      },
      description: String,
      impact: String,
      startTime: Date,
      endTime: Date,
      resolution: String,
      rootCause: String,
      affectedServices: [String],
      reportedBy: String,
      assignedTo: String
    }]
  },

  // ==================== Data Management ====================
  dataManagement: {
    storage: {
      current: {
        databases: [{
          name: String,
          type: String,
          sizeGB: Number,
          recordCount: Number
        }],
        fileStorage: {
          sizeGB: Number,
          fileCount: Number,
          largestFile: String
        },
        cacheStorage: {
          sizeGB: Number,
          hitRate: Number
        }
      },
      
      growth: {
        dailyGrowthGB: Number,
        monthlyGrowthGB: Number,
        projectedCapacityDate: Date
      },
      
      optimization: {
        lastOptimized: Date,
        compressionRatio: Number,
        deduplicationRatio: Number,
        archivalPolicy: String
      }
    },
    
    migration: {
      importHistory: [{
        importId: String,
        source: String,
        recordsImported: Number,
        startTime: Date,
        endTime: Date,
        status: String,
        errors: Number
      }],
      
      exportHistory: [{
        exportId: String,
        destination: String,
        recordsExported: Number,
        format: String,
        timestamp: Date,
        status: String
      }],
      
      dataTransfers: [{
        transferId: String,
        type: String,
        source: String,
        destination: String,
        sizeGB: Number,
        status: String,
        startTime: Date,
        endTime: Date
      }]
    },
    
    quality: {
      validationRules: [{
        ruleId: String,
        name: String,
        type: String,
        condition: mongoose.Schema.Types.Mixed,
        action: String,
        enabled: Boolean
      }],
      
      qualityScore: {
        overall: Number,
        completeness: Number,
        accuracy: Number,
        consistency: Number,
        timeliness: Number
      },
      
      issues: [{
        issueId: String,
        type: String,
        severity: String,
        description: String,
        affectedRecords: Number,
        status: String
      }]
    }
  },

  // ==================== Security Configuration ====================
  securityConfiguration: {
    authentication: {
      methods: [{
        type: {
          type: String,
          enum: ['PASSWORD', 'SSO', 'LDAP', 'OAUTH', 'SAML', 'MFA']
        },
        enabled: Boolean,
        configuration: mongoose.Schema.Types.Mixed,
        priority: Number
      }],
      
      passwordPolicy: {
        minLength: Number,
        complexity: String,
        expirationDays: Number,
        historyCount: Number,
        lockoutAttempts: Number,
        lockoutDuration: Number
      },
      
      sessionManagement: {
        maxDuration: Number,
        idleTimeout: Number,
        concurrentSessions: Boolean,
        rememberMe: Boolean
      }
    },
    
    authorization: {
      model: {
        type: String,
        enum: ['RBAC', 'ABAC', 'ACL', 'HYBRID'],
        default: 'RBAC'
      },
      
      roles: [{
        roleId: String,
        roleName: String,
        permissions: [String],
        inheritFrom: String
      }],
      
      policies: [{
        policyId: String,
        name: String,
        rules: mongoose.Schema.Types.Mixed,
        priority: Number
      }]
    },
    
    encryption: {
      dataAtRest: {
        enabled: {
          type: Boolean,
          default: true
        },
        algorithm: String,
        keyRotation: Boolean,
        keyRotationDays: Number
      },
      
      dataInTransit: {
        enabled: {
          type: Boolean,
          default: true
        },
        tlsVersion: String,
        cipherSuites: [String]
      },
      
      keyManagement: {
        provider: String,
        keyIds: [String],
        lastRotation: Date
      }
    },
    
    compliance: {
      frameworks: [String],
      certifications: [{
        name: String,
        validUntil: Date,
        certificateUrl: String
      }],
      auditLogging: {
        enabled: Boolean,
        retentionDays: Number,
        logLevel: String
      }
    }
  },

  // ==================== Performance Metrics ====================
  performanceMetrics: {
    current: {
      responseTime: {
        p50: Number,
        p95: Number,
        p99: Number
      },
      throughput: {
        requestsPerSecond: Number,
        bytesPerSecond: Number
      },
      errors: {
        rate: Number,
        count: Number,
        types: mongoose.Schema.Types.Mixed
      },
      availability: {
        percentage: Number,
        downtime: Number
      }
    },
    
    historical: [{
      timestamp: Date,
      metrics: mongoose.Schema.Types.Mixed
    }],
    
    sla: {
      targets: {
        availability: Number,
        responseTime: Number,
        errorRate: Number
      },
      compliance: {
        currentMonth: Number,
        lastMonth: Number,
        ytd: Number
      },
      violations: [{
        metricType: String,
        timestamp: Date,
        duration: Number,
        impact: String
      }]
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
    modifications: [{
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      modifiedAt: Date,
      action: String,
      changes: mongoose.Schema.Types.Mixed,
      reason: String
    }],
    accessLog: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      accessTime: Date,
      action: String,
      resource: String,
      ipAddress: String
    }]
  }
}, {
  timestamps: true,
  collection: 'tenant_management',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
tenantManagementSchema.index({ 'tenantReference.organizationId': 1, 'lifecycleManagement.currentPhase': 1 });
tenantManagementSchema.index({ 'tenantConfiguration.general.tenantType': 1 });
tenantManagementSchema.index({ 'lifecycleManagement.currentPhase': 1 });
tenantManagementSchema.index({ createdAt: -1 });

// ==================== Virtual Properties ====================
tenantManagementSchema.virtual('isOperational').get(function() {
  return this.lifecycleManagement.currentPhase === 'ACTIVE' && 
         !this.lifecycleManagement.suspension.isSuspended;
});

tenantManagementSchema.virtual('resourceUtilization').get(function() {
  const resources = this.tenantConfiguration.resources.allocated;
  return {
    users: (resources.users.current / resources.users.max) * 100,
    storage: (resources.storage.usedGB / resources.storage.maxGB) * 100
  };
});

// ==================== Instance Methods ====================
tenantManagementSchema.methods.provisionTenant = async function(config) {
  try {
    this.lifecycleManagement.provisioning.status = 'IN_PROGRESS';
    this.lifecycleManagement.provisioning.startedAt = new Date();
    
    const steps = ['VALIDATE', 'ALLOCATE_RESOURCES', 'CONFIGURE_ISOLATION', 
                   'SETUP_DATABASE', 'CONFIGURE_FEATURES', 'INITIALIZE'];
    
    for (const step of steps) {
      this.lifecycleManagement.provisioning.steps.push({
        stepName: step,
        status: 'IN_PROGRESS',
        startedAt: new Date()
      });
    }
    
    await this.save();
    logger.info(`Tenant ${this.tenantReference.tenantCode} provisioning started`);
    return { success: true };
    
  } catch (error) {
    logger.error(`Failed to provision tenant:`, error);
    throw error;
  }
};

tenantManagementSchema.methods.suspendTenant = async function(reason, suspendedBy) {
  try {
    this.lifecycleManagement.currentPhase = 'SUSPENDED';
    this.lifecycleManagement.suspension = {
      isSuspended: true,
      suspendedAt: new Date(),
      suspendedBy,
      suspensionReason: reason,
      suspensionType: 'REQUESTED'
    };
    
    await this.save();
    logger.info(`Tenant ${this.tenantReference.tenantCode} suspended`);
    return { success: true };
    
  } catch (error) {
    logger.error(`Failed to suspend tenant:`, error);
    throw error;
  }
};

tenantManagementSchema.methods.updateResourceUsage = async function(usage) {
  try {
    const allocated = this.tenantConfiguration.resources.allocated;
    
    if (usage.users !== undefined) {
      allocated.users.current = usage.users;
    }
    if (usage.storage !== undefined) {
      allocated.storage.usedGB = usage.storage;
    }
    
    this.performanceMetrics.current = {
      ...this.performanceMetrics.current,
      ...usage.metrics
    };
    
    await this.save();
    return { success: true };
    
  } catch (error) {
    logger.error(`Failed to update resource usage:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================
tenantManagementSchema.statics.findActiveTenants = async function(organizationId) {
  return this.find({
    'tenantReference.organizationId': organizationId,
    'lifecycleManagement.currentPhase': 'ACTIVE'
  });
};

tenantManagementSchema.statics.findTenantsNearLimit = async function() {
  return this.find({
    $or: [
      { 'tenantConfiguration.resources.allocated.users.current': 
        { $gte: mongoose.connection.db.eval('this.tenantConfiguration.resources.allocated.users.max * 0.9') } },
      { 'tenantConfiguration.resources.allocated.storage.usedGB': 
        { $gte: mongoose.connection.db.eval('this.tenantConfiguration.resources.allocated.storage.maxGB * 0.9') } }
    ]
  });
};

// ==================== Model Export ====================
const TenantManagement = mongoose.model('TenantManagement', tenantManagementSchema);

module.exports = TenantManagement;