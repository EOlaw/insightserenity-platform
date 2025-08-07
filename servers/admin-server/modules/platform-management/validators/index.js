'use strict';

/**
 * @fileoverview Central export point for all platform management validators
 * @module servers/admin-server/modules/platform-management/validators
 * @requires module:servers/admin-server/modules/platform-management/validators/platform-validators
 * @requires module:servers/admin-server/modules/platform-management/validators/system-validators
 * @requires module:servers/admin-server/modules/platform-management/validators/configuration-validators
 * @requires module:servers/admin-server/modules/platform-management/validators/maintenance-validators
 * @requires module:shared/lib/utils/logger
 */

const {
  platformValidators,
  createValidator: createPlatformValidator,
  handleValidationError: handlePlatformValidationError,
  commonSchemas: platformCommonSchemas,
  VALIDATION_MESSAGES: PLATFORM_VALIDATION_MESSAGES
} = require('./platform-validators');

const {
  systemValidators,
  createValidator: createSystemValidator,
  handleValidationError: handleSystemValidationError,
  commonSchemas: systemCommonSchemas,
  VALIDATION_MESSAGES: SYSTEM_VALIDATION_MESSAGES
} = require('./system-validators');

const {
  configurationValidators,
  createValidator: createConfigurationValidator,
  handleValidationError: handleConfigurationValidationError,
  commonSchemas: configurationCommonSchemas,
  VALIDATION_MESSAGES: CONFIGURATION_VALIDATION_MESSAGES
} = require('./configuration-validators');

const {
  maintenanceValidators,
  createValidator: createMaintenanceValidator,
  handleValidationError: handleMaintenanceValidationError,
  commonSchemas: maintenanceCommonSchemas,
  VALIDATION_MESSAGES: MAINTENANCE_VALIDATION_MESSAGES
} = require('./maintenance-validators');

const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Combined validators object containing all platform management validators
 */
const validators = {
  platform: platformValidators,
  system: systemValidators,
  configuration: configurationValidators,
  maintenance: maintenanceValidators
};

/**
 * Combined common schemas from all validator modules
 */
const commonSchemas = {
  platform: platformCommonSchemas,
  system: systemCommonSchemas,
  configuration: configurationCommonSchemas,
  maintenance: maintenanceCommonSchemas
};

/**
 * Combined validation messages from all validator modules
 */
const VALIDATION_MESSAGES = {
  ...PLATFORM_VALIDATION_MESSAGES,
  ...SYSTEM_VALIDATION_MESSAGES,
  ...CONFIGURATION_VALIDATION_MESSAGES,
  ...MAINTENANCE_VALIDATION_MESSAGES
};

/**
 * Universal validation error handler
 * Routes to the appropriate module-specific error handler
 * @param {string} module - The module name (platform, system, configuration, maintenance)
 * @param {Error} error - The validation error
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleValidationError = (module, error, req, res) => {
  logger.warn(`Validation error in ${module} module`, {
    module,
    path: req.path,
    method: req.method,
    error: error.message
  });

  switch (module) {
    case 'platform':
      return handlePlatformValidationError(error, req, res);
    case 'system':
      return handleSystemValidationError(error, req, res);
    case 'configuration':
      return handleConfigurationValidationError(error, req, res);
    case 'maintenance':
      return handleMaintenanceValidationError(error, req, res);
    default:
      logger.error('Unknown module in validation error handler', { module });
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.details || error.message
        }
      });
  }
};

/**
 * Universal validator factory
 * Creates a validation middleware for any module
 * @param {string} module - The module name
 * @param {string} validatorName - The specific validator name within the module
 * @returns {Function} Express middleware function
 */
const createValidator = (module, validatorName) => {
  if (!validators[module]) {
    throw new Error(`Unknown validator module: ${module}`);
  }

  if (!validators[module][validatorName]) {
    throw new Error(`Unknown validator: ${validatorName} in module: ${module}`);
  }

  const schema = validators[module][validatorName];

  switch (module) {
    case 'platform':
      return createPlatformValidator(schema);
    case 'system':
      return createSystemValidator(schema);
    case 'configuration':
      return createConfigurationValidator(schema);
    case 'maintenance':
      return createMaintenanceValidator(schema);
    default:
      throw new Error(`No validator factory for module: ${module}`);
  }
};

/**
 * Get a specific validator schema
 * @param {string} module - The module name
 * @param {string} validatorName - The validator name
 * @returns {Object} The validator schema
 */
const getValidatorSchema = (module, validatorName) => {
  if (!validators[module]) {
    throw new Error(`Unknown validator module: ${module}`);
  }

  if (!validators[module][validatorName]) {
    throw new Error(`Unknown validator: ${validatorName} in module: ${module}`);
  }

  return validators[module][validatorName];
};

/**
 * Validate data against a schema without Express context
 * Useful for testing or standalone validation
 * @param {string} module - The module name
 * @param {string} validatorName - The validator name
 * @param {Object} data - The data to validate
 * @param {Object} [options] - Validation options
 * @returns {Object} Validation result with { error, value }
 */
const validateData = (module, validatorName, data, options = {}) => {
  const schema = getValidatorSchema(module, validatorName);
  const validationOptions = {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
    ...options
  };

  const results = {};

  // Validate each schema type if present
  if (schema.params && data.params) {
    const { error, value } = schema.params.validate(data.params, validationOptions);
    if (error) {
      results.error = results.error || {};
      results.error.params = error;
    }
    results.value = results.value || {};
    results.value.params = value;
  }

  if (schema.query && data.query) {
    const { error, value } = schema.query.validate(data.query, validationOptions);
    if (error) {
      results.error = results.error || {};
      results.error.query = error;
    }
    results.value = results.value || {};
    results.value.query = value;
  }

  if (schema.body && data.body) {
    const { error, value } = schema.body.validate(data.body, validationOptions);
    if (error) {
      results.error = results.error || {};
      results.error.body = error;
    }
    results.value = results.value || {};
    results.value.body = value;
  }

  return results;
};

/**
 * List all available validators for a module
 * @param {string} [module] - Optional module name to filter
 * @returns {Array|Object} List of validator names or all validators
 */
const listValidators = (module) => {
  if (module) {
    if (!validators[module]) {
      throw new Error(`Unknown validator module: ${module}`);
    }
    return Object.keys(validators[module]);
  }

  const allValidators = {};
  Object.keys(validators).forEach(mod => {
    allValidators[mod] = Object.keys(validators[mod]);
  });
  return allValidators;
};

/**
 * Get validation statistics (useful for monitoring)
 * @returns {Object} Validation statistics
 */
const getValidationStats = () => {
  const stats = {};
  Object.keys(validators).forEach(module => {
    stats[module] = {
      count: Object.keys(validators[module]).length,
      validators: Object.keys(validators[module])
    };
  });
  stats.total = Object.values(stats).reduce((sum, mod) => sum + mod.count, 0);
  return stats;
};

// Log validator initialization
logger.info('Platform management validators initialized', {
  modules: Object.keys(validators),
  totalValidators: getValidationStats().total
});

// Export all validators and utilities
module.exports = {
  // Individual validator modules
  platformValidators,
  systemValidators,
  configurationValidators,
  maintenanceValidators,

  // Combined validators object
  validators,

  // Common schemas
  commonSchemas,

  // Validation messages
  VALIDATION_MESSAGES,

  // Utility functions
  handleValidationError,
  createValidator,
  getValidatorSchema,
  validateData,
  listValidators,
  getValidationStats,

  // Re-export individual module creators for backward compatibility
  createPlatformValidator,
  createSystemValidator,
  createConfigurationValidator,
  createMaintenanceValidator
};