'use strict';

/**
 * @fileoverview Tenant model for multi-tenant data isolation and management
 * @module shared/lib/database/models/organizations/tenant-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * Tenant schema definition for multi-tenant architecture
 */
const tenantSchemaDefinition = {
  // ==================== Core Tenant Information ====================
  tenantId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    match: /^[a-zA-Z0-9_-]+$/
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  displayName: {
    type: String,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000
  },

  // ==================== Tenant Configuration ====================
  configuration: {
    isolationLevel: {
      type: String,
      enum: ['shared', 'logical', 'physical', 'hybrid'],
      default: 'logical',
      required: true
    },
    databaseStrategy: {
      type: String,
      enum: ['shared_database', 'database_per_tenant', 'schema_per_tenant', 'hybrid'],
      default: 'shared_database'
    },
    storageStrategy: {
      type: String,
      enum: ['shared_storage', 'folder_per_tenant', 'bucket_per_tenant', 'volume_per_tenant'],
      default: 'folder_per_tenant'
    },
    computeStrategy: {
      type: String,
      enum: ['shared_compute', 'dedicated_instances', 'serverless', 'kubernetes_namespace'],
      default: 'shared_compute'
    },
    cacheStrategy: {
      type: String,
      enum: ['shared_cache', 'isolated_cache', 'dedicated_cache'],
      default: 'isolated_cache'
    }
  },

  // ==================== Database Configuration ====================
  database: {
    connectionString: {
      type: String,
      select: false
    },
    databaseName: String,
    schemaName: String,
    tablePrefix: String,
    poolSize: {
      min: { type: Number, default: 2 },
      max: { type: Number, default: 10 }
    },
    options: {
      ssl: { type: Boolean, default: true },
      replicaSet: String,
      authSource: String,
      retryWrites: { type: Boolean, default: true }
    },
    migrations: [{
      version: String,
      appliedAt: Date,
      description: String,
      status: {
        type: String,
        enum: ['pending', 'running', 'completed', 'failed', 'rolled_back']
      }
    }],
    backups: [{
      backupId: String,
      timestamp: Date,
      size: Number,
      location: String,
      type: {
        type: String,
        enum: ['full', 'incremental', 'differential']
      },
      status: {
        type: String,
        enum: ['completed', 'failed', 'in_progress']
      },
      retentionUntil: Date
    }]
  },

  // ==================== Storage Configuration ====================
  storage: {
    provider: {
      type: String,
      enum: ['aws_s3', 'azure_blob', 'gcp_storage', 'local', 'custom'],
      default: 'aws_s3'
    },
    configuration: {
      bucket: String,
      region: String,
      endpoint: String,
      accessKeyId: {
        type: String,
        select: false
      },
      secretAccessKey: {
        type: String,
        select: false
      },
      encryptionKey: {
        type: String,
        select: false
      }
    },
    paths: {
      root: String,
      documents: String,
      media: String,
      backups: String,
      temp: String,
      archive: String
    },
    quotas: {
      maxStorage: {
        type: Number,
        default: 10737418240 // 10GB in bytes
      },
      maxFileSize: {
        type: Number,
        default: 104857600 // 100MB in bytes
      },
      maxFiles: {
        type: Number,
        default: 10000
      }
    },
    usage: {
      totalSize: {
        type: Number,
        default: 0
      },
      fileCount: {
        type: Number,
        default: 0
      },
      lastCalculated: Date,
      breakdown: {
        documents: { type: Number, default: 0 },
        media: { type: Number, default: 0 },
        backups: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
      }
    }
  },

  // ==================== Infrastructure & Resources ====================
  infrastructure: {
    region: {
      primary: {
        type: String,
        default: 'us-east-1'
      },
      secondary: [String],
      dataResidency: {
        required: { type: Boolean, default: false },
        allowedRegions: [String],
        restrictedRegions: [String]
      }
    },
    compute: {
      instances: [{
        instanceId: String,
        type: String,
        status: String,
        region: String,
        launchedAt: Date,
        purpose: String
      }],
      autoscaling: {
        enabled: { type: Boolean, default: false },
        minInstances: { type: Number, default: 1 },
        maxInstances: { type: Number, default: 5 },
        targetCPU: { type: Number, default: 70 },
        targetMemory: { type: Number, default: 80 }
      }
    },
    network: {
      vpcId: String,
      subnetIds: [String],
      securityGroupIds: [String],
      loadBalancer: {
        enabled: { type: Boolean, default: false },
        type: String,
        dnsName: String
      },
      cdn: {
        enabled: { type: Boolean, default: false },
        provider: String,
        distributionId: String
      }
    },
    kubernetes: {
      namespace: String,
      cluster: String,
      deployments: [{
        name: String,
        replicas: Number,
        image: String,
        version: String,
        status: String
      }],
      services: [{
        name: String,
        type: String,
        port: Number,
        endpoint: String
      }],
      ingress: {
        enabled: Boolean,
        className: String,
        rules: mongoose.Schema.Types.Mixed
      }
    }
  },

  // ==================== Security & Encryption ====================
  security: {
    encryption: {
      enabled: {
        type: Boolean,
        default: true
      },
      algorithm: {
        type: String,
        default: 'AES-256-GCM'
      },
      keyId: String,
      keyVersion: Number,
      keyRotation: {
        enabled: { type: Boolean, default: true },
        frequency: { type: Number, default: 90 }, // days
        lastRotated: Date,
        nextRotation: Date
      },
      atRest: {
        database: { type: Boolean, default: true },
        storage: { type: Boolean, default: true },
        backups: { type: Boolean, default: true }
      },
      inTransit: {
        enabled: { type: Boolean, default: true },
        tlsVersion: { type: String, default: '1.3' }
      }
    },
    isolation: {
      networkIsolation: { type: Boolean, default: true },
      processIsolation: { type: Boolean, default: false },
      dataIsolation: { type: Boolean, default: true },
      cacheIsolation: { type: Boolean, default: true }
    },
    compliance: {
      frameworks: [{
        name: {
          type: String,
          enum: ['SOC2', 'ISO27001', 'HIPAA', 'GDPR', 'PCI-DSS', 'FedRAMP']
        },
        certified: Boolean,
        certificationDate: Date,
        expiryDate: Date,
        auditReports: [String]
      }],
      dataClassification: {
        type: String,
        enum: ['public', 'internal', 'confidential', 'restricted', 'top_secret'],
        default: 'confidential'
      },
      retentionPolicies: [{
        dataType: String,
        retentionDays: Number,
        deleteAfter: Boolean,
        archiveAfter: Boolean
      }]
    },
    audit: {
      enabled: { type: Boolean, default: true },
      logRetention: { type: Number, default: 365 }, // days
      logLevel: {
        type: String,
        enum: ['error', 'warn', 'info', 'debug', 'trace'],
        default: 'info'
      },
      events: {
        dataAccess: { type: Boolean, default: true },
        dataModification: { type: Boolean, default: true },
        authentication: { type: Boolean, default: true },
        authorization: { type: Boolean, default: true },
        configuration: { type: Boolean, default: true }
      }
    }
  },

  // ==================== Resource Limits & Quotas ====================
  limits: {
    users: {
      max: { type: Number, default: -1 }, // -1 = unlimited
      current: { type: Number, default: 0 },
      reserved: { type: Number, default: 0 }
    },
    storage: {
      max: { type: Number, default: -1 },
      current: { type: Number, default: 0 },
      reserved: { type: Number, default: 0 }
    },
    bandwidth: {
      monthly: { type: Number, default: -1 },
      daily: { type: Number, default: -1 },
      used: {
        month: { type: Number, default: 0 },
        day: { type: Number, default: 0 },
        lastReset: Date
      }
    },
    apiCalls: {
      monthly: { type: Number, default: -1 },
      daily: { type: Number, default: -1 },
      hourly: { type: Number, default: -1 },
      used: {
        month: { type: Number, default: 0 },
        day: { type: Number, default: 0 },
        hour: { type: Number, default: 0 },
        lastReset: Date
      }
    },
    compute: {
      cpu: {
        cores: { type: Number, default: 2 },
        burstable: { type: Boolean, default: true }
      },
      memory: {
        gb: { type: Number, default: 4 },
        swappable: { type: Boolean, default: true }
      },
      disk: {
        iops: { type: Number, default: 3000 },
        throughputMbps: { type: Number, default: 125 }
      }
    },
    concurrent: {
      connections: { type: Number, default: 1000 },
      queries: { type: Number, default: 100 },
      transactions: { type: Number, default: 50 }
    }
  },

  // ==================== Custom Domain & Branding ====================
  customization: {
    domains: [{
      domain: {
        type: String,
        lowercase: true,
        unique: true,
        sparse: true
      },
      subdomain: String,
      verified: {
        type: Boolean,
        default: false
      },
      verificationMethod: {
        type: String,
        enum: ['dns_txt', 'dns_cname', 'http_file', 'meta_tag']
      },
      verificationToken: String,
      verifiedAt: Date,
      ssl: {
        enabled: { type: Boolean, default: false },
        provider: String,
        certificateId: String,
        expiresAt: Date,
        autoRenew: { type: Boolean, default: true }
      },
      status: {
        type: String,
        enum: ['pending', 'verified', 'active', 'suspended', 'expired'],
        default: 'pending'
      }
    }],
    branding: {
      colors: mongoose.Schema.Types.Mixed,
      logos: mongoose.Schema.Types.Mixed,
      fonts: mongoose.Schema.Types.Mixed,
      customCss: String,
      customJs: String,
      favicon: String
    },
    features: {
      whiteLabel: { type: Boolean, default: false },
      customEmails: { type: Boolean, default: false },
      customReports: { type: Boolean, default: false },
      apiWhiteLabel: { type: Boolean, default: false }
    }
  },

  // ==================== Performance & Monitoring ====================
  performance: {
    sla: {
      uptime: { type: Number, default: 99.9 },
      responseTime: { type: Number, default: 200 }, // ms
      errorRate: { type: Number, default: 0.1 } // percentage
    },
    metrics: {
      current: {
        uptime: Number,
        avgResponseTime: Number,
        errorRate: Number,
        activeUsers: Number,
        requestsPerSecond: Number,
        cpuUsage: Number,
        memoryUsage: Number,
        diskUsage: Number
      },
      history: [{
        timestamp: Date,
        period: String,
        metrics: mongoose.Schema.Types.Mixed
      }]
    },
    monitoring: {
      enabled: { type: Boolean, default: true },
      provider: {
        type: String,
        enum: ['datadog', 'new_relic', 'cloudwatch', 'prometheus', 'custom'],
        default: 'prometheus'
      },
      endpoints: {
        metrics: String,
        logs: String,
        traces: String,
        alerts: String
      },
      alerts: [{
        name: String,
        type: String,
        threshold: Number,
        enabled: Boolean,
        channels: [String]
      }]
    },
    optimization: {
      caching: {
        enabled: { type: Boolean, default: true },
        ttl: { type: Number, default: 3600 },
        strategy: String
      },
      compression: {
        enabled: { type: Boolean, default: true },
        algorithm: { type: String, default: 'gzip' }
      },
      minification: {
        enabled: { type: Boolean, default: true },
        types: ['js', 'css', 'html']
      }
    }
  },

  // ==================== Integrations & APIs ====================
  integrations: {
    webhooks: {
      enabled: { type: Boolean, default: true },
      endpoints: [{
        url: String,
        events: [String],
        secret: {
          type: String,
          select: false
        },
        active: Boolean,
        retryPolicy: {
          maxRetries: { type: Number, default: 3 },
          backoffMultiplier: { type: Number, default: 2 }
        },
        lastTriggered: Date,
        failureCount: Number
      }]
    },
    apis: {
      enabled: { type: Boolean, default: true },
      rateLimit: {
        requests: Number,
        period: String,
        burstSize: Number
      },
      authentication: {
        methods: ['api_key', 'oauth2', 'jwt'],
        oauth2: {
          clientId: String,
          clientSecret: {
            type: String,
            select: false
          },
          scopes: [String]
        }
      },
      versions: [{
        version: String,
        status: String,
        deprecatedAt: Date,
        sunsetAt: Date
      }]
    },
    thirdParty: [{
      name: String,
      provider: String,
      enabled: Boolean,
      config: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      },
      syncSettings: {
        frequency: String,
        lastSync: Date,
        nextSync: Date,
        dataTypes: [String]
      }
    }]
  },

  // ==================== Billing & Cost Management ====================
  billing: {
    costCenter: String,
    billingAccount: String,
    currency: {
      type: String,
      default: 'USD'
    },
    costs: {
      compute: { type: Number, default: 0 },
      storage: { type: Number, default: 0 },
      bandwidth: { type: Number, default: 0 },
      api: { type: Number, default: 0 },
      support: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    budget: {
      monthly: Number,
      alerts: [{
        threshold: Number,
        type: {
          type: String,
          enum: ['percentage', 'amount']
        },
        notified: Boolean,
        notifiedAt: Date
      }]
    },
    invoices: [{
      invoiceId: String,
      period: String,
      amount: Number,
      status: String,
      dueDate: Date,
      paidAt: Date
    }]
  },

  // ==================== Status & Health ====================
  status: {
    state: {
      type: String,
      enum: ['provisioning', 'active', 'suspended', 'maintenance', 'migrating', 'terminating', 'terminated'],
      default: 'provisioning',
      index: true
    },
    health: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 100
      },
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy', 'critical'],
        default: 'healthy'
      },
      lastCheck: Date,
      issues: [{
        type: String,
        severity: String,
        message: String,
        detectedAt: Date,
        resolvedAt: Date
      }]
    },
    provisioning: {
      startedAt: Date,
      completedAt: Date,
      progress: Number,
      steps: [{
        name: String,
        status: String,
        startedAt: Date,
        completedAt: Date,
        error: String
      }]
    },
    maintenance: {
      scheduled: [{
        maintenanceId: String,
        type: String,
        description: String,
        scheduledFor: Date,
        estimatedDuration: Number,
        affectedServices: [String],
        status: String
      }],
      history: [{
        maintenanceId: String,
        type: String,
        startedAt: Date,
        completedAt: Date,
        duration: Number,
        result: String
      }]
    }
  },

  // ==================== Metadata ====================
  metadata: {
    version: {
      schema: { type: String, default: '1.0.0' },
      api: { type: String, default: '1.0.0' },
      platform: String
    },
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    labels: {
      type: Map,
      of: String
    },
    annotations: {
      type: Map,
      of: String
    }
  }
};

