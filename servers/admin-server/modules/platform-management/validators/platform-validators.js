'use strict';

/**
 * @fileoverview Platform management validation rules and schemas
 * @module servers/admin-server/modules/platform-management/validators/platform-validators
 * @requires joi
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/logger
 */

const Joi = require('joi');
const commonValidators = require('../../../../../shared/lib/utils/validators/common-validators');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const { ErrorCodes } = require('../../../../../shared/lib/utils/constants/error-codes');
const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Custom validation messages
 */
const VALIDATION_MESSAGES = {
  PLATFORM_ID_REQUIRED: 'Platform ID is required',
  PLATFORM_ID_INVALID: 'Invalid platform ID format',
  PLATFORM_NAME_REQUIRED: 'Platform name is required',
  PLATFORM_NAME_LENGTH: 'Platform name must be between 3 and 100 characters',
  PLATFORM_NAME_PATTERN: 'Platform name can only contain letters, numbers, spaces, hyphens, and underscores',
  ENVIRONMENT_INVALID: 'Invalid environment. Must be one of: development, staging, production, test',
  VERSION_INVALID: 'Invalid version format. Must follow semantic versioning (e.g., 1.0.0)',
  STATUS_INVALID: 'Invalid status. Must be one of: active, inactive, maintenance, degraded',
  FEATURE_NAME_REQUIRED: 'Feature name is required',
  FEATURE_NAME_PATTERN: 'Feature name must be in snake_case or kebab-case format',
  MODULE_NAME_REQUIRED: 'Module name is required',
  MODULE_NAME_PATTERN: 'Module name must be in kebab-case format',
  ROLLOUT_PERCENTAGE_INVALID: 'Rollout percentage must be between 0 and 100',
  DATE_INVALID: 'Invalid date format. Use ISO 8601 format',
  DATE_FUTURE_REQUIRED: 'Date must be in the future',
  DATE_RANGE_INVALID: 'End date must be after start date',
  METADATA_INVALID: 'Metadata must be a valid JSON object',
  TAGS_INVALID: 'Tags must be an array of strings',
  DEPLOYMENT_VERSION_REQUIRED: 'Deployment version is required',
  DEPLOYMENT_ENVIRONMENT_REQUIRED: 'Deployment environment is required',
  TIME_RANGE_INVALID: 'Invalid time range format',
  PAGE_SIZE_INVALID: 'Page size must be between 1 and 100',
  SORT_ORDER_INVALID: 'Sort order must be either asc or desc'
};

/**
 * Common validation schemas
 */
const commonSchemas = {
  platformId: Joi.string()
    .pattern(/^[a-zA-Z0-9]{8,32}$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.PLATFORM_ID_INVALID,
      'any.required': VALIDATION_MESSAGES.PLATFORM_ID_REQUIRED
    }),

  platformName: Joi.string()
    .min(3)
    .max(100)
    .pattern(/^[a-zA-Z0-9\s\-_]+$/)
    .required()
    .messages({
      'string.min': VALIDATION_MESSAGES.PLATFORM_NAME_LENGTH,
      'string.max': VALIDATION_MESSAGES.PLATFORM_NAME_LENGTH,
      'string.pattern.base': VALIDATION_MESSAGES.PLATFORM_NAME_PATTERN,
      'any.required': VALIDATION_MESSAGES.PLATFORM_NAME_REQUIRED
    }),

  environment: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .messages({
      'any.only': VALIDATION_MESSAGES.ENVIRONMENT_INVALID
    }),

  version: Joi.string()
    .pattern(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/)
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.VERSION_INVALID
    }),

  status: Joi.string()
    .valid('active', 'inactive', 'maintenance', 'degraded', 'unknown')
    .messages({
      'any.only': VALIDATION_MESSAGES.STATUS_INVALID
    }),

  featureName: Joi.string()
    .pattern(/^[a-z][a-z0-9]*(?:[_\-][a-z0-9]+)*$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.FEATURE_NAME_PATTERN,
      'any.required': VALIDATION_MESSAGES.FEATURE_NAME_REQUIRED
    }),

  moduleName: Joi.string()
    .pattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.MODULE_NAME_PATTERN,
      'any.required': VALIDATION_MESSAGES.MODULE_NAME_REQUIRED
    }),

  rolloutPercentage: Joi.number()
    .min(0)
    .max(100)
    .messages({
      'number.min': VALIDATION_MESSAGES.ROLLOUT_PERCENTAGE_INVALID,
      'number.max': VALIDATION_MESSAGES.ROLLOUT_PERCENTAGE_INVALID
    }),

  metadata: Joi.object()
    .default({})
    .messages({
      'object.base': VALIDATION_MESSAGES.METADATA_INVALID
    }),

  tags: Joi.array()
    .items(Joi.string().min(1).max(50))
    .max(20)
    .messages({
      'array.base': VALIDATION_MESSAGES.TAGS_INVALID
    }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().default('-createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  dateRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate'))
  }).messages({
    'date.greater': VALIDATION_MESSAGES.DATE_RANGE_INVALID
  }),

  timeRange: Joi.string()
    .valid('1h', '6h', '12h', '24h', '7d', '30d', '90d', 'custom')
    .messages({
      'any.only': VALIDATION_MESSAGES.TIME_RANGE_INVALID
    })
};

