'use strict';

/**
 * @fileoverview Platform configuration and settings model
 * @module servers/admin-server/modules/platform-management/models/platform-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');

/**
 * Platform configuration schema definition
 */
const platformSchemaDefinition = {
  // Platform Identity
  platformId: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  version: {
    current: {
      type: String,
      required: true,
      match: /^\d+\.\d+\.\d+$/
    },
    previous: [{
      version: String,
      upgradedAt: Date,
      upgradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // Environment Configuration
  environment: {
    type: {
      type: String,
      enum: ['development', 'staging', 'production'],
      required: true,
      index: true
    },
    tier: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
      default: 'starter'
    },
    region: {
      type: String,
      required: true
    },
    datacenter: String,
    deploymentType: {
      type: String,
      enum: ['cloud', 'on-premise', 'hybrid'],
      default: 'cloud'
    }
  },

  // System Configuration
  systemConfig: {
    database: {
      connectionPoolSize: {
        type: Number,
        default: 100
      },
      replicationEnabled: {
        type: Boolean,
        default: false
      },
      shardingEnabled: {
        type: Boolean,
        default: false
      },
      backupSchedule: {
        enabled: Boolean,
        frequency: String,
        retentionDays: Number,
        lastBackupAt: Date
      }
    },
    cache: {
      provider: {
        type: String,
        enum: ['redis', 'memcached', 'memory'],
        default: 'redis'
      },
      ttl: {
        type: Number,
        default: 3600
      },
      maxSize: Number,
      evictionPolicy: String
    },
    storage: {
      provider: {
        type: String,
        enum: ['s3', 'azure', 'gcp', 'local'],
        default: 's3'
      },
      bucket: String,
      maxFileSize: {
        type: Number,
        default: 104857600 // 100MB
      },
      allowedMimeTypes: [String]
    },
    queue: {
      provider: {
        type: String,
        enum: ['redis', 'rabbitmq', 'sqs', 'bull'],
        default: 'bull'
      },
      defaultConcurrency: {
        type: Number,
        default: 10
      },
      maxRetries: {
        type: Number,
        default: 3
      }
    }
  },

  // Security Configuration
  security: {
    encryption: {
      algorithm: {
        type: String,
        default: 'aes-256-gcm'
      },
      keyRotationEnabled: {
        type: Boolean,
        default: true
      },
      keyRotationFrequency: {
        type: Number,
        default: 90 // days
      },
      lastKeyRotation: Date
    },
    authentication: {
      sessionTimeout: {
        type: Number,
        default: 3600 // seconds
      },
      maxFailedAttempts: {
        type: Number,
        default: 5
      },
      lockoutDuration: {
        type: Number,
        default: 1800 // seconds
      },
      passwordPolicy: {
        minLength: {
          type: Number,
          default: 12
        },
        requireUppercase: {
          type: Boolean,
          default: true
        },
        requireLowercase: {
          type: Boolean,
          default: true
        },
        requireNumbers: {
          type: Boolean,
          default: true
        },
        requireSpecialChars: {
          type: Boolean,
          default: true
        },
        expiryDays: {
          type: Number,
          default: 90
        }
      },
      mfaRequired: {
        type: Boolean,
        default: false
      },
      allowedAuthProviders: [{
        type: String,
        enum: ['local', 'google', 'github', 'linkedin', 'saml', 'oidc', 'ldap']
      }]
    },
    cors: {
      enabled: {
        type: Boolean,
        default: true
      },
      allowedOrigins: [String],
      allowedMethods: [String],
      allowedHeaders: [String],
      maxAge: Number
    },
    rateLimit: {
      enabled: {
        type: Boolean,
        default: true
      },
      windowMs: {
        type: Number,
        default: 900000 // 15 minutes
      },
      maxRequests: {
        type: Number,
        default: 100
      },
      skipSuccessfulRequests: Boolean
    }
  },

  // Feature Flags
  features: {
    type: Map,
    of: {
      enabled: Boolean,
      rolloutPercentage: {
        type: Number,
        min: 0,
        max: 100
      },
      allowedOrganizations: [String],
      metadata: mongoose.Schema.Types.Mixed
    }
  },

  // API Configuration
  api: {
    baseUrl: String,
    version: {
      type: String,
      default: 'v1'
    },
    documentation: {
      enabled: {
        type: Boolean,
        default: true
      },
      url: String
    },
    deprecatedEndpoints: [{
      path: String,
      deprecatedAt: Date,
      sunsetDate: Date,
      replacement: String
    }],
    maintenanceMode: {
      enabled: {
        type: Boolean,
        default: false,
        index: true
      },
      message: String,
      allowedIps: [String],
      startTime: Date,
      endTime: Date
    }
  },

  // Integrations
  integrations: [{
    name: String,
    type: {
      type: String,
      enum: ['payment', 'email', 'sms', 'analytics', 'monitoring', 'support']
    },
    provider: String,
    enabled: Boolean,
    config: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    credentials: {
      type: Map,
      of: String,
      select: false
    },
    webhooks: [{
      url: String,
      events: [String],
      secret: {
        type: String,
        select: false
      }
    }]
  }],

  // Monitoring & Alerts
  monitoring: {
    healthCheck: {
      enabled: {
        type: Boolean,
        default: true
      },
      interval: {
        type: Number,
        default: 60 // seconds
      },
      endpoints: [String]
    },
    metrics: {
      enabled: {
        type: Boolean,
        default: true
      },
      provider: String,
      endpoint: String
    },
    alerts: [{
      name: String,
      type: String,
      threshold: mongoose.Schema.Types.Mixed,
      severity: {
        type: String,
        enum: ['info', 'warning', 'error', 'critical']
      },
      channels: [String],
      enabled: Boolean
    }]
  },

  // Compliance & Legal
  compliance: {
    frameworks: [{
      type: String,
      enum: ['gdpr', 'ccpa', 'hipaa', 'sox', 'pci', 'iso27001']
    }],
    dataRetention: {
      enabled: Boolean,
      policies: [{
        dataType: String,
        retentionPeriod: Number, // days
        action: {
          type: String,
          enum: ['delete', 'archive', 'anonymize']
        }
      }]
    },
    auditLog: {
      enabled: {
        type: Boolean,
        default: true
      },
      retentionDays: {
        type: Number,
        default: 365
      }
    }
  },

  // Resource Limits
  limits: {
    maxOrganizations: Number,
    maxUsersPerOrganization: Number,
    maxApiRequestsPerHour: Number,
    maxStoragePerOrganization: Number, // bytes
    maxConcurrentConnections: Number,
    customLimits: {
      type: Map,
      of: Number
    }
  },

  // Maintenance Windows
  maintenanceWindows: [{
    name: String,
    type: {
      type: String,
      enum: ['scheduled', 'emergency']
    },
    startTime: Date,
    endTime: Date,
    affectedServices: [String],
    description: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Platform Status
  status: {
    overall: {
      type: String,
      enum: ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'],
      default: 'operational',
      index: true
    },
    services: [{
      name: String,
      status: {
        type: String,
        enum: ['operational', 'degraded', 'outage']
      },
      lastChecked: Date,
      responseTime: Number
    }],
    lastStatusChange: Date,
    incidents: [{
      title: String,
      severity: String,
      status: String,
      startedAt: Date,
      resolvedAt: Date,
      postmortem: String
    }]
  },

  // Custom Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Lifecycle
  installedAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },

  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

// Create schema
const platformSchema = BaseModel.createSchema(platformSchemaDefinition, {
  collection: 'platform_configurations',
  timestamps: true
});

// Indexes
platformSchema.index({ 'environment.type': 1, 'status.overall': 1 });
platformSchema.index({ 'api.maintenanceMode.enabled': 1 });
platformSchema.index({ 'features': 1 });
platformSchema.index({ 'compliance.frameworks': 1 });

// Virtual fields
platformSchema.virtual('isInMaintenance').get(function() {
  return this.api.maintenanceMode.enabled || 
         this.status.overall === 'maintenance';
});

platformSchema.virtual('encryptedCredentialsCount').get(function() {
  let count = 0;
  this.integrations.forEach(integration => {
    if (integration.credentials) {
      count += integration.credentials.size;
    }
  });
  return count;
});

// Pre-save middleware
platformSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive credentials
    if (this.isModified('integrations')) {
      for (const integration of this.integrations) {
        if (integration.credentials) {
          const encryptedCreds = new Map();
          for (const [key, value] of integration.credentials) {
            if (value && !value.startsWith('enc:')) {
              const encrypted = await EncryptionService.encrypt(value);
              encryptedCreds.set(key, `enc:${encrypted}`);
            } else {
              encryptedCreds.set(key, value);
            }
          }
          integration.credentials = encryptedCreds;
        }
      }
    }

    // Validate version format
    if (this.isModified('version.current')) {
      const versionRegex = /^\d+\.\d+\.\d+$/;
      if (!versionRegex.test(this.version.current)) {
        throw new AppError('Invalid version format', 400, 'INVALID_VERSION_FORMAT');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
platformSchema.methods.updateVersion = async function(newVersion, userId) {
  this.version.previous.push({
    version: this.version.current,
    upgradedAt: new Date(),
    upgradedBy: userId
  });
  
  this.version.current = newVersion;
  this.lastModifiedBy = userId;
  
  await this.save();
  
  logger.info('Platform version updated', {
    previousVersion: this.version.previous[this.version.previous.length - 1].version,
    newVersion: this.version.current,
    upgradedBy: userId
  });
  
  return this;
};

platformSchema.methods.enableMaintenanceMode = async function(options = {}) {
  const {
    message = 'System maintenance in progress',
    duration = 3600000, // 1 hour default
    allowedIps = [],
    userId
  } = options;

  this.api.maintenanceMode = {
    enabled: true,
    message,
    allowedIps,
    startTime: new Date(),
    endTime: new Date(Date.now() + duration)
  };

  this.status.overall = 'maintenance';
  this.lastModifiedBy = userId;

  await this.save();

  logger.warn('Maintenance mode enabled', {
    duration,
    endTime: this.api.maintenanceMode.endTime,
    enabledBy: userId
  });

  return this;
};

platformSchema.methods.disableMaintenanceMode = async function(userId) {
  this.api.maintenanceMode.enabled = false;
  this.status.overall = 'operational';
  this.lastModifiedBy = userId;

  await this.save();

  logger.info('Maintenance mode disabled', {
    disabledBy: userId
  });

  return this;
};

platformSchema.methods.updateFeatureFlag = async function(featureName, config) {
  if (!this.features) {
    this.features = new Map();
  }

  this.features.set(featureName, {
    enabled: config.enabled,
    rolloutPercentage: config.rolloutPercentage || 100,
    allowedOrganizations: config.allowedOrganizations || [],
    metadata: config.metadata || {}
  });

  await this.save();

  logger.info('Feature flag updated', {
    feature: featureName,
    enabled: config.enabled,
    rollout: config.rolloutPercentage
  });

  return this.features.get(featureName);
};

platformSchema.methods.addIntegration = async function(integrationData) {
  const integration = {
    name: integrationData.name,
    type: integrationData.type,
    provider: integrationData.provider,
    enabled: integrationData.enabled || false,
    config: integrationData.config || new Map(),
    credentials: integrationData.credentials || new Map(),
    webhooks: integrationData.webhooks || []
  };

  this.integrations.push(integration);
  await this.save();

  logger.info('Integration added', {
    name: integration.name,
    type: integration.type,
    provider: integration.provider
  });

  return integration;
};

platformSchema.methods.updateSystemStatus = async function(serviceStatuses) {
  const now = new Date();
  
  // Update individual service statuses
  this.status.services = serviceStatuses.map(service => ({
    name: service.name,
    status: service.status,
    lastChecked: now,
    responseTime: service.responseTime
  }));

  // Determine overall status
  const statuses = serviceStatuses.map(s => s.status);
  if (statuses.every(s => s === 'operational')) {
    this.status.overall = 'operational';
  } else if (statuses.some(s => s === 'outage')) {
    this.status.overall = statuses.filter(s => s === 'outage').length > statuses.length / 2
      ? 'major_outage'
      : 'partial_outage';
  } else {
    this.status.overall = 'degraded';
  }

  if (this.isModified('status.overall')) {
    this.status.lastStatusChange = now;
  }

  await this.save();

  return this.status;
};

platformSchema.methods.recordIncident = async function(incidentData) {
  const incident = {
    title: incidentData.title,
    severity: incidentData.severity,
    status: 'investigating',
    startedAt: new Date(),
    resolvedAt: null,
    postmortem: null
  };

  this.status.incidents.push(incident);
  await this.save();

  logger.error('Platform incident recorded', {
    title: incident.title,
    severity: incident.severity
  });

  return incident;
};

platformSchema.methods.checkResourceLimit = function(resource, currentUsage) {
  const limit = this.limits[resource] || this.limits.customLimits?.get(resource);
  
  if (!limit) {
    return { withinLimit: true, limit: null, usage: currentUsage };
  }

  const withinLimit = currentUsage < limit;
  const percentageUsed = (currentUsage / limit) * 100;

  if (percentageUsed > 80) {
    logger.warn('Resource limit warning', {
      resource,
      limit,
      usage: currentUsage,
      percentageUsed
    });
  }

  return {
    withinLimit,
    limit,
    usage: currentUsage,
    percentageUsed,
    remaining: Math.max(0, limit - currentUsage)
  };
};

// Static methods
platformSchema.statics.getInstance = async function() {
  let platform = await this.findOne().sort({ createdAt: 1 });
  
  if (!platform) {
    // Create default platform configuration
    platform = await this.create({
      platformId: `platform_${Date.now()}`,
      name: 'InsightSerenity Platform',
      version: { current: '1.0.0' },
      environment: {
        type: process.env.NODE_ENV || 'development',
        region: process.env.AWS_REGION || 'us-east-1'
      }
    });
    
    logger.info('Platform configuration created', {
      platformId: platform.platformId,
      environment: platform.environment.type
    });
  }
  
  return platform;
};

platformSchema.statics.getPublicConfig = async function() {
  const platform = await this.getInstance();
  
  return {
    name: platform.name,
    version: platform.version.current,
    environment: platform.environment,
    status: platform.status.overall,
    features: Object.fromEntries(platform.features || []),
    api: {
      version: platform.api.version,
      documentation: platform.api.documentation,
      maintenanceMode: platform.api.maintenanceMode.enabled
    },
    limits: {
      maxApiRequestsPerHour: platform.limits.maxApiRequestsPerHour,
      maxStoragePerOrganization: platform.limits.maxStoragePerOrganization
    }
  };
};

platformSchema.statics.performHealthCheck = async function() {
  const platform = await this.getInstance();
  
  const healthData = {
    platform: {
      name: platform.name,
      version: platform.version.current,
      environment: platform.environment.type,
      uptime: Date.now() - platform.installedAt.getTime()
    },
    status: platform.status.overall,
    services: platform.status.services,
    database: {
      connected: mongoose.connection.readyState === 1,
      latency: await this.checkDatabaseLatency()
    },
    cache: await this.checkCacheHealth(),
    storage: await this.checkStorageHealth()
  };

  return healthData;
};

platformSchema.statics.checkDatabaseLatency = async function() {
  const start = Date.now();
  await this.findOne().select('_id').lean();
  return Date.now() - start;
};

platformSchema.statics.checkCacheHealth = async function() {
  // This would check actual cache service
  return {
    connected: true,
    latency: Math.random() * 10
  };
};

platformSchema.statics.checkStorageHealth = async function() {
  // This would check actual storage service
  return {
    connected: true,
    availableSpace: 1000000000000 // 1TB
  };
};

// Create and export model
const PlatformModel = BaseModel.createModel('Platform', platformSchema);

module.exports = PlatformModel;