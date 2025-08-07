'use strict';

/**
 * @fileoverview Configuration management controller
 * @module servers/admin-server/modules/platform-management/controllers/configuration-controller
 * @requires module:servers/admin-server/modules/platform-management/services/configuration-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const configurationService = require('../services/configuration-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class ConfigurationController
 * @description Controller for configuration management operations
 */
class ConfigurationController {
  /**
   * Creates a new configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  createConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const configData = req.body;
      const userId = req.user.id;

      logger.info('Creating configuration', {
        name: configData.name,
        category: configData.metadata?.category,
        userId
      });

      // Validate configuration data
      if (!configData.name || !configData.displayName) {
        throw new AppError('Configuration name and display name are required', 400);
      }

      const configuration = await configurationService.createConfiguration(
        configData,
        userId
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          configuration,
          'Configuration created successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to create configuration', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets a configuration by ID or name
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { identifier } = req.params;
      const { environment, includeVersions, includeSensitive, noCache } = req.query;

      logger.info('Getting configuration', {
        identifier,
        environment,
        includeVersions,
        userId: req.user?.id
      });

      const options = {
        environment,
        includeVersions: includeVersions === 'true',
        includeSensitive: includeSensitive === 'true' && req.user.role === 'admin',
        fromCache: noCache !== 'true'
      };

      const configuration = await configurationService.getConfiguration(
        identifier,
        options
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          configuration,
          'Configuration retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get configuration', {
        identifier: req.params.identifier,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets a configuration value
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getConfigurationValue = asyncHandler(async (req, res, next) => {
    try {
      const { configId, key } = req.params;
      const { environment, noCache } = req.query;

      logger.info('Getting configuration value', {
        configId,
        key,
        environment,
        userId: req.user?.id
      });

      const options = {
        environment,
        fromCache: noCache !== 'true'
      };

      const value = await configurationService.getConfigurationValue(
        configId,
        key,
        options
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          { key, value, environment: environment || 'base' },
          'Configuration value retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get configuration value', {
        configId: req.params.configId,
        key: req.params.key,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Sets a configuration value
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  setConfigurationValue = asyncHandler(async (req, res, next) => {
    try {
      const { configId, key } = req.params;
      const { value, environment, comment, createIfNotExists } = req.body;
      const userId = req.user.id;

      logger.info('Setting configuration value', {
        configId,
        key,
        environment,
        hasValue: value !== undefined,
        userId
      });

      if (value === undefined) {
        throw new AppError('Value is required', 400);
      }

      const options = {
        environment,
        userId,
        comment,
        createIfNotExists: createIfNotExists === true
      };

      const configuration = await configurationService.setConfigurationValue(
        configId,
        key,
        value,
        options
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId,
            key,
            value,
            environment: environment || 'base',
            version: configuration.currentVersion
          },
          'Configuration value updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to set configuration value', {
        configId: req.params.configId,
        key: req.params.key,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates multiple configuration values
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateConfigurationValues = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { updates, environment, comment, createIfNotExists } = req.body;
      const userId = req.user.id;

      logger.info('Updating configuration values', {
        configId,
        keysToUpdate: Object.keys(updates || {}),
        environment,
        userId
      });

      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new AppError('Updates object with key-value pairs is required', 400);
      }

      const options = {
        environment,
        userId,
        comment,
        createIfNotExists: createIfNotExists === true
      };

      const configuration = await configurationService.updateConfigurationValues(
        configId,
        updates,
        options
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId,
            updatedKeys: Object.keys(updates),
            environment: environment || 'base',
            version: configuration.currentVersion
          },
          'Configuration values updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update configuration values', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Deletes a configuration key
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  deleteConfigurationKey = asyncHandler(async (req, res, next) => {
    try {
      const { configId, key } = req.params;
      const { environment, comment } = req.body;
      const userId = req.user.id;

      logger.info('Deleting configuration key', {
        configId,
        key,
        environment,
        userId
      });

      const options = {
        environment,
        userId,
        comment
      };

      const configuration = await configurationService.deleteConfigurationKey(
        configId,
        key,
        options
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId,
            key,
            environment: environment || 'base',
            version: configuration.currentVersion
          },
          'Configuration key deleted successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to delete configuration key', {
        configId: req.params.configId,
        key: req.params.key,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Lists configurations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  listConfigurations = asyncHandler(async (req, res, next) => {
    try {
      const {
        category,
        environment,
        tag,
        active,
        search,
        page = 1,
        limit = 20,
        sort = '-createdAt'
      } = req.query;

      logger.info('Listing configurations', {
        category,
        environment,
        search,
        userId: req.user?.id
      });

      const filters = {
        category,
        environment,
        tag,
        active: active === 'false' ? false : true,
        search,
        page: parseInt(page),
        limit: parseInt(limit),
        sort
      };

      const results = await configurationService.listConfigurations(filters);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          results,
          'Configurations retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to list configurations', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Searches configuration values
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  searchConfigurationValues = asyncHandler(async (req, res, next) => {
    try {
      const { q, category, limit = 50 } = req.query;

      logger.info('Searching configuration values', {
        query: q,
        category,
        userId: req.user?.id
      });

      if (!q || q.length < 2) {
        throw new AppError('Search query must be at least 2 characters', 400);
      }

      const options = {
        category,
        limit: parseInt(limit)
      };

      const results = await configurationService.searchConfigurationValues(q, options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            results,
            total: results.length,
            query: q
          },
          'Search completed successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to search configuration values', {
        query: req.query.q,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Exports configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  exportConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const {
        format = 'json',
        environment,
        includeMetadata,
        includeVersionHistory,
        includeSensitive
      } = req.query;
      const userId = req.user.id;

      logger.info('Exporting configuration', {
        configId,
        format,
        environment,
        userId
      });

      const options = {
        format,
        environment,
        includeMetadata: includeMetadata === 'true',
        includeVersionHistory: includeVersionHistory === 'true',
        includeSensitive: includeSensitive === 'true' && req.user.role === 'admin',
        userId
      };

      const exported = await configurationService.exportConfiguration(configId, options);

      // Set appropriate content type
      const contentTypes = {
        json: 'application/json',
        yaml: 'text/yaml',
        xml: 'application/xml',
        env: 'text/plain'
      };

      res.setHeader('Content-Type', contentTypes[format] || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="config-${configId}-${Date.now()}.${format}"`
      );

      return res.status(StatusCodes.OK).send(exported);
    } catch (error) {
      logger.error('Failed to export configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Imports configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  importConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { data, format = 'json', source = 'manual' } = req.body;
      const userId = req.user.id;

      logger.info('Importing configuration', {
        format,
        source,
        dataLength: data?.length,
        userId
      });

      if (!data) {
        throw new AppError('Configuration data is required', 400);
      }

      const options = {
        format,
        source,
        userId
      };

      const configuration = await configurationService.importConfiguration(data, options);

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          configuration,
          'Configuration imported successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to import configuration', {
        format: req.body.format,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Validates configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  validateConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;

      logger.info('Validating configuration', {
        configId,
        userId: req.user?.id
      });

      const validationResult = await configurationService.validateConfiguration(configId);

      const statusCode = validationResult.valid ? StatusCodes.OK : StatusCodes.UNPROCESSABLE_ENTITY;
      const message = validationResult.valid ?
        'Configuration is valid' :
        `Configuration validation failed with ${validationResult.errors.length} errors`;

      return res.status(statusCode).json(
        responseFormatter.success(
          validationResult,
          message
        )
      );
    } catch (error) {
      logger.error('Failed to validate configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Locks configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  lockConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      logger.info('Locking configuration', {
        configId,
        reason,
        userId
      });

      if (!reason) {
        throw new AppError('Lock reason is required', 400);
      }

      const configuration = await configurationService.lockConfiguration(
        configId,
        userId,
        reason
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId: configuration.configId,
            locked: configuration.status.locked,
            lockedBy: configuration.status.lockedBy,
            lockedAt: configuration.status.lockedAt,
            reason: configuration.status.lockReason
          },
          'Configuration locked successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to lock configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Unlocks configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  unlockConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const userId = req.user.id;

      logger.info('Unlocking configuration', {
        configId,
        userId
      });

      const configuration = await configurationService.unlockConfiguration(
        configId,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId: configuration.configId,
            locked: configuration.status.locked
          },
          'Configuration unlocked successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to unlock configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Rolls back configuration to a specific version
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  rollbackConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { targetVersion } = req.body;
      const userId = req.user.id;

      logger.info('Rolling back configuration', {
        configId,
        targetVersion,
        userId
      });

      if (!targetVersion || targetVersion < 1) {
        throw new AppError('Valid target version is required', 400);
      }

      const configuration = await configurationService.rollbackConfiguration(
        configId,
        targetVersion,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            configId: configuration.configId,
            currentVersion: configuration.currentVersion,
            rolledBackTo: targetVersion
          },
          'Configuration rolled back successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to rollback configuration', {
        configId: req.params.configId,
        targetVersion: req.body.targetVersion,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets configuration statistics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getConfigurationStatistics = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;

      logger.info('Getting configuration statistics', {
        configId,
        userId: req.user?.id
      });

      const statistics = await configurationService.getConfigurationStatistics(configId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          statistics,
          'Configuration statistics retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get configuration statistics', {
        configId: req.params?.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets configuration version history
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getVersionHistory = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { limit = 50, page = 1 } = req.query;

      logger.info('Getting configuration version history', {
        configId,
        limit,
        page,
        userId: req.user?.id
      });

      const configuration = await configurationService.getConfiguration(configId, {
        includeVersions: true,
        fromCache: false
      });

      if (!configuration.versions) {
        return res.status(StatusCodes.OK).json(
          responseFormatter.success(
            { versions: [], total: 0 },
            'No version history available'
          )
        );
      }

      // Paginate versions
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedVersions = configuration.versions
        .sort((a, b) => b.version - a.version)
        .slice(startIndex, endIndex);

      const versionHistory = paginatedVersions.map(version => ({
        version: version.version,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        comment: version.comment,
        changeCount: version.changes?.length || 0,
        deployed: version.deployed,
        approved: version.approved
      }));

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            versions: versionHistory,
            total: configuration.versions.length,
            currentVersion: configuration.currentVersion,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              pages: Math.ceil(configuration.versions.length / parseInt(limit))
            }
          },
          'Version history retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get version history', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets configuration changes for a specific version
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getVersionChanges = asyncHandler(async (req, res, next) => {
    try {
      const { configId, version } = req.params;

      logger.info('Getting version changes', {
        configId,
        version,
        userId: req.user?.id
      });

      const configuration = await configurationService.getConfiguration(configId, {
        includeVersions: true,
        fromCache: false
      });

      const versionData = configuration.versions?.find(v => v.version === parseInt(version));

      if (!versionData) {
        throw new AppError(`Version ${version} not found`, 404);
      }

      const changes = versionData.changes.map(change => ({
        key: change.key,
        changeType: change.changeType,
        previousValue: change.encrypted ? '[ENCRYPTED]' : change.previousValue,
        newValue: change.encrypted ? '[ENCRYPTED]' : change.newValue
      }));

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            version: versionData.version,
            createdAt: versionData.createdAt,
            createdBy: versionData.createdBy,
            comment: versionData.comment,
            changes,
            changeCount: changes.length
          },
          'Version changes retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get version changes', {
        configId: req.params.configId,
        version: req.params.version,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Compares two configuration versions
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  compareVersions = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { fromVersion, toVersion } = req.query;

      logger.info('Comparing configuration versions', {
        configId,
        fromVersion,
        toVersion,
        userId: req.user?.id
      });

      if (!fromVersion || !toVersion) {
        throw new AppError('Both fromVersion and toVersion are required', 400);
      }

      const configuration = await configurationService.getConfiguration(configId, {
        includeVersions: true,
        fromCache: false
      });

      const fromVersionData = configuration.versions?.find(v => v.version === parseInt(fromVersion));
      const toVersionData = configuration.versions?.find(v => v.version === parseInt(toVersion));

      if (!fromVersionData || !toVersionData) {
        throw new AppError('One or both versions not found', 404);
      }

      // Build comparison
      const allKeys = new Set();
      const comparison = {};

      // Collect all keys from both versions
      fromVersionData.changes.forEach(c => allKeys.add(c.key));
      toVersionData.changes.forEach(c => allKeys.add(c.key));

      // Compare each key
      for (const key of allKeys) {
        const fromChange = fromVersionData.changes.find(c => c.key === key);
        const toChange = toVersionData.changes.find(c => c.key === key);

        comparison[key] = {
          fromVersion: {
            value: fromChange?.encrypted ? '[ENCRYPTED]' : fromChange?.newValue,
            changeType: fromChange?.changeType
          },
          toVersion: {
            value: toChange?.encrypted ? '[ENCRYPTED]' : toChange?.newValue,
            changeType: toChange?.changeType
          },
          changed: fromChange?.newValue !== toChange?.newValue
        };
      }

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            fromVersion: parseInt(fromVersion),
            toVersion: parseInt(toVersion),
            comparison,
            totalKeys: allKeys.size,
            changedKeys: Object.values(comparison).filter(c => c.changed).length
          },
          'Version comparison completed successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to compare versions', {
        configId: req.params.configId,
        fromVersion: req.query.fromVersion,
        toVersion: req.query.toVersion,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets configuration environments
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getConfigurationEnvironments = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;

      logger.info('Getting configuration environments', {
        configId,
        userId: req.user?.id
      });

      const configuration = await configurationService.getConfiguration(configId, {
        fromCache: false
      });

      const environments = configuration.environments?.map(env => ({
        environment: env.environment,
        overrides: env.overrides?.length || 0,
        locked: env.locked,
        lockedBy: env.lockedBy,
        lockedAt: env.lockedAt,
        lastSync: env.lastSync,
        syncStatus: env.syncStatus
      })) || [];

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            environments,
            total: environments.length,
            availableEnvironments: ['development', 'staging', 'production', 'testing']
          },
          'Configuration environments retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get configuration environments', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Syncs configuration across environments
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  syncConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { sourceEnvironment, targetEnvironments, keysToSync } = req.body;
      const userId = req.user.id;

      logger.info('Syncing configuration across environments', {
        configId,
        sourceEnvironment,
        targetEnvironments,
        keysToSync: keysToSync?.length,
        userId
      });

      if (!sourceEnvironment || !targetEnvironments || !Array.isArray(targetEnvironments)) {
        throw new AppError('Source environment and target environments are required', 400);
      }

      const configuration = await configurationService.getConfiguration(configId, {
        environment: sourceEnvironment,
        fromCache: false
      });

      const syncResults = [];

      for (const targetEnv of targetEnvironments) {
        try {
          const keysToUpdate = keysToSync || configuration.configurations.map(c => c.key);
          const updates = {};

          for (const key of keysToUpdate) {
            const value = await configurationService.getConfigurationValue(
              configId,
              key,
              { environment: sourceEnvironment }
            );
            updates[key] = value;
          }

          await configurationService.updateConfigurationValues(
            configId,
            updates,
            {
              environment: targetEnv,
              userId,
              comment: `Synced from ${sourceEnvironment}`,
              createIfNotExists: true
            }
          );

          syncResults.push({
            environment: targetEnv,
            success: true,
            syncedKeys: keysToUpdate.length
          });
        } catch (error) {
          syncResults.push({
            environment: targetEnv,
            success: false,
            error: error.message
          });
        }
      }

      const successful = syncResults.filter(r => r.success).length;
      const failed = syncResults.filter(r => !r.success).length;

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            syncResults,
            summary: {
              sourceEnvironment,
              targetEnvironments: targetEnvironments.length,
              successful,
              failed
            }
          },
          `Configuration synced to ${successful} environments${failed > 0 ? `, ${failed} failed` : ''}`
        )
      );
    } catch (error) {
      logger.error('Failed to sync configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Clones a configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  cloneConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { name, displayName, description } = req.body;
      const userId = req.user.id;

      logger.info('Cloning configuration', {
        sourceConfigId: configId,
        newName: name,
        userId
      });

      if (!name || !displayName) {
        throw new AppError('Name and display name are required for cloned configuration', 400);
      }

      // Get source configuration
      const sourceConfig = await configurationService.getConfiguration(configId, {
        includeSensitive: true,
        fromCache: false
      });

      // Create clone
      const clonedConfig = {
        name,
        displayName,
        description: description || `Cloned from ${sourceConfig.displayName}`,
        configurations: sourceConfig.configurations.map(config => ({
          key: config.key,
          value: config.value,
          type: config.type,
          category: config.category,
          subcategory: config.subcategory,
          description: config.description,
          encrypted: config.encrypted,
          sensitive: config.sensitive,
          editable: config.editable,
          validation: config.validation,
          defaultValue: config.defaultValue,
          allowedValues: config.allowedValues,
          dependencies: config.dependencies,
          metadata: config.metadata
        })),
        environments: [],
        accessControl: sourceConfig.accessControl,
        validationRules: sourceConfig.validationRules,
        metadata: {
          ...sourceConfig.metadata,
          tags: [...(sourceConfig.metadata?.tags || []), 'cloned']
        }
      };

      const newConfiguration = await configurationService.createConfiguration(
        clonedConfig,
        userId
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          newConfiguration,
          'Configuration cloned successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to clone configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Backs up configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  backupConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { includeVersions = true, includeEnvironments = true } = req.body;
      const userId = req.user.id;

      logger.info('Creating configuration backup', {
        configId,
        includeVersions,
        includeEnvironments,
        userId
      });

      const configuration = await configurationService.getConfiguration(configId, {
        includeVersions,
        includeSensitive: true,
        fromCache: false
      });

      const backup = {
        metadata: {
          backupId: `BACKUP_${Date.now()}_${stringHelper.generateRandomString(9)}`,
          configId: configuration.configId,
          configName: configuration.name,
          backupDate: new Date(),
          backupBy: userId,
          version: configuration.currentVersion
        },
        configuration: {
          ...configuration,
          versions: includeVersions ? configuration.versions : [],
          environments: includeEnvironments ? configuration.environments : []
        }
      };

      // In production, save backup to storage service
      logger.info('Configuration backup created', {
        configId,
        backupId: backup.metadata.backupId
      });

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            backupId: backup.metadata.backupId,
            configId,
            size: JSON.stringify(backup).length,
            timestamp: backup.metadata.backupDate
          },
          'Configuration backup created successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to backup configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Watches configuration for changes
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  watchConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { key = '*', webhookUrl } = req.body;
      const userId = req.user.id;

      logger.info('Setting up configuration watch', {
        configId,
        key,
        webhookUrl,
        userId
      });

      if (!webhookUrl) {
        throw new AppError('Webhook URL is required for watching configuration', 400);
      }

      // In production, implement actual webhook registration
      const watcherId = configurationService.watchConfiguration(
        configId,
        key,
        async (change) => {
          try {
            // Send webhook notification
            logger.info('Configuration change detected', {
              configId,
              key: change.key,
              watcherId
            });
            // In production: make HTTP request to webhookUrl
          } catch (error) {
            logger.error('Failed to send configuration change webhook', {
              watcherId,
              error: error.message
            });
          }
        }
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          {
            watcherId,
            configId,
            key,
            webhookUrl,
            status: 'active'
          },
          'Configuration watch created successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to watch configuration', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Stops watching configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  unwatchConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { watcherId } = req.params;

      logger.info('Stopping configuration watch', {
        watcherId,
        userId: req.user?.id
      });

      configurationService.unwatchConfiguration(watcherId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            watcherId,
            status: 'stopped'
          },
          'Configuration watch stopped successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to stop configuration watch', {
        watcherId: req.params.watcherId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets configuration audit trail
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getConfigurationAuditTrail = asyncHandler(async (req, res, next) => {
    try {
      const { configId } = req.params;
      const { action, startDate, endDate, limit = 100 } = req.query;

      logger.info('Getting configuration audit trail', {
        configId,
        action,
        startDate,
        endDate,
        userId: req.user?.id
      });

      const configuration = await configurationService.getConfiguration(configId, {
        fromCache: false
      });

      let auditTrail = configuration.auditTrail || [];

      // Apply filters
      if (action) {
        auditTrail = auditTrail.filter(entry => entry.action === action);
      }

      if (startDate) {
        const start = new Date(startDate);
        auditTrail = auditTrail.filter(entry => new Date(entry.timestamp) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        auditTrail = auditTrail.filter(entry => new Date(entry.timestamp) <= end);
      }

      // Sort by timestamp (newest first)
      auditTrail.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Limit results
      auditTrail = auditTrail.slice(0, parseInt(limit));

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            auditTrail,
            total: auditTrail.length,
            configId
          },
          'Audit trail retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get audit trail', {
        configId: req.params.configId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });
}

// Export singleton instance
module.exports = new ConfigurationController();