/**
 * Platform configuration validators
 */
const platformConfigurationValidators = {
  /**
   * Validate get platform configuration request
   */
  getPlatformConfiguration: {
    query: Joi.object({
      environment: commonSchemas.environment,
      includeInactive: Joi.boolean().default(false),
      noCache: Joi.boolean().default(false),
      includeMetrics: Joi.boolean().default(false),
      includeSecrets: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate create platform configuration request
   */
  createPlatformConfiguration: {
    body: Joi.object({
      platformName: commonSchemas.platformName,
      description: Joi.string().max(500),
      environment: commonSchemas.environment.required(),
      version: commonSchemas.version.required(),
      status: commonSchemas.status.default('active'),
      configuration: Joi.object({
        database: Joi.object({
          host: Joi.string().hostname().required(),
          port: Joi.number().port().required(),
          name: Joi.string().required(),
          poolSize: Joi.number().min(1).max(100).default(10),
          timeout: Joi.number().min(1000).max(60000).default(5000)
        }),
        cache: Joi.object({
          enabled: Joi.boolean().default(true),
          ttl: Joi.number().min(0).max(86400).default(300),
          maxSize: Joi.number().min(1).max(10000).default(1000)
        }),
        security: Joi.object({
          encryptionEnabled: Joi.boolean().default(true),
          tlsVersion: Joi.string().valid('1.2', '1.3').default('1.3'),
          corsEnabled: Joi.boolean().default(true),
          allowedOrigins: Joi.array().items(Joi.string().uri())
        }),
        monitoring: Joi.object({
          enabled: Joi.boolean().default(true),
          metricsInterval: Joi.number().min(10).max(3600).default(60),
          logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
          alertingEnabled: Joi.boolean().default(true)
        }),
        features: Joi.object().pattern(
          Joi.string(),
          Joi.object({
            enabled: Joi.boolean(),
            rolloutPercentage: commonSchemas.rolloutPercentage,
            metadata: commonSchemas.metadata
          })
        )
      }).required(),
      metadata: commonSchemas.metadata,
      tags: commonSchemas.tags
    }).unknown(false)
  },

  /**
   * Validate update platform configuration request
   */
  updatePlatformConfiguration: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      platformName: Joi.string().min(3).max(100).pattern(/^[a-zA-Z0-9\s\-_]+$/),
      description: Joi.string().max(500),
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      status: commonSchemas.status,
      configuration: Joi.object({
        database: Joi.object({
          host: Joi.string().hostname(),
          port: Joi.number().port(),
          name: Joi.string(),
          poolSize: Joi.number().min(1).max(100),
          timeout: Joi.number().min(1000).max(60000)
        }),
        cache: Joi.object({
          enabled: Joi.boolean(),
          ttl: Joi.number().min(0).max(86400),
          maxSize: Joi.number().min(1).max(10000)
        }),
        security: Joi.object({
          encryptionEnabled: Joi.boolean(),
          tlsVersion: Joi.string().valid('1.2', '1.3'),
          corsEnabled: Joi.boolean(),
          allowedOrigins: Joi.array().items(Joi.string().uri())
        }),
        monitoring: Joi.object({
          enabled: Joi.boolean(),
          metricsInterval: Joi.number().min(10).max(3600),
          logLevel: Joi.string().valid('error', 'warn', 'info', 'debug'),
          alertingEnabled: Joi.boolean()
        }),
        features: Joi.object().pattern(
          Joi.string(),
          Joi.object({
            enabled: Joi.boolean(),
            rolloutPercentage: commonSchemas.rolloutPercentage,
            metadata: commonSchemas.metadata
          })
        )
      }),
      metadata: commonSchemas.metadata,
      tags: commonSchemas.tags,
      reason: Joi.string().max(500).required()
    }).unknown(false).min(2) // At least one field to update plus reason
  },

  /**
   * Validate update platform status request
   */
  updatePlatformStatus: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      status: commonSchemas.status.required(),
      reason: Joi.string().max(500).required(),
      effectiveFrom: Joi.date().iso(),
      effectiveUntil: Joi.date().iso().greater(Joi.ref('effectiveFrom')),
      notifyUsers: Joi.boolean().default(true),
      metadata: commonSchemas.metadata
    }).unknown(false)
  },

  /**
   * Validate get platform statistics request
   */
  getPlatformStatistics: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      timeRange: commonSchemas.timeRange.default('24h'),
      startDate: Joi.when('timeRange', {
        is: 'custom',
        then: Joi.date().iso().required(),
        otherwise: Joi.date().iso()
      }),
      endDate: Joi.when('timeRange', {
        is: 'custom',
        then: Joi.date().iso().greater(Joi.ref('startDate')).required(),
        otherwise: Joi.date().iso()
      }),
      metrics: Joi.array().items(
        Joi.string().valid(
          'uptime',
          'performance',
          'errors',
          'requests',
          'users',
          'resources',
          'costs'
        )
      ),
      groupBy: Joi.string().valid('hour', 'day', 'week', 'month'),
      includeComparison: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get platform issues request
   */
  getPlatformIssues: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      severity: Joi.string().valid('critical', 'high', 'medium', 'low'),
      status: Joi.string().valid('open', 'investigating', 'resolved', 'closed'),
      category: Joi.string().valid('performance', 'security', 'availability', 'functionality'),
      ...commonSchemas.pagination,
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso()
    }).unknown(false)
  },

  /**
   * Validate perform health check request
   */
  performHealthCheck: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      checkTypes: Joi.array().items(
        Joi.string().valid(
          'connectivity',
          'database',
          'cache',
          'storage',
          'services',
          'dependencies',
          'certificates',
          'performance'
        )
      ).min(1).default(['connectivity', 'database', 'services']),
      depth: Joi.string().valid('basic', 'standard', 'comprehensive').default('standard'),
      timeout: Joi.number().min(1000).max(30000).default(5000),
      async: Joi.boolean().default(false)
    }).unknown(false)
  }
};