// Create schema
const tenantSchema = BaseModel.createSchema(tenantSchemaDefinition, {
  collection: 'tenants',
  timestamps: true
});

// ==================== Indexes ====================
tenantSchema.index({ tenantId: 1 });
tenantSchema.index({ organizationId: 1 });
tenantSchema.index({ 'status.state': 1 });
tenantSchema.index({ 'customization.domains.domain': 1 });
tenantSchema.index({ 'infrastructure.region.primary': 1 });
tenantSchema.index({ 'metadata.tags': 1 });
tenantSchema.index({ createdAt: -1 });

// Compound indexes
tenantSchema.index({ 'status.state': 1, 'status.health.status': 1 });
tenantSchema.index({ tenantId: 1, 'status.state': 1 });

// ==================== Virtual Fields ====================
tenantSchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

tenantSchema.virtual('isHealthy').get(function() {
  return this.status.health.status === 'healthy' && this.status.health.score >= 80;
});

tenantSchema.virtual('storageUsagePercent').get(function() {
  if (!this.limits.storage.max || this.limits.storage.max === -1) return 0;
  return Math.round((this.limits.storage.current / this.limits.storage.max) * 100);
});

tenantSchema.virtual('userUsagePercent').get(function() {
  if (!this.limits.users.max || this.limits.users.max === -1) return 0;
  return Math.round((this.limits.users.current / this.limits.users.max) * 100);
});

