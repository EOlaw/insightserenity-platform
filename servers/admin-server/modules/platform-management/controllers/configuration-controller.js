'use strict';

/**
 * @fileoverview Configuration management controller for platform settings
 * @module servers/admin-server/modules/platform-management/controllers/configuration-controller
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:servers/admin-server/modules/platform-management/services/configuration-service
 * @requires module:servers/admin-server/modules/platform-management/validators/configuration-validators
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const ConfigurationService = require('../services/configuration-service');
const {
  validateConfiguration,
  validateEnvironmentConfig,
  validateModuleConfig,
  validateThirdPartyConfig,
  validateNotificationConfig
} = require('../validators/configuration-validators');

/**
 * Controller for configuration management operations
 * @class ConfigurationController
 */
class ConfigurationController {
  /**
   * Get all configurations
   * @route GET /api/admin/configuration
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getAllConfigurations = asyncHandler(async (req, res) => {
    const { 
      environment = process.env.NODE_ENV,
      includeDefaults = false,
      includeSecrets = false
    } = req.query;

    const configurations = await ConfigurationService.getAllConfigurations({
      environment,
      includeDefaults: includeDefaults === 'true',
      includeSecrets: includeSecrets === 'true' && req.user.permissions.includes('configuration.secrets.view')
    });

    logger.info('Configurations retrieved', {
      userId: req.user.id,
      environment,
      configCount: configurations.length
    });

    return ResponseFormatter.success(
      res,
      configurations,
      'Configurations retrieved successfully'
    );
  });

  /**
   * Get configuration by key
   * @route GET /api/admin/configuration/:key
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getConfiguration = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { environment = process.env.NODE_ENV } = req.query;

    const configuration = await ConfigurationService.getConfiguration(key, {
      environment,
      includeHistory: req.query.includeHistory === 'true'
    });

    if (!configuration) {
      throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
    }

    return ResponseFormatter.success(
      res,
      configuration,
      'Configuration retrieved successfully'
    );
  });

  /**
   * Create new configuration
   * @route POST /api/admin/configuration
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  createConfiguration = asyncHandler(async (req, res) => {
    const validatedData = validateConfiguration(req.body);

    const configuration = await ConfigurationService.createConfiguration(
      validatedData,
      req.user.id
    );

    logger.info('Configuration created', {
      userId: req.user.id,
      key: configuration.key,
      environment: configuration.environment
    });

    return ResponseFormatter.success(
      res,
      configuration,
      'Configuration created successfully',
      201
    );
  });

  /**
   * Update configuration
   * @route PUT /api/admin/configuration/:key
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateConfiguration = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const validatedData = validateConfiguration(req.body, true);

    const configuration = await ConfigurationService.updateConfiguration(
      key,
      validatedData,
      req.user.id
    );

    logger.info('Configuration updated', {
      userId: req.user.id,
      key,
      updatedFields: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      configuration,
      'Configuration updated successfully'
    );
  });

  /**
   * Delete configuration
   * @route DELETE /api/admin/configuration/:key
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  deleteConfiguration = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { environment = process.env.NODE_ENV } = req.query;

    await ConfigurationService.deleteConfiguration(key, {
      environment,
      userId: req.user.id
    });

    logger.warn('Configuration deleted', {
      userId: req.user.id,
      key,
      environment
    });

    return ResponseFormatter.success(
      res,
      { key, environment, deleted: true },
      'Configuration deleted successfully'
    );
  });

  /**
   * Get environment configurations
   * @route GET /api/admin/configuration/environment/:environment
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getEnvironmentConfig = asyncHandler(async (req, res) => {
    const { environment } = req.params;

    const config = await ConfigurationService.getEnvironmentConfig(environment);

    return ResponseFormatter.success(
      res,
      config,
      `${environment} environment configuration retrieved successfully`
    );
  });

  /**
   * Update environment configuration
   * @route PUT /api/admin/configuration/environment/:environment
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateEnvironmentConfig = asyncHandler(async (req, res) => {
    const { environment } = req.params;
    const validatedData = validateEnvironmentConfig(req.body);

    const config = await ConfigurationService.updateEnvironmentConfig(
      environment,
      validatedData,
      req.user.id
    );

    logger.info('Environment configuration updated', {
      userId: req.user.id,
      environment,
      updatedSettings: Object.keys(validatedData)
    });

    return ResponseFormatter.success(
      res,
      config,
      `${environment} environment configuration updated successfully`
    );
  });

  /**
   * Get module configurations
   * @route GET /api/admin/configuration/modules
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getModuleConfigs = asyncHandler(async (req, res) => {
    const { enabled = null } = req.query;

    const modules = await ConfigurationService.getModuleConfigs({
      enabled: enabled !== null ? enabled === 'true' : null
    });

    return ResponseFormatter.success(
      res,
      modules,
      'Module configurations retrieved successfully'
    );
  });

  /**
   * Update module configuration
   * @route PUT /api/admin/configuration/modules/:moduleName
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateModuleConfig = asyncHandler(async (req, res) => {
    const { moduleName } = req.params;
    const validatedData = validateModuleConfig(req.body);

    const config = await ConfigurationService.updateModuleConfig(
      moduleName,
      validatedData,
      req.user.id
    );

    logger.info('Module configuration updated', {
      userId: req.user.id,
      moduleName,
      enabled: validatedData.enabled
    });

    return ResponseFormatter.success(
      res,
      config,
      'Module configuration updated successfully'
    );
  });

  /**
   * Get third-party integrations configuration
   * @route GET /api/admin/configuration/integrations
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getThirdPartyConfigs = asyncHandler(async (req, res) => {
    const { provider = null } = req.query;

    const configs = await ConfigurationService.getThirdPartyConfigs({
      provider,
      includeSecrets: false
    });

    return ResponseFormatter.success(
      res,
      configs,
      'Third-party configurations retrieved successfully'
    );
  });

  /**
   * Update third-party integration configuration
   * @route PUT /api/admin/configuration/integrations/:provider
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateThirdPartyConfig = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const validatedData = validateThirdPartyConfig(req.body);

    const config = await ConfigurationService.updateThirdPartyConfig(
      provider,
      validatedData,
      req.user.id
    );

    logger.info('Third-party configuration updated', {
      userId: req.user.id,
      provider,
      hasCredentials: !!validatedData.credentials
    });

    return ResponseFormatter.success(
      res,
      config,
      'Third-party configuration updated successfully'
    );
  });

  /**
   * Get notification configurations
   * @route GET /api/admin/configuration/notifications
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  getNotificationConfigs = asyncHandler(async (req, res) => {
    const { channel = null } = req.query;

    const configs = await ConfigurationService.getNotificationConfigs({
      channel
    });

    return ResponseFormatter.success(
      res,
      configs,
      'Notification configurations retrieved successfully'
    );
  });

  /**
   * Update notification configuration
   * @route PUT /api/admin/configuration/notifications/:channel
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  updateNotificationConfig = asyncHandler(async (req, res) => {
    const { channel } = req.params;
    const validatedData = validateNotificationConfig(req.body);

    const config = await ConfigurationService.updateNotificationConfig(
      channel,
      validatedData,
      req.user.id
    );

    logger.info('Notification configuration updated', {
      userId: req.user.id,
      channel,
      enabled: validatedData.enabled
    });

    return ResponseFormatter.success(
      res,
      config,
      'Notification configuration updated successfully'
    );
  });

  /**
   * Export configurations
   * @route GET /api/admin/configuration/export
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  exportConfigurations = asyncHandler(async (req, res) => {
    const {
      format = 'json',
      environment = 'all',
      includeSecrets = false
    } = req.query;

    const exportData = await ConfigurationService.exportConfigurations({
      format,
      environment,
      includeSecrets: includeSecrets === 'true' && req.user.permissions.includes('configuration.export.secrets')
    });

    logger.info('Configurations exported', {
      userId: req.user.id,
      format,
      environment
    });

    const filename = `configurations_${environment}_${Date.now()}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/yaml');

    return res.send(exportData);
  });

  /**
   * Import configurations
   * @route POST /api/admin/configuration/import
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  importConfigurations = asyncHandler(async (req, res) => {
    const {
      format = 'json',
      environment = process.env.NODE_ENV,
      overwrite = false
    } = req.query;

    const result = await ConfigurationService.importConfigurations({
      data: req.body,
      format,
      environment,
      overwrite: overwrite === 'true',
      userId: req.user.id
    });

    logger.info('Configurations imported', {
      userId: req.user.id,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors.length
    });

    return ResponseFormatter.success(
      res,
      result,
      'Configurations imported successfully'
    );
  });

  /**
   * Validate configuration
   * @route POST /api/admin/configuration/validate
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  validateConfigurationData = asyncHandler(async (req, res) => {
    const { configuration } = req.body;

    const validation = await ConfigurationService.validateConfiguration(configuration);

    return ResponseFormatter.success(
      res,
      validation,
      validation.valid ? 'Configuration is valid' : 'Configuration validation failed'
    );
  });

  /**
   * Reset configuration to defaults
   * @route POST /api/admin/configuration/:key/reset
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @returns {Promise<void>}
   */
  resetConfiguration = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { environment = process.env.NODE_ENV } = req.query;

    const configuration = await ConfigurationService.resetConfiguration(
      key,
      {
        environment,
        userId: req.user.id
      }
    );

    logger.info('Configuration reset to defaults', {
      userId: req.user.id,
      key,
      environment
    });

    return ResponseFormatter.success(
      res,
      configuration,
      'Configuration reset to defaults successfully'
    );
  });
}

module.exports = new ConfigurationController();