'use strict';

/**
 * @fileoverview Configuration management validation rules and schemas
 * @module servers/admin-server/modules/platform-management/validators/configuration-validators
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
 * Custom validation messages for configuration operations
 */
const VALIDATION_MESSAGES = {
  CONFIG_ID_REQUIRED: 'Configuration ID is required',
  CONFIG_ID_INVALID: 'Invalid configuration ID format',
  CONFIG_NAME_REQUIRED: 'Configuration name is required',
  CONFIG_NAME_PATTERN: 'Configuration name must contain only letters, numbers, hyphens, and underscores',
  CONFIG_KEY_REQUIRED: 'Configuration key is required',
  CONFIG_KEY_PATTERN: 'Configuration key must be in dot notation format (e.g., app.feature.setting)',
  CONFIG_VALUE_REQUIRED: 'Configuration value is required',
  CONFIG_TYPE_INVALID: 'Invalid configuration type',
  ENVIRONMENT_INVALID: 'Invalid environment specified',
  VERSION_INVALID: 'Invalid version format',
  SCHEMA_INVALID: 'Invalid schema definition',
  LOCK_REASON_REQUIRED: 'Lock reason is required when locking configuration',
  ROLLBACK_VERSION_REQUIRED: 'Target version is required for rollback',
  IMPORT_FORMAT_INVALID: 'Invalid import format',
  EXPORT_FORMAT_INVALID: 'Invalid export format',
  TEMPLATE_ID_REQUIRED: 'Template ID is required',
  WATCHER_ID_REQUIRED: 'Watcher ID is required',
  MIGRATION_ID_REQUIRED: 'Migration ID is required',
  BACKUP_ID_REQUIRED: 'Backup ID is required',
  ENCRYPTION_KEY_INVALID: 'Invalid encryption key format',
  PERMISSION_LEVEL_INVALID: 'Invalid permission level',
  SEARCH_QUERY_TOO_SHORT: 'Search query must be at least 2 characters',
  DATE_RANGE_INVALID: 'End date must be after start date',
  MAX_VALUES_EXCEEDED: 'Maximum number of configuration values exceeded',
  CIRCULAR_DEPENDENCY: 'Circular dependency detected in configuration'
};

/**
 * Common validation schemas for configuration operations
 */
const commonSchemas = {
  configId: Joi.string()
    .pattern(/^cfg-[a-zA-Z0-9]{8,32}$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.CONFIG_ID_INVALID,
      'any.required': VALIDATION_MESSAGES.CONFIG_ID_REQUIRED
    }),

  configName: Joi.string()
    .min(3)
    .max(100)
    .pattern(/^[a-zA-Z0-9\-_]+$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.CONFIG_NAME_PATTERN,
      'any.required': VALIDATION_MESSAGES.CONFIG_NAME_REQUIRED
    }),

  configKey: Joi.string()
    .pattern(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.CONFIG_KEY_PATTERN,
      'any.required': VALIDATION_MESSAGES.CONFIG_KEY_REQUIRED
    }),

  configValue: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.object(),
    Joi.array()
  ),

  environment: Joi.string()
    .valid('development', 'staging', 'production', 'test', 'local')
    .messages({
      'any.only': VALIDATION_MESSAGES.ENVIRONMENT_INVALID
    }),

  configType: Joi.string()
    .valid('string', 'number', 'boolean', 'object', 'array', 'json', 'yaml', 'xml')
    .messages({
      'any.only': VALIDATION_MESSAGES.CONFIG_TYPE_INVALID
    }),

  version: Joi.string()
    .pattern(/^v?\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/)
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.VERSION_INVALID
    }),

  metadata: Joi.object()
    .default({}),

  tags: Joi.array()
    .items(Joi.string().min(1).max(50))
    .max(20),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().default('-updatedAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  timeRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate'))
  }).messages({
    'date.greater': VALIDATION_MESSAGES.DATE_RANGE_INVALID
  }),

  schema: Joi.object({
    type: Joi.string().valid('json-schema', 'joi', 'yup', 'custom').required(),
    definition: Joi.alternatives().conditional('type', {
      switch: [
        { is: 'json-schema', then: Joi.object().required() },
        { is: 'joi', then: Joi.string().required() },
        { is: 'yup', then: Joi.string().required() },
        { is: 'custom', then: Joi.object().required() }
      ]
    }),
    version: Joi.string().default('1.0.0'),
    strict: Joi.boolean().default(true)
  })
};