tenantSchema.virtual('monthlyApiUsagePercent').get(function() {
  if (!this.limits.apiCalls.monthly || this.limits.apiCalls.monthly === -1) return 0;
  return Math.round((this.limits.apiCalls.used.month / this.limits.apiCalls.monthly) * 100);
});

tenantSchema.virtual('totalCost').get(function() {
  const costs = this.billing.costs;
  return costs.compute + costs.storage + costs.bandwidth + costs.api + costs.support + costs.other;
});

tenantSchema.virtual('primaryDomain').get(function() {
  const activeDomain = this.customization.domains.find(d => 
    d.status === 'active' && d.verified
  );
  return activeDomain?.domain;
});

// ==================== Pre-save Middleware ====================
tenantSchema.pre('save', async function(next) {
  try {
    // Generate tenant ID if not provided
    if (this.isNew && !this.tenantId) {
      this.tenantId = await this.constructor.generateTenantId(this.name);
    }

    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.name;
    }

    // Initialize database configuration based on strategy
    if (this.isNew) {
      await this.initializeDatabaseConfig();
    }

    // Initialize storage paths
    if (this.isNew && !this.storage.paths.root) {
      this.storage.paths = {
        root: `/tenants/${this.tenantId}`,
        documents: `/tenants/${this.tenantId}/documents`,
        media: `/tenants/${this.tenantId}/media`,
        backups: `/tenants/${this.tenantId}/backups`,
        temp: `/tenants/${this.tenantId}/temp`,
        archive: `/tenants/${this.tenantId}/archive`
      };
    }

    // Update total cost
    this.billing.costs.total = this.totalCost;

    // Update health status based on score
    if (this.status.health.score >= 90) {
      this.status.health.status = 'healthy';
    } else if (this.status.health.score >= 70) {
      this.status.health.status = 'degraded';
    } else if (this.status.health.score >= 50) {
      this.status.health.status = 'unhealthy';
    } else {
      this.status.health.status = 'critical';
    }

    // Set next key rotation date
    if (this.security.encryption.keyRotation.enabled && !this.security.encryption.keyRotation.nextRotation) {
      const rotationDate = new Date();
      rotationDate.setDate(rotationDate.getDate() + this.security.encryption.keyRotation.frequency);
      this.security.encryption.keyRotation.nextRotation = rotationDate;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
tenantSchema.methods.initializeDatabaseConfig = async function() {
  switch (this.configuration.databaseStrategy) {
    case 'database_per_tenant':
      this.database.databaseName = `tenant_${this.tenantId}`;
      break;
    case 'schema_per_tenant':
      this.database.schemaName = `tenant_${this.tenantId}`;
      break;
    case 'shared_database':
      this.database.tablePrefix = `t${this.tenantId}_`;
      break;
  }
  
  // Generate encryption key for tenant data
  if (this.security.encryption.enabled) {
    const keyData = await EncryptionService.generateKey();
    this.security.encryption.keyId = keyData.keyId;
    this.security.encryption.keyVersion = 1;
  }
  
  return this;
};

tenantSchema.methods.provision = async function() {
  if (this.status.state !== 'provisioning') {
    throw new AppError('Tenant is not in provisioning state', 400, 'INVALID_STATE');
  }

  this.status.provisioning.startedAt = new Date();
  const steps = [
    'database_setup',
    'storage_setup',
    'security_setup',
    'network_setup',
    'initial_data',
    'verification'
  ];

  for (const stepName of steps) {
    const step = {
      name: stepName,
      status: 'in_progress',
      startedAt: new Date()
    };
    
    this.status.provisioning.steps.push(step);
    await this.save();

    try {
      // Simulate provisioning step (in real implementation, call actual provisioning services)
      await this.executeProvisioningStep(stepName);
      
      step.status = 'completed';
      step.completedAt = new Date();
    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      throw error;
    }

    this.status.provisioning.progress = 
      (this.status.provisioning.steps.filter(s => s.status === 'completed').length / steps.length) * 100;
    
    await this.save();
  }

  this.status.state = 'active';
  this.status.provisioning.completedAt = new Date();
  this.status.provisioning.progress = 100;
  
  await this.save();

  logger.info('Tenant provisioned successfully', {
    tenantId: this.tenantId,
    organizationId: this.organizationId
  });

  return this;
};

tenantSchema.methods.executeProvisioningStep = async function(stepName) {
  // This would contain actual provisioning logic
  // For now, we'll simulate with a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  switch (stepName) {
    case 'database_setup':
      // Create database/schema, run migrations, etc.
      break;
    case 'storage_setup':
      // Create storage buckets/folders, set permissions, etc.
      break;
    case 'security_setup':
      // Generate keys, configure encryption, set up audit logs, etc.
      break;
    case 'network_setup':
      // Configure VPC, security groups, DNS, etc.
      break;
    case 'initial_data':
      // Seed initial data, create default roles, etc.
      break;
    case 'verification':
      // Verify all components are working correctly
      break;
  }
};

tenantSchema.methods.suspend = async function(reason, suspendedBy) {
  if (this.status.state === 'suspended') {
    throw new AppError('Tenant is already suspended', 400, 'ALREADY_SUSPENDED');
  }

  this.status.state = 'suspended';
  
  // Add health issue
  if (!this.status.health.issues) this.status.health.issues = [];
  this.status.health.issues.push({
    type: 'suspension',
    severity: 'critical',
    message: `Tenant suspended: ${reason}`,
    detectedAt: new Date()
  });

  await this.save();

  logger.warn('Tenant suspended', {
    tenantId: this.tenantId,
    reason
  });

  return this;
};

tenantSchema.methods.reactivate = async function() {
  if (this.status.state !== 'suspended') {
    throw new AppError('Tenant is not suspended', 400, 'NOT_SUSPENDED');
  }

  this.status.state = 'active';
  
  // Resolve suspension issue
  const suspensionIssue = this.status.health.issues.find(i => 
    i.type === 'suspension' && !i.resolvedAt
  );
  if (suspensionIssue) {
    suspensionIssue.resolvedAt = new Date();
  }

  await this.save();

  logger.info('Tenant reactivated', {
    tenantId: this.tenantId
  });

  return this;
};

tenantSchema.methods.updateResourceUsage = async function(resource, delta) {
  switch (resource) {
    case 'users':
      this.limits.users.current += delta;
      if (this.limits.users.max !== -1 && this.limits.users.current > this.limits.users.max) {
        throw new AppError('User limit exceeded', 403, 'USER_LIMIT_EXCEEDED');
      }
      break;
      
    case 'storage':
      this.limits.storage.current += delta;
      if (this.limits.storage.max !== -1 && this.limits.storage.current > this.limits.storage.max) {
        throw new AppError('Storage limit exceeded', 403, 'STORAGE_LIMIT_EXCEEDED');
      }
      this.storage.usage.totalSize = this.limits.storage.current;
      this.storage.usage.lastCalculated = new Date();
      break;
      
    case 'api_calls':
      this.limits.apiCalls.used.hour += delta;
      this.limits.apiCalls.used.day += delta;
      this.limits.apiCalls.used.month += delta;
      
      // Check limits
      if (this.limits.apiCalls.hourly !== -1 && this.limits.apiCalls.used.hour > this.limits.apiCalls.hourly) {
        throw new AppError('Hourly API limit exceeded', 429, 'API_LIMIT_EXCEEDED');
      }
      break;
      
    case 'bandwidth':
      this.limits.bandwidth.used.day += delta;
      this.limits.bandwidth.used.month += delta;
      break;
  }

  await this.save();
  return this;
};

tenantSchema.methods.addDomain = async function(domainData) {
  // Check if domain already exists
  const existingDomain = this.customization.domains.find(d => 
    d.domain === domainData.domain.toLowerCase()
  );

  if (existingDomain) {
    throw new AppError('Domain already exists', 409, 'DOMAIN_EXISTS');
  }

  const verificationToken = stringHelper.generateRandomString(32);
  
  const newDomain = {
    ...domainData,
    domain: domainData.domain.toLowerCase(),
    verificationToken,
    status: 'pending'
  };

  this.customization.domains.push(newDomain);
  await this.save();

  logger.info('Domain added to tenant', {
    tenantId: this.tenantId,
    domain: newDomain.domain
  });

  return {
    domain: newDomain,
    verificationInstructions: this.getVerificationInstructions(newDomain)
  };
};

tenantSchema.methods.getVerificationInstructions = function(domain) {
  const instructions = {
    method: domain.verificationMethod || 'dns_txt',
    steps: []
  };

  switch (instructions.method) {
    case 'dns_txt':
      instructions.steps = [
        `Add a TXT record to your DNS:`,
        `Name: _tenant-verify.${domain.subdomain || '@'}`,
        `Value: tenant-verify=${domain.verificationToken}`,
        `TTL: 300 (or your provider's default)`
      ];
      break;
    case 'dns_cname':
      instructions.steps = [
        `Add a CNAME record to your DNS:`,
        `Name: _tenant-verify.${domain.subdomain || domain.domain}`,
        `Value: verify.${process.env.BASE_DOMAIN || 'example.com'}`,
        `TTL: 300 (or your provider's default)`
      ];
      break;
    case 'http_file':
      instructions.steps = [
        `Create a file at: http://${domain.domain}/.well-known/tenant-verify.txt`,
        `File content: ${domain.verificationToken}`,
        `Ensure the file is publicly accessible`
      ];
      break;
    case 'meta_tag':
      instructions.steps = [
        `Add this meta tag to your homepage HTML <head> section:`,
        `<meta name="tenant-verification" content="${domain.verificationToken}" />`
      ];
      break;
  }

  return instructions;
};

tenantSchema.methods.verifyDomain = async function(domain) {
  const domainEntry = this.customization.domains.find(d => 
    d.domain === domain.toLowerCase() && d.status === 'pending'
  );

  if (!domainEntry) {
    throw new AppError('Domain not found or already verified', 404, 'DOMAIN_NOT_FOUND');
  }

  // In real implementation, perform actual verification
  const isVerified = await this.performDomainVerification(domainEntry);

  if (!isVerified) {
    throw new AppError('Domain verification failed', 400, 'VERIFICATION_FAILED');
  }

  domainEntry.verified = true;
  domainEntry.verifiedAt = new Date();
  domainEntry.status = 'verified';

  await this.save();

  logger.info('Domain verified', {
    tenantId: this.tenantId,
    domain: domainEntry.domain
  });

  return domainEntry;
};

tenantSchema.methods.performDomainVerification = async function(domain) {
  // Simulate verification - in real implementation, check DNS/HTTP/etc.
  return true;
};

tenantSchema.methods.rotateEncryptionKey = async function() {
  if (!this.security.encryption.enabled) {
    throw new AppError('Encryption is not enabled', 400, 'ENCRYPTION_DISABLED');
  }

  const newKeyData = await EncryptionService.rotateKey(this.security.encryption.keyId);
  
  this.security.encryption.keyId = newKeyData.keyId;
  this.security.encryption.keyVersion += 1;
  this.security.encryption.keyRotation.lastRotated = new Date();
  
  const nextRotation = new Date();
  nextRotation.setDate(nextRotation.getDate() + this.security.encryption.keyRotation.frequency);
  this.security.encryption.keyRotation.nextRotation = nextRotation;

  await this.save();

  logger.info('Encryption key rotated', {
    tenantId: this.tenantId,
    keyVersion: this.security.encryption.keyVersion
  });

  return this;
};

tenantSchema.methods.calculateHealthScore = async function() {
  let score = 100;
  const factors = {
    availability: 30,
    performance: 25,
    security: 25,
    resource: 20
  };

  // Availability factor
  if (this.status.state !== 'active') {
    factors.availability = 0;
  } else if (this.performance.metrics.current.uptime < this.performance.sla.uptime) {
    factors.availability *= (this.performance.metrics.current.uptime / this.performance.sla.uptime);
  }

  // Performance factor
  if (this.performance.metrics.current.avgResponseTime > this.performance.sla.responseTime) {
    factors.performance *= (this.performance.sla.responseTime / this.performance.metrics.current.avgResponseTime);
  }
  if (this.performance.metrics.current.errorRate > this.performance.sla.errorRate) {
    factors.performance *= ((100 - this.performance.metrics.current.errorRate) / (100 - this.performance.sla.errorRate));
  }

  // Security factor
  const unresolvedSecurityIssues = this.status.health.issues.filter(i => 
    i.severity === 'critical' && !i.resolvedAt
  ).length;
  if (unresolvedSecurityIssues > 0) {
    factors.security = Math.max(0, factors.security - (unresolvedSecurityIssues * 10));
  }

  // Resource factor
  const resourceUsages = [
    this.storageUsagePercent,
    this.userUsagePercent,
    this.monthlyApiUsagePercent
  ];
  const avgResourceUsage = resourceUsages.reduce((a, b) => a + b, 0) / resourceUsages.length;
  if (avgResourceUsage > 90) {
    factors.resource = 5;
  } else if (avgResourceUsage > 80) {
    factors.resource = 15;
  }

  // Calculate total score
  score = Object.values(factors).reduce((sum, factor) => sum + factor, 0);
  
  this.status.health.score = Math.round(score);
  this.status.health.lastCheck = new Date();

  await this.save();
  return this.status.health.score;
};

tenantSchema.methods.scheduleMaintenance = async function(maintenanceData) {
  const maintenance = {
    maintenanceId: stringHelper.generateRandomString(16),
    ...maintenanceData,
    status: 'scheduled'
  };

  if (!this.status.maintenance.scheduled) {
    this.status.maintenance.scheduled = [];
  }

  this.status.maintenance.scheduled.push(maintenance);
  await this.save();

  logger.info('Maintenance scheduled', {
    tenantId: this.tenantId,
    maintenanceId: maintenance.maintenanceId,
    scheduledFor: maintenance.scheduledFor
  });

  return maintenance;
};

// ==================== Static Methods ====================
tenantSchema.statics.generateTenantId = async function(baseName) {
  let tenantId = baseName.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 20);

  // Ensure uniqueness
  let counter = 0;
  let uniqueTenantId = tenantId;
  
  while (await this.exists({ tenantId: uniqueTenantId })) {
    counter++;
    uniqueTenantId = `${tenantId}_${counter}`;
  }

  return uniqueTenantId;
};

tenantSchema.statics.findByTenantId = async function(tenantId) {
  return await this.findOne({
    tenantId,
    'status.state': { $ne: 'terminated' }
  });
};

tenantSchema.statics.findByOrganization = async function(organizationId) {
  return await this.findOne({
    organizationId,
    'status.state': { $ne: 'terminated' }
  });
};

tenantSchema.statics.findByDomain = async function(domain) {
  return await this.findOne({
    'customization.domains': {
      $elemMatch: {
        domain: domain.toLowerCase(),
        verified: true,
        status: 'active'
      }
    },
    'status.state': 'active'
  });
};

tenantSchema.statics.createTenant = async function(data) {
  const tenant = new this(data);
  
  // Start provisioning process
  await tenant.save();
  
  // Provision asynchronously
  tenant.provision().catch(error => {
    logger.error('Tenant provisioning failed', {
      tenantId: tenant.tenantId,
      error: error.message
    });
    
    tenant.status.state = 'failed';
    tenant.status.provisioning.steps.push({
      name: 'error',
      status: 'failed',
      error: error.message,
      completedAt: new Date()
    });
    tenant.save();
  });

  return tenant;
};

tenantSchema.statics.getActiveTenantsCount = async function() {
  return await this.countDocuments({
    'status.state': 'active'
  });
};

tenantSchema.statics.getTenantStatistics = async function(filters = {}) {
  const match = {
    'status.state': { $ne: 'terminated' }
  };

  if (filters.region) {
    match['infrastructure.region.primary'] = filters.region;
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
              },
              suspended: {
                $sum: { $cond: [{ $eq: ['$status.state', 'suspended'] }, 1, 0] }
              },
              provisioning: {
                $sum: { $cond: [{ $eq: ['$status.state', 'provisioning'] }, 1, 0] }
              }
            }
          }
        ],
        byIsolationLevel: [
          {
            $group: {
              _id: '$configuration.isolationLevel',
              count: { $sum: 1 }
            }
          }
        ],
        byRegion: [
          {
            $group: {
              _id: '$infrastructure.region.primary',
              count: { $sum: 1 }
            }
          }
        ],
        resourceUsage: [
          {
            $group: {
              _id: null,
              avgStorageUsage: { $avg: '$limits.storage.current' },
              avgUserCount: { $avg: '$limits.users.current' },
              avgApiCalls: { $avg: '$limits.apiCalls.used.month' },
              totalStorage: { $sum: '$limits.storage.current' },
              totalUsers: { $sum: '$limits.users.current' }
            }
          }
        ],
        healthDistribution: [
          {
            $group: {
              _id: '$status.health.status',
              count: { $sum: 1 },
              avgScore: { $avg: '$status.health.score' }
            }
          }
        ],
        costAnalysis: [
          {
            $group: {
              _id: null,
              totalCost: { $sum: '$billing.costs.total' },
              avgCost: { $avg: '$billing.costs.total' },
              computeCost: { $sum: '$billing.costs.compute' },
              storageCost: { $sum: '$billing.costs.storage' },
              bandwidthCost: { $sum: '$billing.costs.bandwidth' }
            }
          }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      suspended: 0,
      provisioning: 0
    },
    distribution: {
      byIsolationLevel: result.byIsolationLevel,
      byRegion: result.byRegion
    },
    resources: result.resourceUsage[0] || {
      avgStorageUsage: 0,
      avgUserCount: 0,
      avgApiCalls: 0,
      totalStorage: 0,
      totalUsers: 0
    },
    health: result.healthDistribution,
    costs: result.costAnalysis[0] || {
      totalCost: 0,
      avgCost: 0,
      computeCost: 0,
      storageCost: 0,
      bandwidthCost: 0
    }
  };
};