/**
 * Feature flag management validators
 */
const featureFlagValidators = {
  /**
   * Validate get all feature flags request
   */
  getAllFeatureFlags: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      status: Joi.string().valid('enabled', 'disabled', 'partial'),
      search: Joi.string().max(100),
      tags: Joi.array().items(Joi.string()),
      includeMetadata: Joi.boolean().default(true),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate manage feature flag request
   */
  manageFeatureFlag: {
    params: Joi.object({
      platformId: commonSchemas.platformId,
      featureName: commonSchemas.featureName
    }),
    body: Joi.object({
      action: Joi.string().valid('enable', 'disable', 'toggle').required(),
      rolloutPercentage: commonSchemas.rolloutPercentage,
      enabledTenants: Joi.array().items(Joi.string()),
      disabledTenants: Joi.array().items(Joi.string()),
      schedule: Joi.object({
        enableAt: Joi.date().iso().greater('now'),
        disableAt: Joi.date().iso().greater(Joi.ref('enableAt'))
      }),
      conditions: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('user', 'tenant', 'environment', 'custom').required(),
          operator: Joi.string().valid('equals', 'contains', 'regex', 'in', 'not_in').required(),
          value: Joi.alternatives().try(
            Joi.string(),
            Joi.number(),
            Joi.boolean(),
            Joi.array()
          ).required()
        })
      ),
      metadata: commonSchemas.metadata,
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate bulk update feature flags request
   */
  bulkUpdateFeatureFlags: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      action: Joi.string().valid('enable', 'disable', 'reset').required(),
      features: Joi.array().items(
        Joi.object({
          name: commonSchemas.featureName,
          enabled: Joi.boolean(),
          rolloutPercentage: commonSchemas.rolloutPercentage,
          metadata: commonSchemas.metadata
        })
      ).min(1).max(50).required(),
      applyToEnvironments: Joi.array().items(commonSchemas.environment),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate get feature flags for tenant request
   */
  getFeatureFlagsForTenant: {
    params: Joi.object({
      tenantId: Joi.string().pattern(/^[a-zA-Z0-9\-_]+$/).required()
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      includeDisabled: Joi.boolean().default(false),
      includeMetadata: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate search feature flags request
   */
  searchFeatureFlags: {
    query: Joi.object({
      query: Joi.string().min(2).max(100).required(),
      searchIn: Joi.array().items(
        Joi.string().valid('name', 'description', 'tags', 'metadata')
      ).default(['name', 'description']),
      environment: commonSchemas.environment,
      status: Joi.string().valid('enabled', 'disabled', 'partial'),
      modifiedAfter: Joi.date().iso(),
      modifiedBefore: Joi.date().iso(),
      ...commonSchemas.pagination
    }).unknown(false)
  }
};

/**
 * System module validators
 */
const systemModuleValidators = {
  /**
   * Validate get system modules request
   */
  getSystemModules: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      status: Joi.string().valid('enabled', 'disabled', 'deprecated'),
      category: Joi.string().valid('core', 'optional', 'experimental', 'deprecated'),
      includeMetrics: Joi.boolean().default(false),
      includeConfig: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate update system module request
   */
  updateSystemModule: {
    params: Joi.object({
      platformId: commonSchemas.platformId,
      moduleName: commonSchemas.moduleName
    }),
    body: Joi.object({
      enabled: Joi.boolean(),
      version: commonSchemas.version,
      configuration: Joi.object().default({}),
      dependencies: Joi.array().items(
        Joi.object({
          module: commonSchemas.moduleName,
          version: commonSchemas.version,
          required: Joi.boolean().default(true)
        })
      ),
      resources: Joi.object({
        cpu: Joi.object({
          request: Joi.string().pattern(/^\d+m?$/),
          limit: Joi.string().pattern(/^\d+m?$/)
        }),
        memory: Joi.object({
          request: Joi.string().pattern(/^\d+[KMG]i?$/),
          limit: Joi.string().pattern(/^\d+[KMG]i?$/)
        }),
        storage: Joi.object({
          size: Joi.string().pattern(/^\d+[KMG]i?$/),
          type: Joi.string().valid('ssd', 'hdd', 'network')
        })
      }),
      healthCheck: Joi.object({
        enabled: Joi.boolean().default(true),
        endpoint: Joi.string().uri(),
        interval: Joi.number().min(10).max(3600),
        timeout: Joi.number().min(1).max(60),
        retries: Joi.number().min(0).max(10)
      }),
      metadata: commonSchemas.metadata,
      reason: Joi.string().max(500).required()
    }).unknown(false).min(2) // At least one field to update plus reason
  }
};

/**
 * Deployment management validators
 */
const deploymentValidators = {
  /**
   * Validate record deployment request
   */
  recordDeployment: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      version: commonSchemas.version.required(),
      environment: commonSchemas.environment.required(),
      deploymentType: Joi.string().valid(
        'rolling',
        'blue-green',
        'canary',
        'recreate',
        'a-b-testing'
      ).required(),
      components: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          version: commonSchemas.version.required(),
          status: Joi.string().valid('pending', 'deploying', 'deployed', 'failed').required(),
          deployedAt: Joi.date().iso()
        })
      ).min(1).required(),
      initiatedBy: Joi.string().required(),
      approvedBy: Joi.array().items(Joi.string()),
      rollbackVersion: commonSchemas.version,
      configuration: Joi.object({
        autoRollback: Joi.boolean().default(true),
        healthCheckEnabled: Joi.boolean().default(true),
        canaryPercentage: Joi.number().min(0).max(100),
        deploymentStrategy: Joi.object({
          maxSurge: Joi.number().min(0).max(100),
          maxUnavailable: Joi.number().min(0).max(100)
        })
      }),
      metadata: commonSchemas.metadata,
      tags: commonSchemas.tags
    }).unknown(false)
  },

  /**
   * Validate get deployment history request
   */
  getDeploymentHistory: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      status: Joi.string().valid('pending', 'in-progress', 'completed', 'failed', 'rolled-back'),
      deploymentType: Joi.string().valid('rolling', 'blue-green', 'canary', 'recreate', 'a-b-testing'),
      initiatedBy: Joi.string(),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      includeMetrics: Joi.boolean().default(false),
      includeChangelog: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  }
};