/**
 * Configuration CRUD operation validators
 */
const configurationCrudValidators = {
  /**
   * Validate create configuration request
   */
  createConfiguration: {
    body: Joi.object({
      name: commonSchemas.configName,
      description: Joi.string().max(500),
      type: commonSchemas.configType.default('json'),
      environment: commonSchemas.environment.required(),
      namespace: Joi.string().pattern(/^[a-z][a-z0-9\-]*$/).max(64),
      values: Joi.object().pattern(
        commonSchemas.configKey,
        commonSchemas.configValue
      ).required(),
      schema: commonSchemas.schema,
      validation: Joi.object({
        enabled: Joi.boolean().default(true),
        rules: Joi.array().items(
          Joi.object({
            field: Joi.string().required(),
            type: Joi.string().required(),
            constraints: Joi.object()
          })
        )
      }),
      encryption: Joi.object({
        enabled: Joi.boolean().default(false),
        fields: Joi.array().items(Joi.string()),
        algorithm: Joi.string().valid('aes-256-gcm', 'aes-256-cbc').default('aes-256-gcm')
      }),
      permissions: Joi.object({
        read: Joi.array().items(Joi.string()),
        write: Joi.array().items(Joi.string()),
        delete: Joi.array().items(Joi.string()),
        admin: Joi.array().items(Joi.string())
      }),
      metadata: commonSchemas.metadata,
      tags: commonSchemas.tags
    }).unknown(false)
  },

  /**
   * Validate list configurations request
   */
  listConfigurations: {
    query: Joi.object({
      environment: commonSchemas.environment,
      namespace: Joi.string(),
      type: commonSchemas.configType,
      tags: Joi.array().items(Joi.string()),
      search: Joi.string().min(2).max(100),
      includeValues: Joi.boolean().default(false),
      includeSchema: Joi.boolean().default(false),
      includeMetadata: Joi.boolean().default(true),
      activeOnly: Joi.boolean().default(true),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get configuration request
   */
  getConfiguration: {
    params: Joi.object({
      identifier: Joi.alternatives().try(
        commonSchemas.configId,
        commonSchemas.configName
      ).required()
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      includeValues: Joi.boolean().default(true),
      includeSchema: Joi.boolean().default(false),
      includeHistory: Joi.boolean().default(false),
      decrypt: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate update configuration request
   */
  updateConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      name: Joi.string().min(3).max(100).pattern(/^[a-zA-Z0-9\-_]+$/),
      description: Joi.string().max(500),
      type: commonSchemas.configType,
      schema: commonSchemas.schema,
      validation: Joi.object({
        enabled: Joi.boolean(),
        rules: Joi.array().items(
          Joi.object({
            field: Joi.string().required(),
            type: Joi.string().required(),
            constraints: Joi.object()
          })
        )
      }),
      encryption: Joi.object({
        enabled: Joi.boolean(),
        fields: Joi.array().items(Joi.string()),
        algorithm: Joi.string().valid('aes-256-gcm', 'aes-256-cbc')
      }),
      permissions: Joi.object({
        read: Joi.array().items(Joi.string()),
        write: Joi.array().items(Joi.string()),
        delete: Joi.array().items(Joi.string()),
        admin: Joi.array().items(Joi.string())
      }),
      metadata: commonSchemas.metadata,
      tags: commonSchemas.tags,
      reason: Joi.string().max(500).required()
    }).unknown(false).min(2) // At least one field to update plus reason
  },

  /**
   * Validate delete configuration request
   */
  deleteConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      confirmation: Joi.string().valid('DELETE').required(),
      reason: Joi.string().max(500).required(),
      force: Joi.boolean().default(false),
      cascade: Joi.boolean().default(false)
    }).unknown(false)
  }
};

