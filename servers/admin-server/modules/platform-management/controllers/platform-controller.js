'use strict';

/**
 * @fileoverview Platform management controller
 * @module servers/admin-server/modules/platform-management/controllers/platform-controller
 * @requires module:servers/admin-server/modules/platform-management/services/platform-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/constants/status-codes
 */

const platformService = require('../services/platform-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * @class PlatformController
 * @description Controller for platform management operations
 */
class PlatformController {
  /**
   * Gets platform configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getPlatformConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { environment, includeInactive, noCache } = req.query;

      logger.info('Getting platform configuration', {
        environment,
        includeInactive,
        userId: req.user?.id
      });

      const options = {
        environment,
        includeInactive: includeInactive === 'true',
        fromCache: noCache !== 'true'
      };

      const configuration = await platformService.getPlatformConfiguration(options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          configuration,
          'Platform configuration retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get platform configuration', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Creates platform configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  createPlatformConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const platformData = req.body;
      const userId = req.user.id;

      logger.info('Creating platform configuration', {
        environment: platformData.deployment?.environment,
        userId
      });

      const configuration = await platformService.createPlatformConfiguration(
        platformData,
        userId
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          configuration,
          'Platform configuration created successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to create platform configuration', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates platform configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updatePlatformConfiguration = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const updates = req.body;
      const userId = req.user.id;

      logger.info('Updating platform configuration', {
        platformId,
        fieldsToUpdate: Object.keys(updates),
        userId
      });

      const configuration = await platformService.updatePlatformConfiguration(
        platformId,
        updates,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          configuration,
          'Platform configuration updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update platform configuration', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Manages feature flag
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  manageFeatureFlag = asyncHandler(async (req, res, next) => {
    try {
      const { platformId, featureName } = req.params;
      const { action, options } = req.body;
      const userId = req.user.id;

      logger.info('Managing feature flag', {
        platformId,
        featureName,
        action: action.type,
        userId
      });

      const feature = await platformService.manageFeatureFlag(
        platformId,
        featureName,
        action,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          feature,
          `Feature flag ${action.type} successfully`
        )
      );
    } catch (error) {
      logger.error('Failed to manage feature flag', {
        platformId: req.params.platformId,
        featureName: req.params.featureName,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets feature flags for tenant
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getFeatureFlagsForTenant = asyncHandler(async (req, res, next) => {
    try {
      const { tenantId } = req.params;
      const { environment = 'production', noCache } = req.query;

      logger.info('Getting feature flags for tenant', {
        tenantId,
        environment,
        userId: req.user?.id
      });

      const options = {
        environment,
        fromCache: noCache !== 'true'
      };

      const features = await platformService.getFeatureFlagsForTenant(tenantId, options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          features,
          'Feature flags retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get feature flags for tenant', {
        tenantId: req.params.tenantId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Searches feature flags
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  searchFeatureFlags = asyncHandler(async (req, res, next) => {
    try {
      const searchCriteria = {
        query: req.query.q,
        enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
        hasRollout: req.query.hasRollout === 'true',
        environment: req.query.environment || 'production',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      logger.info('Searching feature flags', {
        criteria: searchCriteria,
        userId: req.user?.id
      });

      const results = await platformService.searchFeatureFlags(searchCriteria);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          results,
          'Feature flags search completed'
        )
      );
    } catch (error) {
      logger.error('Failed to search feature flags', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Records deployment
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  recordDeployment = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const deploymentInfo = req.body;
      const userId = req.user.id;

      logger.info('Recording deployment', {
        platformId,
        version: deploymentInfo.version,
        environment: deploymentInfo.environment,
        userId
      });

      const deployment = await platformService.recordDeployment(
        platformId,
        deploymentInfo,
        userId
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          deployment,
          'Deployment recorded successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to record deployment', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates system module
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateSystemModule = asyncHandler(async (req, res, next) => {
    try {
      const { platformId, moduleName } = req.params;
      const updates = req.body;
      const userId = req.user.id;

      logger.info('Updating system module', {
        platformId,
        moduleName,
        updates: Object.keys(updates),
        userId
      });

      const module = await platformService.updateSystemModule(
        platformId,
        moduleName,
        updates,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          module,
          'System module updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update system module', {
        platformId: req.params.platformId,
        moduleName: req.params.moduleName,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Performs health check
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  performHealthCheck = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;

      logger.info('Performing platform health check', {
        platformId,
        userId: req.user?.id
      });

      const healthResults = await platformService.performHealthCheck(platformId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          healthResults,
          'Health check completed successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to perform health check', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets platform statistics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getPlatformStatistics = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { timeRange = '24h' } = req.query;

      logger.info('Getting platform statistics', {
        platformId,
        timeRange,
        userId: req.user?.id
      });

      const statistics = await platformService.getPlatformStatistics(
        platformId,
        { timeRange }
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          statistics,
          'Platform statistics retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get platform statistics', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets all feature flags
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getAllFeatureFlags = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;

      logger.info('Getting all feature flags', {
        platformId,
        userId: req.user?.id
      });

      const platform = await platformService.getPlatformConfiguration({
        environment: req.query.environment
      });

      const featureFlags = platform.featureFlags.map(flag => ({
        name: flag.name,
        enabled: flag.enabled,
        description: flag.description,
        rolloutPercentage: flag.rolloutPercentage,
        enabledTenants: flag.enabledTenants?.length || 0,
        disabledTenants: flag.disabledTenants?.length || 0,
        metadata: flag.metadata,
        lastModified: flag.lastModified,
        modifiedBy: flag.modifiedBy
      }));

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            featureFlags,
            total: featureFlags.length,
            active: featureFlags.filter(f => f.enabled).length
          },
          'Feature flags retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get all feature flags', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system modules
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getSystemModules = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { status } = req.query;

      logger.info('Getting system modules', {
        platformId,
        status,
        userId: req.user?.id
      });

      const platform = await platformService.getPlatformConfiguration({
        environment: req.query.environment
      });

      let modules = platform.systemModules;

      // Filter by status if provided
      if (status) {
        modules = modules.filter(m => m.health.status === status);
      }

      const modulesSummary = {
        modules,
        total: modules.length,
        enabled: modules.filter(m => m.enabled).length,
        byStatus: {
          healthy: modules.filter(m => m.health.status === 'healthy').length,
          degraded: modules.filter(m => m.health.status === 'degraded').length,
          unhealthy: modules.filter(m => m.health.status === 'unhealthy').length,
          unknown: modules.filter(m => m.health.status === 'unknown').length
        }
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          modulesSummary,
          'System modules retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get system modules', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets deployment history
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getDeploymentHistory = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { limit = 10 } = req.query;

      logger.info('Getting deployment history', {
        platformId,
        limit,
        userId: req.user?.id
      });

      const platform = await platformService.getPlatformConfiguration({
        environment: req.query.environment
      });

      const deploymentHistory = [
        {
          version: platform.deployment.version,
          environment: platform.deployment.environment,
          deployedAt: platform.deployment.deployedAt,
          deployedBy: platform.deployment.deployedBy,
          commitHash: platform.deployment.commitHash,
          branch: platform.deployment.branch,
          buildInfo: platform.deployment.buildInfo,
          current: true
        },
        ...platform.deployment.rollbackHistory.slice(0, limit - 1).map(rollback => ({
          ...rollback,
          current: false
        }))
      ];

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            deployments: deploymentHistory,
            total: deploymentHistory.length + 1,
            currentVersion: platform.deployment.version
          },
          'Deployment history retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get deployment history', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets platform issues
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getPlatformIssues = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { severity, resolved } = req.query;

      logger.info('Getting platform issues', {
        platformId,
        severity,
        resolved,
        userId: req.user?.id
      });

      const platform = await platformService.getPlatformConfiguration({
        environment: req.query.environment
      });

      let issues = platform.status.issues || [];

      // Apply filters
      if (severity) {
        issues = issues.filter(i => i.severity === severity);
      }

      if (resolved !== undefined) {
        const showResolved = resolved === 'true';
        issues = issues.filter(i => showResolved ? !!i.resolvedAt : !i.resolvedAt);
      }

      const issuesSummary = {
        issues,
        total: issues.length,
        bySeverity: {
          critical: issues.filter(i => i.severity === 'critical').length,
          high: issues.filter(i => i.severity === 'high').length,
          medium: issues.filter(i => i.severity === 'medium').length,
          low: issues.filter(i => i.severity === 'low').length
        },
        active: issues.filter(i => !i.resolvedAt).length,
        resolved: issues.filter(i => !!i.resolvedAt).length
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          issuesSummary,
          'Platform issues retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get platform issues', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates platform status
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updatePlatformStatus = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { operational, message } = req.body;
      const userId = req.user.id;

      logger.info('Updating platform status', {
        platformId,
        operational,
        userId
      });

      const updates = {
        status: {
          operational,
          message
        }
      };

      const platform = await platformService.updatePlatformConfiguration(
        platformId,
        updates,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            status: platform.status,
            platformId: platform.platformId
          },
          'Platform status updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update platform status', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Bulk updates feature flags
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  bulkUpdateFeatureFlags = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.params;
      const { features } = req.body;
      const userId = req.user.id;

      logger.info('Bulk updating feature flags', {
        platformId,
        featureCount: features.length,
        userId
      });

      const results = [];
      const errors = [];

      for (const feature of features) {
        try {
          const result = await platformService.manageFeatureFlag(
            platformId,
            feature.name,
            feature.action,
            userId
          );
          results.push({
            featureName: feature.name,
            success: true,
            result
          });
        } catch (error) {
          errors.push({
            featureName: feature.name,
            success: false,
            error: error.message
          });
          logger.error('Failed to update feature flag in bulk operation', {
            featureName: feature.name,
            error: error.message
          });
        }
      }

      const response = {
        results,
        errors,
        summary: {
          total: features.length,
          successful: results.length,
          failed: errors.length
        }
      };

      const statusCode = errors.length === 0 ? StatusCodes.OK : StatusCodes.PARTIAL_CONTENT;
      const message = errors.length === 0 ? 
        'All feature flags updated successfully' : 
        `${results.length} feature flags updated, ${errors.length} failed`;

      return res.status(statusCode).json(
        responseFormatter.success(response, message)
      );
    } catch (error) {
      logger.error('Failed to bulk update feature flags', {
        platformId: req.params.platformId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });
}

// Export singleton instance
module.exports = new PlatformController();