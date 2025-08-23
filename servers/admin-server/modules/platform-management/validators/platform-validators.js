'use strict';

/**
 * @fileoverview Platform management validation rules and schemas - FIXED VERSION
 * @module servers/admin-server/modules/platform-management/validators/platform-validators
 * @requires joi
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/logger
 */

const Joi = require('joi');
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
  DATE_INVALID: 'Invalid date format',
  METADATA_INVALID: 'Metadata must be a valid object',
  TAGS_INVALID: 'Tags must be an array of strings',
  DATE_RANGE_INVALID: 'End date must be after start date',
  TIME_RANGE_INVALID: 'Invalid time range specified'
};

/**
 * FIXED: Common schemas defined as Joi schema fragments, not full schemas
 * This prevents the "Schema can only contain plain objects" error
 */
const commonSchemas = {
  platformId: Joi.string()
    .pattern(/^platform-[a-zA-Z0-9]{8,32}$/)
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
    .pattern(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+)?$/)
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

  // FIXED: Define these as basic Joi types, not as references
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
 * FIXED: Platform configuration validators with corrected schema references
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
        // FIXED: Instead of using schema references, define the structure directly
        features: Joi.object().pattern(
          Joi.string(),
          Joi.object({
            enabled: Joi.boolean(),
            rolloutPercentage: Joi.number().min(0).max(100), // Direct definition instead of reference
            metadata: Joi.object().default({}) // Direct definition instead of reference
          })
        )
      }).required(),
      metadata: Joi.object().default({}), // Direct definition instead of reference
      tags: Joi.array().items(Joi.string().min(1).max(50)).max(20) // Direct definition instead of reference
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
        // FIXED: Direct structure definition to avoid schema reference issues
        features: Joi.object().pattern(
          Joi.string(),
          Joi.object({
            enabled: Joi.boolean(),
            rolloutPercentage: Joi.number().min(0).max(100),
            metadata: Joi.object().default({})
          })
        )
      }),
      metadata: Joi.object().default({}),
      tags: Joi.array().items(Joi.string().min(1).max(50)).max(20),
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
      metadata: Joi.object().default({})
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
      category: Joi.string().valid('performance', 'security', 'availability', 'configuration'),
      assignedTo: Joi.string(),
      createdAfter: Joi.date().iso(),
      createdBefore: Joi.date().iso(),
      ...commonSchemas.pagination
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
        Joi.string().valid('connectivity', 'performance', 'security', 'dependencies', 'resources')
      ).default(['connectivity', 'performance']),
      includeDetails: Joi.boolean().default(false),
      timeout: Joi.number().min(1000).max(300000).default(30000)
    }).unknown(false)
  }
};

/**
 * Feature flag validators
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
      status: Joi.string().valid('enabled', 'disabled', 'testing'),
      category: Joi.string(),
      search: Joi.string().max(100),
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
      enabled: Joi.boolean().required(),
      rolloutPercentage: Joi.number().min(0).max(100).default(100),
      targetAudience: Joi.array().items(Joi.string()),
      conditions: Joi.object(),
      metadata: Joi.object().default({}),
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
      features: Joi.array().items(
        Joi.object({
          name: commonSchemas.featureName,
          enabled: Joi.boolean().required(),
          rolloutPercentage: Joi.number().min(0).max(100).default(100),
          metadata: Joi.object().default({})
        })
      ).min(1).max(50).required(),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate get feature flags for tenant request
   */
  getFeatureFlagsForTenant: {
    params: Joi.object({
      tenantId: Joi.string().required()
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      activeOnly: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate search feature flags request
   */
  searchFeatureFlags: {
    query: Joi.object({
      query: Joi.string().min(2).max(100).required(),
      platforms: Joi.array().items(Joi.string()),
      environments: Joi.array().items(commonSchemas.environment),
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
      status: Joi.string().valid('active', 'inactive', 'deprecated'),
      category: Joi.string(),
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
      version: commonSchemas.version,
      status: Joi.string().valid('active', 'inactive', 'deprecated'),
      configuration: Joi.object(),
      dependencies: Joi.array().items(Joi.string()),
      metadata: Joi.object().default({}),
      reason: Joi.string().max(500).required()
    }).unknown(false).min(2) // At least one field to update plus reason
  }
};

/**
 * Deployment validators
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
      deploymentType: Joi.string().valid('release', 'hotfix', 'rollback', 'feature').required(),
      changes: Joi.array().items(Joi.string()).required(),
      deployedBy: Joi.string().required(),
      deploymentNotes: Joi.string().max(1000),
      rollbackPlan: Joi.string().max(1000),
      metadata: Joi.object().default({})
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
      deploymentType: Joi.string().valid('release', 'hotfix', 'rollback', 'feature'),
      deployedBy: Joi.string(),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      ...commonSchemas.pagination
    }).unknown(false)
  }
};

/**
 * Combined platform validators
 */
const platformValidators = {
  ...platformConfigurationValidators,
  ...featureFlagValidators,
  ...systemModuleValidators,
  ...deploymentValidators
};

/**
 * FIXED: Validation error handler
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
 * FIXED: Validation middleware factory
 */
const createValidator = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    };

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