/**
 * Configuration value management validators
 */
const configurationValueValidators = {
  /**
   * Validate get configuration value request
   */
  getConfigurationValue: {
    params: Joi.object({
      configId: commonSchemas.configId,
      key: commonSchemas.configKey
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      format: Joi.string().valid('json', 'text', 'yaml', 'xml').default('json'),
      decrypt: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get all configuration values request
   */
  getAllConfigurationValues: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      prefix: Joi.string(),
      decrypt: Joi.boolean().default(false),
      flatten: Joi.boolean().default(false),
      format: Joi.string().valid('json', 'yaml', 'properties', 'env').default('json')
    }).unknown(false)
  },

  /**
   * Validate set configuration value request
   */
  setConfigurationValue: {
    params: Joi.object({
      configId: commonSchemas.configId,
      key: commonSchemas.configKey
    }),
    body: Joi.object({
      value: commonSchemas.configValue.required(),
      type: commonSchemas.configType,
      description: Joi.string().max(255),
      encrypt: Joi.boolean().default(false),
      overwrite: Joi.boolean().default(true),
      validation: Joi.object({
        min: Joi.number(),
        max: Joi.number(),
        pattern: Joi.string(),
        enum: Joi.array(),
        required: Joi.boolean()
      }),
      metadata: commonSchemas.metadata,
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate update configuration values (batch) request
   */
  updateConfigurationValues: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      values: Joi.object()
        .pattern(commonSchemas.configKey, commonSchemas.configValue)
        .min(1)
        .max(100)
        .required(),
      operation: Joi.string().valid('merge', 'replace', 'patch').default('merge'),
      removeNull: Joi.boolean().default(false),
      validateSchema: Joi.boolean().default(true),
      atomic: Joi.boolean().default(true),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate delete configuration key request
   */
  deleteConfigurationKey: {
    params: Joi.object({
      configId: commonSchemas.configId,
      key: commonSchemas.configKey
    }),
    body: Joi.object({
      cascade: Joi.boolean().default(false),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate bulk delete keys request
   */
  bulkDeleteKeys: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      keys: Joi.array()
        .items(commonSchemas.configKey)
        .min(1)
        .max(50)
        .required(),
      cascade: Joi.boolean().default(false),
      atomic: Joi.boolean().default(true),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate search configuration values request
   */
  searchConfigurationValues: {
    query: Joi.object({
      query: Joi.string().min(2).max(100).required(),
      searchIn: Joi.array().items(
        Joi.string().valid('keys', 'values', 'descriptions', 'metadata')
      ).default(['keys', 'values']),
      environment: commonSchemas.environment,
      namespace: Joi.string(),
      type: commonSchemas.configType,
      caseSensitive: Joi.boolean().default(false),
      regex: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  }
};

/**
 * Configuration validation and testing validators
 */
const configurationValidationValidators = {
  /**
   * Validate configuration validation request
   */
  validateConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      values: Joi.object(),
      schema: commonSchemas.schema,
      strict: Joi.boolean().default(true),
      environment: commonSchemas.environment,
      checkDependencies: Joi.boolean().default(true),
      checkReferences: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate test configuration request
   */
  testConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      testType: Joi.string().valid('syntax', 'schema', 'connectivity', 'integration').required(),
      environment: commonSchemas.environment,
      targets: Joi.array().items(Joi.string()),
      timeout: Joi.number().min(1000).max(30000).default(5000),
      verbose: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate dry run configuration request
   */
  dryRunConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      changes: Joi.object().required(),
      environment: commonSchemas.environment.required(),
      simulateErrors: Joi.boolean().default(false),
      includeImpactAnalysis: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate compare configurations request
   */
  compareConfigurations: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      targetConfigId: commonSchemas.configId.required(),
      compareType: Joi.string().valid('values', 'schema', 'full').default('values'),
      ignoreKeys: Joi.array().items(Joi.string()),
      environment: commonSchemas.environment,
      format: Joi.string().valid('json', 'diff', 'side-by-side').default('json')
    }).unknown(false)
  },

  /**
   * Validate analyze configuration impact request
   */
  analyzeConfigurationImpact: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      changes: Joi.object().required(),
      analysisDepth: Joi.string().valid('shallow', 'deep', 'comprehensive').default('deep'),
      includeDownstream: Joi.boolean().default(true),
      includeUpstream: Joi.boolean().default(true),
      timeframe: Joi.string().valid('immediate', 'short-term', 'long-term').default('immediate')
    }).unknown(false)
  }
};

/**
 * Configuration locking and access control validators
 */
const configurationLockingValidators = {
  /**
   * Validate lock configuration request
   */
  lockConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      lockType: Joi.string().valid('read', 'write', 'full').required(),
      reason: Joi.string().max(500).required(),
      duration: Joi.number().min(60).max(86400),
      expiresAt: Joi.date().iso().greater('now'),
      allowedUsers: Joi.array().items(Joi.string()),
      force: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate unlock configuration request
   */
  unlockConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      reason: Joi.string().max(500).required(),
      force: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get lock status request
   */
  getLockStatus: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      includeHistory: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate set configuration permissions request
   */
  setConfigurationPermissions: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      permissions: Joi.object({
        read: Joi.array().items(
          Joi.object({
            principal: Joi.string().required(),
            type: Joi.string().valid('user', 'role', 'group').required(),
            conditions: Joi.object()
          })
        ),
        write: Joi.array().items(
          Joi.object({
            principal: Joi.string().required(),
            type: Joi.string().valid('user', 'role', 'group').required(),
            conditions: Joi.object()
          })
        ),
        delete: Joi.array().items(
          Joi.object({
            principal: Joi.string().required(),
            type: Joi.string().valid('user', 'role', 'group').required(),
            conditions: Joi.object()
          })
        ),
        admin: Joi.array().items(
          Joi.object({
            principal: Joi.string().required(),
            type: Joi.string().valid('user', 'role', 'group').required(),
            conditions: Joi.object()
          })
        )
      }).required(),
      inherit: Joi.boolean().default(true),
      override: Joi.boolean().default(false),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate get configuration permissions request
   */
  getConfigurationPermissions: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      effective: Joi.boolean().default(true),
      includeInherited: Joi.boolean().default(true)
    }).unknown(false)
  }
};