/**
 * Platform administration validators
 */
const platformAdministrationValidators = {
  /**
   * Validate platform backup request
   */
  createPlatformBackup: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      backupType: Joi.string().valid('full', 'incremental', 'differential').required(),
      components: Joi.array().items(
        Joi.string().valid('configuration', 'database', 'files', 'logs', 'metrics')
      ).min(1).required(),
      compression: Joi.boolean().default(true),
      encryption: Joi.boolean().default(true),
      retentionDays: Joi.number().min(1).max(365).default(30),
      destination: Joi.object({
        type: Joi.string().valid('local', 's3', 'azure', 'gcp').required(),
        path: Joi.string().required(),
        credentials: Joi.object().when('type', {
          not: 'local',
          then: Joi.object({
            accessKey: Joi.string().required(),
            secretKey: Joi.string().required(),
            region: Joi.string()
          })
        })
      }),
      schedule: Joi.object({
        frequency: Joi.string().valid('once', 'daily', 'weekly', 'monthly'),
        time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
        dayOfWeek: Joi.when('frequency', {
          is: 'weekly',
          then: Joi.number().min(0).max(6).required()
        }),
        dayOfMonth: Joi.when('frequency', {
          is: 'monthly',
          then: Joi.number().min(1).max(31).required()
        })
      }),
      metadata: commonSchemas.metadata
    }).unknown(false)
  },

  /**
   * Validate platform restore request
   */
  restorePlatformBackup: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      backupId: Joi.string().required(),
      restoreType: Joi.string().valid('full', 'selective').required(),
      components: Joi.when('restoreType', {
        is: 'selective',
        then: Joi.array().items(
          Joi.string().valid('configuration', 'database', 'files', 'logs', 'metrics')
        ).min(1).required(),
        otherwise: Joi.forbidden()
      }),
      targetEnvironment: commonSchemas.environment,
      validateBeforeRestore: Joi.boolean().default(true),
      stopServicesBeforeRestore: Joi.boolean().default(true),
      createBackupBeforeRestore: Joi.boolean().default(true),
      reason: Joi.string().max(500).required(),
      approvedBy: Joi.string().required()
    }).unknown(false)
  },

  /**
   * Validate platform migration request
   */
  migratePlatform: {
    body: Joi.object({
      sourceEnvironment: commonSchemas.environment.required(),
      targetEnvironment: commonSchemas.environment.required(),
      migrationType: Joi.string().valid('schema', 'data', 'full').required(),
      components: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          migrateSchema: Joi.boolean().default(true),
          migrateData: Joi.boolean().default(true),
          transformations: Joi.array().items(
            Joi.object({
              field: Joi.string().required(),
              transformation: Joi.string().valid('rename', 'convert', 'remove', 'add').required(),
              parameters: Joi.object()
            })
          )
        })
      ).min(1).required(),
      validationRules: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('schema', 'data', 'integrity', 'performance').required(),
          enabled: Joi.boolean().default(true),
          threshold: Joi.number()
        })
      ),
      rollbackOnError: Joi.boolean().default(true),
      dryRun: Joi.boolean().default(false),
      metadata: commonSchemas.metadata
    }).unknown(false)
  },

  /**
   * Validate platform audit request
   */
  auditPlatform: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    query: Joi.object({
      auditType: Joi.string().valid('security', 'compliance', 'performance', 'configuration', 'all'),
      depth: Joi.string().valid('basic', 'standard', 'comprehensive').default('standard'),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      includeRecommendations: Joi.boolean().default(true),
      generateReport: Joi.boolean().default(true),
      reportFormat: Joi.string().valid('json', 'pdf', 'html', 'csv').default('json')
    }).unknown(false)
  }
};