tenantSchema.statics.getTenantsNeedingAttention = async function() {
  const attentionNeeded = await this.find({
    $or: [
      { 'status.health.status': { $in: ['unhealthy', 'critical'] } },
      { 'status.state': 'suspended' },
      {
        'limits.storage.current': { $gte: 0 },
        'limits.storage.max': { $gt: 0 },
        $expr: {
          $gte: [
            { $divide: ['$limits.storage.current', '$limits.storage.max'] },
            0.9
          ]
        }
      },
      {
        'security.encryption.keyRotation.nextRotation': {
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      }
    ]
  }).populate('organizationId', 'name contact.email');

  return attentionNeeded;
};

tenantSchema.statics.performHealthChecks = async function() {
  const tenants = await this.find({
    'status.state': 'active'
  });

  const results = [];
  
  for (const tenant of tenants) {
    try {
      const healthScore = await tenant.calculateHealthScore();
      results.push({
        tenantId: tenant.tenantId,
        healthScore,
        status: tenant.status.health.status
      });
    } catch (error) {
      logger.error('Health check failed for tenant', {
        tenantId: tenant.tenantId,
        error: error.message
      });
    }
  }

  return results;
};

// Create and export model
const TenantModel = BaseModel.createModel('Tenant', tenantSchema);

module.exports = TenantModel;