/**
 * Configuration version management validators
 */
const configurationVersionValidators = {
  /**
   * Validate get version history request
   */
  getVersionHistory: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      environment: commonSchemas.environment,
      limit: Joi.number().integer().min(1).max(100).default(20),
      includeChanges: Joi.boolean().default(false),
      includeAuthor: Joi.boolean().default(true),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso()
    }).unknown(false)
  },

  /**
   * Validate get version request
   */
  getVersion: {
    params: Joi.object({
      configId: commonSchemas.configId,
      version: commonSchemas.version
    }),
    query: Joi.object({
      includeValues: Joi.boolean().default(true),
      includeSchema: Joi.boolean().default(false),
      includeMetadata: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate get version changes request
   */
  getVersionChanges: {
    params: Joi.object({
      configId: commonSchemas.configId,
      version: commonSchemas.version
    }),
    query: Joi.object({
      format: Joi.string().valid('json', 'diff', 'summary').default('json'),
      includeUnchanged: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate compare versions request
   */
  compareVersions: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      from: commonSchemas.version.required(),
      to: commonSchemas.version.required(),
      format: Joi.string().valid('json', 'diff', 'side-by-side').default('json'),
      ignoreWhitespace: Joi.boolean().default(true),
      ignoreComments: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate rollback configuration request
   */
  rollbackConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      targetVersion: commonSchemas.version.required(),
      environment: commonSchemas.environment,
      preserveKeys: Joi.array().items(Joi.string()),
      skipKeys: Joi.array().items(Joi.string()),
      dryRun: Joi.boolean().default(false),
      reason: Joi.string().max(500).required(),
      approvedBy: Joi.string()
    }).unknown(false)
  },

  /**
   * Validate create version snapshot request
   */
  createVersionSnapshot: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      name: Joi.string().min(3).max(100),
      description: Joi.string().max(500),
      tag: Joi.string().pattern(/^[a-zA-Z0-9\-\.]+$/),
      environment: commonSchemas.environment,
      includeValues: Joi.boolean().default(true),
      includeSchema: Joi.boolean().default(true),
      metadata: commonSchemas.metadata
    }).unknown(false)
  },

  /**
   * Validate tag version request
   */
  tagVersion: {
    params: Joi.object({
      configId: commonSchemas.configId,
      version: commonSchemas.version
    }),
    body: Joi.object({
      tag: Joi.string().pattern(/^[a-zA-Z0-9\-\.]+$/).required(),
      description: Joi.string().max(255),
      force: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate promote version request
   */
  promoteVersion: {
    params: Joi.object({
      configId: commonSchemas.configId,
      version: commonSchemas.version
    }),
    body: Joi.object({
      targetEnvironment: commonSchemas.environment.required(),
      strategy: Joi.string().valid('immediate', 'canary', 'blue-green').default('immediate'),
      canaryPercentage: Joi.when('strategy', {
        is: 'canary',
        then: Joi.number().min(1).max(100).required()
      }),
      validationRequired: Joi.boolean().default(true),
      approvalRequired: Joi.boolean().default(true),
      rollbackOnFailure: Joi.boolean().default(true),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  }
};

/**
 * Configuration environment management validators
 */
const configurationEnvironmentValidators = {
  /**
   * Validate get configuration environments request
   */
  getConfigurationEnvironments: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      includeValues: Joi.boolean().default(false),
      includeStatistics: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate get environment configuration request
   */
  getEnvironmentConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId,
      environment: commonSchemas.environment
    }),
    query: Joi.object({
      version: commonSchemas.version,
      includeInherited: Joi.boolean().default(true),
      decrypt: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate set environment value request
   */
  setEnvironmentValue: {
    params: Joi.object({
      configId: commonSchemas.configId,
      environment: commonSchemas.environment,
      key: commonSchemas.configKey
    }),
    body: Joi.object({
      value: commonSchemas.configValue.required(),
      override: Joi.boolean().default(true),
      inherit: Joi.boolean().default(false),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate copy to environment request
   */
  copyToEnvironment: {
    params: Joi.object({
      configId: commonSchemas.configId,
      environment: commonSchemas.environment
    }),
    body: Joi.object({
      sourceEnvironment: commonSchemas.environment.required(),
      keys: Joi.array().items(Joi.string()),
      overwrite: Joi.boolean().default(false),
      transformations: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          transformation: Joi.string().valid('uppercase', 'lowercase', 'encrypt', 'decrypt', 'custom'),
          parameters: Joi.object()
        })
      ),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate sync configuration request
   */
  syncConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      sourceEnvironment: commonSchemas.environment.required(),
      targetEnvironments: Joi.array().items(commonSchemas.environment).min(1).required(),
      syncType: Joi.string().valid('full', 'selective', 'differential').default('differential'),
      keys: Joi.when('syncType', {
        is: 'selective',
        then: Joi.array().items(Joi.string()).min(1).required()
      }),
      overwrite: Joi.boolean().default(false),
      backup: Joi.boolean().default(true),
      dryRun: Joi.boolean().default(false),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate get environment differences request
   */
  getEnvironmentDifferences: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      environments: Joi.array().items(commonSchemas.environment).min(2).max(5).required(),
      ignoreKeys: Joi.array().items(Joi.string()),
      format: Joi.string().valid('json', 'table', 'summary').default('json')
    }).unknown(false)
  },

  /**
   * Validate promote configuration request
   */
  promoteConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      fromEnvironment: commonSchemas.environment.required(),
      toEnvironment: commonSchemas.environment.required(),
      promotionType: Joi.string().valid('immediate', 'scheduled', 'canary').default('immediate'),
      schedule: Joi.when('promotionType', {
        is: 'scheduled',
        then: Joi.object({
          scheduledAt: Joi.date().iso().greater('now').required(),
          timezone: Joi.string().default('UTC')
        }).required()
      }),
      canaryConfig: Joi.when('promotionType', {
        is: 'canary',
        then: Joi.object({
          percentage: Joi.number().min(1).max(100).required(),
          duration: Joi.number().min(60).max(86400).required(),
          metrics: Joi.array().items(Joi.string()),
          autoPromote: Joi.boolean().default(false),
          rollbackThreshold: Joi.number().min(0).max(100)
        }).required()
      }),
      validation: Joi.object({
        enabled: Joi.boolean().default(true),
        stopOnError: Joi.boolean().default(true)
      }),
      approval: Joi.object({
        required: Joi.boolean().default(true),
        approvers: Joi.array().items(Joi.string())
      }),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  }
};

/**
 * Configuration import/export validators
 */
const configurationImportExportValidators = {
  /**
   * Validate export configuration request
   */
  exportConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      format: Joi.string().valid('json', 'yaml', 'xml', 'properties', 'env').default('json'),
      environment: commonSchemas.environment,
      version: commonSchemas.version,
      includeMetadata: Joi.boolean().default(true),
      includeSchema: Joi.boolean().default(false),
      includeHistory: Joi.boolean().default(false),
      decrypt: Joi.boolean().default(false),
      pretty: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate export all configurations request
   */
  exportAllConfigurations: {
    query: Joi.object({
      format: Joi.string().valid('json', 'yaml', 'zip', 'tar').default('json'),
      environment: commonSchemas.environment,
      namespace: Joi.string(),
      includeInactive: Joi.boolean().default(false),
      compress: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate import configuration request
   */
  importConfiguration: {
    body: Joi.object({
      format: Joi.string().valid('json', 'yaml', 'xml', 'properties', 'env').required(),
      data: Joi.string().when('file', {
        not: Joi.exist(),
        then: Joi.required()
      }),
      environment: commonSchemas.environment.required(),
      namespace: Joi.string(),
      importMode: Joi.string().valid('create', 'update', 'upsert').default('upsert'),
      overwrite: Joi.boolean().default(false),
      validateSchema: Joi.boolean().default(true),
      dryRun: Joi.boolean().default(false),
      mappings: Joi.object().pattern(Joi.string(), Joi.string())
    }).unknown(false)
  },

  /**
   * Validate import from URL request
   */
  importConfigurationFromUrl: {
    body: Joi.object({
      url: Joi.string().uri().required(),
      format: Joi.string().valid('json', 'yaml', 'xml', 'properties', 'env'),
      authentication: Joi.object({
        type: Joi.string().valid('none', 'basic', 'bearer', 'api-key').default('none'),
        credentials: Joi.object().when('type', {
          not: 'none',
          then: Joi.required()
        })
      }),
      environment: commonSchemas.environment.required(),
      importMode: Joi.string().valid('create', 'update', 'upsert').default('upsert'),
      validateSsl: Joi.boolean().default(true),
      timeout: Joi.number().min(1000).max(60000).default(10000)
    }).unknown(false)
  },

  /**
   * Validate clone configuration request
   */
  cloneConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      name: commonSchemas.configName,
      environment: commonSchemas.environment,
      namespace: Joi.string(),
      includeValues: Joi.boolean().default(true),
      includeSchema: Joi.boolean().default(true),
      includePermissions: Joi.boolean().default(false),
      transformations: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('rename', 'replace', 'remove').required(),
          pattern: Joi.string().required(),
          replacement: Joi.string()
        })
      ),
      metadata: commonSchemas.metadata
    }).unknown(false)
  },

  /**
   * Validate merge configurations request
   */
  mergeConfigurations: {
    body: Joi.object({
      sourceConfigs: Joi.array().items(commonSchemas.configId).min(2).max(10).required(),
      targetName: commonSchemas.configName,
      mergeStrategy: Joi.string().valid('override', 'combine', 'selective').default('override'),
      conflictResolution: Joi.string().valid('first', 'last', 'manual').default('last'),
      environment: commonSchemas.environment.required(),
      includeSchema: Joi.boolean().default(true),
      validateResult: Joi.boolean().default(true)
    }).unknown(false)
  }
};