/**
 * Platform monitoring validators
 */
const platformMonitoringValidators = {
  /**
   * Validate set monitoring configuration request
   */
  setMonitoringConfiguration: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      enabled: Joi.boolean().default(true),
      metricsCollection: Joi.object({
        enabled: Joi.boolean().default(true),
        interval: Joi.number().min(10).max(3600).default(60),
        retention: Joi.number().min(1).max(90).default(30),
        metrics: Joi.array().items(
          Joi.object({
            name: Joi.string().required(),
            enabled: Joi.boolean().default(true),
            threshold: Joi.object({
              warning: Joi.number(),
              critical: Joi.number()
            })
          })
        )
      }),
      logging: Joi.object({
        enabled: Joi.boolean().default(true),
        level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
        retention: Joi.number().min(1).max(365).default(7),
        destinations: Joi.array().items(
          Joi.object({
            type: Joi.string().valid('file', 'database', 'elasticsearch', 'cloudwatch').required(),
            configuration: Joi.object()
          })
        )
      }),
      alerting: Joi.object({
        enabled: Joi.boolean().default(true),
        channels: Joi.array().items(
          Joi.object({
            type: Joi.string().valid('email', 'sms', 'slack', 'webhook', 'pagerduty').required(),
            configuration: Joi.object(),
            severity: Joi.array().items(
              Joi.string().valid('critical', 'high', 'medium', 'low')
            )
          })
        ),
        rules: Joi.array().items(
          Joi.object({
            name: Joi.string().required(),
            condition: Joi.string().required(),
            severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
            cooldown: Joi.number().min(0).max(3600).default(300)
          })
        )
      }),
      tracing: Joi.object({
        enabled: Joi.boolean().default(false),
        samplingRate: Joi.number().min(0).max(1).default(0.1),
        backend: Joi.string().valid('jaeger', 'zipkin', 'datadog', 'newrelic')
      })
    }).unknown(false)
  },

  /**
   * Validate create alert rule request
   */
  createAlertRule: {
    params: Joi.object({
      platformId: commonSchemas.platformId
    }),
    body: Joi.object({
      name: Joi.string().min(3).max(100).required(),
      description: Joi.string().max(500),
      enabled: Joi.boolean().default(true),
      metric: Joi.string().required(),
      condition: Joi.object({
        operator: Joi.string().valid('gt', 'gte', 'lt', 'lte', 'eq', 'neq').required(),
        threshold: Joi.number().required(),
        duration: Joi.number().min(0).max(3600).default(60),
        aggregation: Joi.string().valid('avg', 'sum', 'min', 'max', 'count').default('avg')
      }).required(),
      severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('notify', 'scale', 'restart', 'custom').required(),
          configuration: Joi.object()
        })
      ).min(1).required(),
      cooldown: Joi.number().min(0).max(3600).default(300),
      schedule: Joi.object({
        activeHours: Joi.object({
          start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
          end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        }),
        activeDays: Joi.array().items(Joi.number().min(0).max(6)),
        timezone: Joi.string().default('UTC')
      }),
      metadata: commonSchemas.metadata
    }).unknown(false)
  }
};

