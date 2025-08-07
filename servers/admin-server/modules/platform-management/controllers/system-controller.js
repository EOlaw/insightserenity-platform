'use strict';

/**
 * @fileoverview System health and monitoring controller
 * @module servers/admin-server/modules/platform-management/controllers/system-controller
 * @requires module:servers/admin-server/modules/platform-management/services/system-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/constants/status-codes
 */

const systemService = require('../services/system-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * @class SystemController
 * @description Controller for system health and monitoring operations
 */
class SystemController {
  /**
   * Initializes system monitoring
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  initializeSystem = asyncHandler(async (req, res, next) => {
    try {
      const systemInfo = req.body;
      const userId = req.user.id;

      logger.info('Initializing system monitoring', {
        hostname: systemInfo.hostname,
        environment: systemInfo.environment,
        userId
      });

      const system = await systemService.initializeSystem(systemInfo, userId);

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          system,
          'System monitoring initialized successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to initialize system', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system health status
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getSystemHealth = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const { detailed, noCache } = req.query;

      logger.info('Getting system health', {
        systemId,
        detailed,
        userId: req.user?.id
      });

      const options = {
        fromCache: noCache !== 'true',
        detailed: detailed === 'true'
      };

      const health = await systemService.getSystemHealth(systemId, options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          health,
          'System health retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get system health', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates system metrics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateSystemMetrics = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const metrics = req.body.metrics || null;

      logger.info('Updating system metrics', {
        systemId,
        hasCustomMetrics: !!metrics,
        userId: req.user?.id
      });

      const updatedMetrics = await systemService.updateSystemMetrics(systemId, metrics);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          updatedMetrics,
          'System metrics updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update system metrics', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates service health
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateServiceHealth = asyncHandler(async (req, res, next) => {
    try {
      const { systemId, serviceName } = req.params;
      const healthData = req.body;

      logger.info('Updating service health', {
        systemId,
        serviceName,
        status: healthData.status,
        userId: req.user?.id
      });

      const service = await systemService.updateServiceHealth(
        systemId,
        serviceName,
        healthData
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          service,
          'Service health updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update service health', {
        systemId: req.params.systemId,
        serviceName: req.params.serviceName,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Creates system alert
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  createSystemAlert = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const alertData = req.body;

      logger.info('Creating system alert', {
        systemId,
        type: alertData.type,
        severity: alertData.severity,
        userId: req.user?.id
      });

      const alert = await systemService.createSystemAlert(systemId, alertData);

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          alert,
          'System alert created successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to create system alert', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Acknowledges system alert
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  acknowledgeAlert = asyncHandler(async (req, res, next) => {
    try {
      const { systemId, alertId } = req.params;
      const userId = req.user.id;

      logger.info('Acknowledging system alert', {
        systemId,
        alertId,
        userId
      });

      const alert = await systemService.acknowledgeAlert(systemId, alertId, userId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          alert,
          'Alert acknowledged successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        systemId: req.params.systemId,
        alertId: req.params.alertId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Resolves system alert
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  resolveAlert = asyncHandler(async (req, res, next) => {
    try {
      const { systemId, alertId } = req.params;
      const { notes } = req.body;
      const userId = req.user.id;

      logger.info('Resolving system alert', {
        systemId,
        alertId,
        userId
      });

      const resolution = {
        userId,
        notes: notes || 'Alert resolved'
      };

      const alert = await systemService.resolveAlert(systemId, alertId, resolution);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          alert,
          'Alert resolved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to resolve alert', {
        systemId: req.params.systemId,
        alertId: req.params.alertId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system metrics history
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMetricsHistory = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const { 
        startDate,
        endDate,
        granularity = 'hour',
        metrics = 'cpu,memory,disk,network'
      } = req.query;

      logger.info('Getting metrics history', {
        systemId,
        startDate,
        endDate,
        granularity,
        userId: req.user?.id
      });

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
        granularity,
        metrics: metrics.split(',')
      };

      const history = await systemService.getMetricsHistory(systemId, options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            history,
            period: {
              start: options.startDate,
              end: options.endDate
            },
            granularity,
            dataPoints: history.length
          },
          'Metrics history retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get metrics history', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets active alerts
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getActiveAlerts = asyncHandler(async (req, res, next) => {
    try {
      const {
        environment,
        severity,
        acknowledged,
        page = 1,
        limit = 50
      } = req.query;

      logger.info('Getting active alerts', {
        environment,
        severity,
        acknowledged,
        userId: req.user?.id
      });

      const filters = {
        environment,
        severity,
        acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const results = await systemService.getActiveAlerts(filters);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          results,
          'Active alerts retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get active alerts', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets aggregated metrics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getAggregatedMetrics = asyncHandler(async (req, res, next) => {
    try {
      const {
        environment,
        startDate,
        endDate
      } = req.query;

      logger.info('Getting aggregated metrics', {
        environment,
        startDate,
        endDate,
        userId: req.user?.id
      });

      const options = {
        environment,
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date()
      };

      const metrics = await systemService.getAggregatedMetrics(options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          metrics,
          'Aggregated metrics retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get aggregated metrics', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates monitoring configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateMonitoringConfig = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const config = req.body;
      const userId = req.user.id;

      logger.info('Updating monitoring configuration', {
        systemId,
        configKeys: Object.keys(config),
        userId
      });

      const updatedConfig = await systemService.updateMonitoringConfig(
        systemId,
        config,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          updatedConfig,
          'Monitoring configuration updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update monitoring configuration', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Performs system health check
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  performHealthCheck = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;

      logger.info('Performing system health check', {
        systemId,
        userId: req.user?.id
      });

      const healthCheck = await systemService.performHealthCheck(systemId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          healthCheck,
          'Health check completed successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to perform health check', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets performance statistics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getPerformanceStats = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const { timeRange = '1h', noCache } = req.query;

      logger.info('Getting performance statistics', {
        systemId,
        timeRange,
        userId: req.user?.id
      });

      const options = {
        timeRange,
        fromCache: noCache !== 'true'
      };

      const stats = await systemService.getPerformanceStats(systemId, options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          stats,
          'Performance statistics retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get performance statistics', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Starts system monitoring
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  startMonitoring = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;

      logger.info('Starting system monitoring', {
        systemId,
        userId: req.user?.id
      });

      await systemService.startMonitoring(systemId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          { systemId, status: 'monitoring_started' },
          'System monitoring started successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to start monitoring', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Stops system monitoring
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  stopMonitoring = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;

      logger.info('Stopping system monitoring', {
        systemId,
        userId: req.user?.id
      });

      await systemService.stopMonitoring(systemId);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          { systemId, status: 'monitoring_stopped' },
          'System monitoring stopped successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to stop monitoring', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system services status
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getServicesStatus = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const { status } = req.query;

      logger.info('Getting services status', {
        systemId,
        statusFilter: status,
        userId: req.user?.id
      });

      const health = await systemService.getSystemHealth(systemId, {
        detailed: true,
        fromCache: false
      });

      let services = health.services || [];

      // Filter by status if provided
      if (status) {
        services = services.filter(s => s.status === status);
      }

      const servicesSummary = {
        services,
        total: services.length,
        byStatus: {
          healthy: services.filter(s => s.status === 'healthy').length,
          degraded: services.filter(s => s.status === 'degraded').length,
          unhealthy: services.filter(s => s.status === 'unhealthy').length,
          offline: services.filter(s => s.status === 'offline').length,
          unknown: services.filter(s => s.status === 'unknown').length
        }
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          servicesSummary,
          'Services status retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get services status', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system alert history
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getAlertHistory = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const {
        severity,
        startDate,
        endDate,
        resolved,
        limit = 100
      } = req.query;

      logger.info('Getting alert history', {
        systemId,
        severity,
        startDate,
        endDate,
        userId: req.user?.id
      });

      const health = await systemService.getSystemHealth(systemId, {
        detailed: true,
        fromCache: false
      });

      let alerts = health.activeAlerts || [];

      // Apply filters
      if (severity) {
        alerts = alerts.filter(a => a.severity === severity);
      }

      if (startDate) {
        const start = new Date(startDate);
        alerts = alerts.filter(a => new Date(a.triggeredAt) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        alerts = alerts.filter(a => new Date(a.triggeredAt) <= end);
      }

      if (resolved !== undefined) {
        const showResolved = resolved === 'true';
        alerts = alerts.filter(a => showResolved ? !!a.resolvedAt : !a.resolvedAt);
      }

      // Sort by triggered time (newest first)
      alerts.sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

      // Limit results
      alerts = alerts.slice(0, parseInt(limit));

      const alertsSummary = {
        alerts,
        total: alerts.length,
        bySeverity: {
          critical: alerts.filter(a => a.severity === 'critical').length,
          error: alerts.filter(a => a.severity === 'error').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
          info: alerts.filter(a => a.severity === 'info').length
        },
        active: alerts.filter(a => !a.resolvedAt).length,
        resolved: alerts.filter(a => !!a.resolvedAt).length
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          alertsSummary,
          'Alert history retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get alert history', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets system dashboard data
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getSystemDashboard = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const { timeRange = '1h' } = req.query;

      logger.info('Getting system dashboard data', {
        systemId,
        timeRange,
        userId: req.user?.id
      });

      // Get multiple data points in parallel
      const [health, stats, metrics] = await Promise.all([
        systemService.getSystemHealth(systemId, { detailed: false }),
        systemService.getPerformanceStats(systemId, { timeRange }),
        systemService.getMetricsHistory(systemId, {
          granularity: timeRange === '1h' ? 'minute' : 'hour',
          metrics: ['cpu', 'memory']
        })
      ]);

      const dashboard = {
        summary: {
          systemId,
          hostname: health.hostname,
          environment: health.environment,
          status: health.status,
          uptime: health.uptime,
          lastCheck: health.lastCheck
        },
        currentMetrics: health.metrics,
        services: health.services,
        alerts: {
          active: health.alerts.active,
          critical: health.alerts.critical
        },
        performance: {
          cpu: stats.cpu,
          memory: stats.memory,
          responseTime: stats.responseTime,
          requestRate: stats.requestRate,
          errorRate: stats.errorRate,
          availability: stats.availability
        },
        recentHistory: {
          timeRange,
          dataPoints: metrics.length,
          metrics: metrics.slice(-20) // Last 20 data points for charts
        }
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          dashboard,
          'System dashboard data retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get system dashboard', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Exports system metrics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  exportMetrics = asyncHandler(async (req, res, next) => {
    try {
      const { systemId } = req.params;
      const {
        startDate,
        endDate,
        format = 'json',
        metrics = 'all'
      } = req.query;

      logger.info('Exporting system metrics', {
        systemId,
        startDate,
        endDate,
        format,
        userId: req.user?.id
      });

      const options = {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
        granularity: 'raw',
        metrics: metrics === 'all' ? ['cpu', 'memory', 'disk', 'network'] : metrics.split(',')
      };

      const history = await systemService.getMetricsHistory(systemId, options);

      // Format based on requested format
      let exportData;
      let contentType;
      let filename;

      switch (format) {
        case 'csv':
          exportData = this.#convertToCSV(history);
          contentType = 'text/csv';
          filename = `system-metrics-${systemId}-${Date.now()}.csv`;
          break;

        case 'json':
        default:
          exportData = JSON.stringify({
            systemId,
            period: {
              start: options.startDate,
              end: options.endDate
            },
            metrics: history
          }, null, 2);
          contentType = 'application/json';
          filename = `system-metrics-${systemId}-${Date.now()}.json`;
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return res.status(StatusCodes.OK).send(exportData);
    } catch (error) {
      logger.error('Failed to export metrics', {
        systemId: req.params.systemId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Converts metrics to CSV format
   * @private
   * @param {Array} metrics - Metrics data
   * @returns {string} CSV formatted data
   */
  #convertToCSV(metrics) {
    if (!metrics || metrics.length === 0) {
      return 'timestamp,cpu_usage,memory_percentage,disk_percentage\n';
    }

    const headers = ['timestamp', 'cpu_usage', 'memory_percentage', 'disk_percentage'];
    const rows = metrics.map(m => [
      m.timestamp,
      m.cpu?.usage || 0,
      m.memory?.percentage || 0,
      m.disk?.percentage || 0
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }
}

// Export singleton instance
module.exports = new SystemController();