/**
 * Additional configuration validators
 */
const additionalConfigurationValidators = {
  /**
   * Validate get global statistics request
   */
  getGlobalStatistics: {
    query: Joi.object({
      environment: commonSchemas.environment,
      namespace: Joi.string(),
      timeRange: commonSchemas.timeRange,
      groupBy: Joi.string().valid('environment', 'namespace', 'type', 'day', 'week', 'month')
    }).unknown(false)
  },

  /**
   * Validate get configuration statistics request
   */
  getConfigurationStatistics: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      timeRange: commonSchemas.timeRange,
      metrics: Joi.array().items(
        Joi.string().valid('usage', 'changes', 'errors', 'performance')
      ),
      granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day')
    }).unknown(false)
  },

  /**
   * Validate get change log request
   */
  getChangeLog: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      user: Joi.string(),
      action: Joi.string().valid('create', 'update', 'delete', 'rollback'),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get configuration audit trail request
   */
  getConfigurationAuditTrail: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    query: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso(),
      user: Joi.string(),
      action: Joi.string(),
      includeSystemEvents: Joi.boolean().default(true),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate watch configuration request
   */
  watchConfiguration: {
    params: Joi.object({
      configId: commonSchemas.configId
    }),
    body: Joi.object({
      events: Joi.array().items(
        Joi.string().valid('change', 'delete', 'lock', 'unlock', 'rollback')
      ).min(1).required(),
      keys: Joi.array().items(Joi.string()),
      callback: Joi.object({
        type: Joi.string().valid('webhook', 'email', 'sms', 'function').required(),
        endpoint: Joi.string().required(),
        authentication: Joi.object(),
        retries: Joi.number().min(0).max(5).default(3)
      }).required(),
      filters: Joi.object({
        environment: commonSchemas.environment,
        minSeverity: Joi.string().valid('low', 'medium', 'high', 'critical')
      }),
      active: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate unwatch configuration request
   */
  unwatchConfiguration: {
    params: Joi.object({
      watcherId: Joi.string().pattern(/^watch-[a-zA-Z0-9]{8,32}$/).required()
    })
  }
};

/**
 * Combined configuration validators export
 */
const configurationValidators = {
  ...configurationCrudValidators,
  ...configurationValueValidators,
  ...configurationValidationValidators,
  ...configurationLockingValidators,
  ...configurationVersionValidators,
  ...configurationEnvironmentValidators,
  ...configurationImportExportValidators,
  ...additionalConfigurationValidators
};

/**
 * Validation error handler
 */
const handleValidationError = (error, req, res) => {
  logger.warn('Configuration validation error', {
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

    // Validate params if schema exists
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.params = value;
    }

    // Validate query if schema exists
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.query = value;
    }

    // Validate body if schema exists
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.body = value;
    }

    next();
  };
};

// Export validators
module.exports = {
  configurationValidators,
  createValidator,
  handleValidationError,
  commonSchemas,
  VALIDATION_MESSAGES
};