/**
 * Combined platform validators export
 */
const platformValidators = {
  ...platformConfigurationValidators,
  ...featureFlagValidators,
  ...systemModuleValidators,
  ...deploymentValidators,
  ...platformAdministrationValidators,
  ...platformMonitoringValidators
};

/**
 * Validation error handler
 */
const handleValidationError = (error, req, res) => {
  logger.warn('Platform validation error', {
    path: req.path,
    method: req.method,
    error: error.details,
    body: req.body,
    query: req.query,
    params: req.params
  });

  const errors = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    type: detail.type
  }));

  return res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      details: errors
    }
  });
};

/**
 * Validation middleware factory
 */
const createValidator = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    };

    const toValidate = {};

    // Validate params if schema exists
    if (schema.params) {
      const { error: paramsError, value: paramsValue } = schema.params.validate(
        req.params,
        validationOptions
      );
      if (paramsError) {
        return handleValidationError(paramsError, req, res);
      }
      req.params = paramsValue;
    }

    // Validate query if schema exists
    if (schema.query) {
      const { error: queryError, value: queryValue } = schema.query.validate(
        req.query,
        validationOptions
      );
      if (queryError) {
        return handleValidationError(queryError, req, res);
      }
      req.query = queryValue;
    }

    // Validate body if schema exists
    if (schema.body) {
      const { error: bodyError, value: bodyValue } = schema.body.validate(
        req.body,
        validationOptions
      );
      if (bodyError) {
        return handleValidationError(bodyError, req, res);
      }
      req.body = bodyValue;
    }

    next();
  };
};

// Export validators
module.exports = {
  platformValidators,
  createValidator,
  handleValidationError,
  commonSchemas,
  VALIDATION_MESSAGES
};