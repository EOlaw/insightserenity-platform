'use strict';

/**
 * @fileoverview System health and monitoring service
 * @module servers/admin-server/modules/platform-management/services/system-service
 * @requires module:servers/admin-server/modules/platform-management/models/system-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/transaction-manager
 * @requires os
 * @requires systeminformation
 */

const os = require('os');
const si = require('systeminformation');
const SystemModel = require('../../../../../shared/lib/database/models/admin-server/platform-management/system-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');

/**
 * @class SystemService
 * @description Service for system health monitoring and management
 */
class SystemService {
  /**
   * Creates an instance of SystemService
   * @constructor
   */
  constructor() {
    this.#cacheService = new CacheService({
      prefix: 'system:',
      ttl: 60 // 1 minute default TTL
    });
    this.#notificationService = new NotificationService();
    this.#auditService = new AuditService();
    this.#transactionManager = new TransactionManager();
    this.#monitoringIntervals = new Map();
    this.#metricsBuffer = new Map();
  }

  // Private fields
  #cacheService;
  #notificationService;
  #auditService;
  #transactionManager;
  #monitoringIntervals;
  #metricsBuffer;

  // Cache keys
  static CACHE_KEYS = {
    SYSTEM_HEALTH: 'health',
    SYSTEM_METRICS: 'metrics',
    SERVICE_STATUS: 'services',
    ACTIVE_ALERTS: 'alerts',
    PERFORMANCE_STATS: 'performance'
  };

  // Event types
  static EVENTS = {
    HEALTH_CHECK_COMPLETED: 'system.health.checked',
    METRICS_UPDATED: 'system.metrics.updated',
    ALERT_CREATED: 'system.alert.created',
    ALERT_RESOLVED: 'system.alert.resolved',
    SERVICE_STATUS_CHANGED: 'system.service.status_changed',
    THRESHOLD_EXCEEDED: 'system.threshold.exceeded'
  };

  // Alert severity levels
  static ALERT_SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
  };

  /**
   * Initializes system monitoring for a new environment
   * @async
   * @param {Object} systemInfo - System initialization data
   * @param {string} userId - User ID initializing the system
   * @returns {Promise<Object>} Created system record
   * @throws {AppError} If initialization fails
   */
  async initializeSystem(systemInfo, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Check if system already exists
      const existing = await SystemModel.findOne({
        hostname: systemInfo.hostname,
        environment: systemInfo.environment
      });

      if (existing) {
        throw new AppError(`System already initialized for ${systemInfo.hostname} in ${systemInfo.environment}`, 409);
      }

      // Gather system information
      const systemData = await this.#gatherSystemInfo();

      // Create system record
      const system = new SystemModel({
        ...systemInfo,
        systemInfo: systemData.systemInfo,
        metadata: {
          createdBy: userId
        }
      });

      // Set initial metrics
      system.metrics = await this.#collectSystemMetrics();

      // Save system
      await system.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'system.initialize',
        resource: 'system',
        resourceId: system.systemId,
        details: {
          hostname: system.hostname,
          environment: system.environment
        },
        session
      });

      await session.commitTransaction();

      logger.info('System initialized', {
        systemId: system.systemId,
        hostname: system.hostname,
        environment: system.environment,
        userId
      });

      // Start monitoring
      await this.startMonitoring(system.systemId);

      return system.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to initialize system', {
        error: error.message,
        userId
      });
      throw error instanceof AppError ? error : new AppError(`Failed to initialize system: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets system health status
   * @async
   * @param {string} systemId - System ID
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} System health status
   * @throws {AppError} If retrieval fails
   */
  async getSystemHealth(systemId, options = {}) {
    try {
      const { fromCache = true, detailed = false } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Get system record
      const system = await SystemModel.findOne({ systemId })
        .select(detailed ? '-history.metrics' : '-history -logs -auditTrail')
        .lean();

      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Build health response
      const health = {
        systemId: system.systemId,
        hostname: system.hostname,
        environment: system.environment,
        status: {
          overall: system.status.overall,
          message: system.status.message,
          lastUpdate: system.status.lastUpdate
        },
        metrics: {
          cpu: {
            usage: system.metrics.cpu.usage,
            status: this.#getMetricStatus(system.metrics.cpu.usage, system.monitoring.thresholds.cpu)
          },
          memory: {
            percentage: system.metrics.memory.percentage,
            status: this.#getMetricStatus(system.metrics.memory.percentage, system.monitoring.thresholds.memory)
          },
          disk: {
            percentage: Math.max(...system.metrics.disk.volumes.map(v => v.percentage || 0)),
            status: this.#getMetricStatus(
              Math.max(...system.metrics.disk.volumes.map(v => v.percentage || 0)),
              system.monitoring.thresholds.disk
            )
          }
        },
        services: {
          total: system.services.length,
          healthy: system.services.filter(s => s.status === 'healthy').length,
          degraded: system.services.filter(s => s.status === 'degraded').length,
          unhealthy: system.services.filter(s => s.status === 'unhealthy').length
        },
        alerts: {
          active: system.alerts.filter(a => !a.resolvedAt).length,
          critical: system.alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length
        },
        uptime: system.systemInfo.runtime.uptime,
        lastCheck: system.metrics.lastCheck || system.updatedAt
      };

      // Add detailed information if requested
      if (detailed) {
        health.detailedMetrics = system.metrics;
        health.activeAlerts = system.alerts.filter(a => !a.resolvedAt);
        health.services = system.services;
        health.performance = system.performance;
      }

      // Cache result
      if (fromCache) {
        const cacheKey = `${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`;
        await this.#cacheService.set(cacheKey, health, 30); // 30 seconds
      }

      return health;
    } catch (error) {
      logger.error('Failed to get system health', {
        systemId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get system health: ${error.message}`, 500);
    }
  }

  /**
   * Updates system metrics
   * @async
   * @param {string} systemId - System ID
   * @param {Object} [metrics] - Optional metrics to use (for testing)
   * @returns {Promise<Object>} Updated system metrics
   * @throws {AppError} If update fails
   */
  async updateSystemMetrics(systemId, metrics = null) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Collect metrics if not provided
      const newMetrics = metrics || await this.#collectSystemMetrics();

      // Buffer metrics for batch processing
      this.#bufferMetrics(systemId, newMetrics);

      // Update system metrics
      await system.updateMetrics(newMetrics);

      // Check for threshold violations
      const violations = await this.#checkThresholdViolations(system, newMetrics);
      
      if (violations.length > 0) {
        // Create alerts for violations
        for (const violation of violations) {
          await this.createSystemAlert(systemId, {
            type: 'metric',
            severity: violation.severity,
            title: violation.title,
            description: violation.description,
            source: violation.source,
            metric: violation.metric
          });
        }
      }

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_METRICS}:${systemId}`);
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`);

      // Emit event
      await this.#notificationService.emit(SystemService.EVENTS.METRICS_UPDATED, {
        systemId,
        metrics: newMetrics,
        timestamp: new Date()
      });

      logger.debug('System metrics updated', {
        systemId,
        cpu: newMetrics.cpu.usage,
        memory: newMetrics.memory.percentage
      });

      return newMetrics;
    } catch (error) {
      logger.error('Failed to update system metrics', {
        systemId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update system metrics: ${error.message}`, 500);
    }
  }

  /**
   * Updates service health status
   * @async
   * @param {string} systemId - System ID
   * @param {string} serviceName - Service name
   * @param {Object} healthData - Health data
   * @returns {Promise<Object>} Updated service health
   * @throws {AppError} If update fails
   */
  async updateServiceHealth(systemId, serviceName, healthData) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Update service health
      const previousStatus = system.services.find(s => s.serviceName === serviceName)?.status;
      const service = await system.updateServiceHealth(serviceName, healthData);

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SERVICE_STATUS}:${systemId}`);
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`);

      // Emit event if status changed
      if (previousStatus !== service.status) {
        await this.#notificationService.emit(SystemService.EVENTS.SERVICE_STATUS_CHANGED, {
          systemId,
          serviceName,
          previousStatus,
          newStatus: service.status,
          timestamp: new Date()
        });

        // Send notification for critical service issues
        if (service.status === 'unhealthy' || service.status === 'offline') {
          await this.#notificationService.sendToAdmins({
            type: 'system.service.unhealthy',
            title: `Service ${service.displayName || serviceName} is ${service.status}`,
            message: healthData.error?.message || `Service is reporting ${service.status} status`,
            severity: service.status === 'offline' ? 'critical' : 'high',
            data: {
              systemId,
              service
            }
          });
        }
      }

      logger.info('Service health updated', {
        systemId,
        serviceName,
        status: service.status,
        previousStatus
      });

      return service;
    } catch (error) {
      logger.error('Failed to update service health', {
        systemId,
        serviceName,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update service health: ${error.message}`, 500);
    }
  }

  /**
   * Creates a system alert
   * @async
   * @param {string} systemId - System ID
   * @param {Object} alertData - Alert data
   * @returns {Promise<Object>} Created alert
   * @throws {AppError} If creation fails
   */
  async createSystemAlert(systemId, alertData) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Create alert
      const alert = await system.createAlert(alertData);

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.ACTIVE_ALERTS}:${systemId}`);
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`);

      // Emit event
      await this.#notificationService.emit(SystemService.EVENTS.ALERT_CREATED, {
        systemId,
        alert,
        timestamp: new Date()
      });

      // Send immediate notification for critical alerts
      if (alert.severity === SystemService.ALERT_SEVERITY.CRITICAL) {
        await this.#notificationService.sendToAdmins({
          type: 'system.alert.critical',
          title: alert.title,
          message: alert.description,
          severity: 'critical',
          data: {
            systemId,
            alertId: alert.alertId,
            source: alert.source
          }
        });
      }

      logger.info('System alert created', {
        systemId,
        alertId: alert.alertId,
        type: alert.type,
        severity: alert.severity
      });

      return alert;
    } catch (error) {
      logger.error('Failed to create system alert', {
        systemId,
        alertData,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to create system alert: ${error.message}`, 500);
    }
  }

  /**
   * Acknowledges an alert
   * @async
   * @param {string} systemId - System ID
   * @param {string} alertId - Alert ID
   * @param {string} userId - User acknowledging the alert
   * @returns {Promise<Object>} Acknowledged alert
   * @throws {AppError} If acknowledgment fails
   */
  async acknowledgeAlert(systemId, alertId, userId) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Acknowledge alert
      const alert = await system.acknowledgeAlert(alertId, userId);

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.ACTIVE_ALERTS}:${systemId}`);

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'alert.acknowledge',
        resource: 'system_alert',
        resourceId: alertId,
        details: {
          systemId,
          alertId,
          severity: alert.severity
        }
      });

      logger.info('Alert acknowledged', {
        systemId,
        alertId,
        userId
      });

      return alert;
    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        systemId,
        alertId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to acknowledge alert: ${error.message}`, 500);
    }
  }

  /**
   * Resolves an alert
   * @async
   * @param {string} systemId - System ID
   * @param {string} alertId - Alert ID
   * @param {Object} resolution - Resolution details
   * @returns {Promise<Object>} Resolved alert
   * @throws {AppError} If resolution fails
   */
  async resolveAlert(systemId, alertId, resolution) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Resolve alert
      const alert = await system.resolveAlert(alertId, resolution);

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.ACTIVE_ALERTS}:${systemId}`);
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`);

      // Emit event
      await this.#notificationService.emit(SystemService.EVENTS.ALERT_RESOLVED, {
        systemId,
        alert,
        resolution,
        timestamp: new Date()
      });

      // Create audit entry
      await this.#auditService.log({
        userId: resolution.userId,
        action: 'alert.resolve',
        resource: 'system_alert',
        resourceId: alertId,
        details: {
          systemId,
          alertId,
          resolution: resolution.notes
        }
      });

      logger.info('Alert resolved', {
        systemId,
        alertId,
        userId: resolution.userId
      });

      return alert;
    } catch (error) {
      logger.error('Failed to resolve alert', {
        systemId,
        alertId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to resolve alert: ${error.message}`, 500);
    }
  }

  /**
   * Gets system metrics history
   * @async
   * @param {string} systemId - System ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Metrics history
   * @throws {AppError} If retrieval fails
   */
  async getMetricsHistory(systemId, options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate = new Date(),
        granularity = 'hour',
        metrics = ['cpu', 'memory', 'disk', 'network']
      } = options;

      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Get metrics history
      const history = await system.getMetricsHistory({
        startDate,
        endDate,
        granularity,
        metrics
      });

      return history;
    } catch (error) {
      logger.error('Failed to get metrics history', {
        systemId,
        options,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get metrics history: ${error.message}`, 500);
    }
  }

  /**
   * Gets active alerts across systems
   * @async
   * @param {Object} [filters={}] - Query filters
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts(filters = {}) {
    try {
      const {
        environment,
        severity,
        acknowledged,
        page = 1,
        limit = 50
      } = filters;

      // Build query
      const query = {};
      
      if (environment) {
        query.environment = environment;
      }

      // Find systems with active alerts
      const systems = await SystemModel.findWithActiveAlerts(severity);

      // Extract and filter alerts
      const allAlerts = [];
      
      for (const system of systems) {
        const activeAlerts = system.alerts.filter(alert => {
          if (alert.resolvedAt) return false;
          if (severity && alert.severity !== severity) return false;
          if (acknowledged !== undefined && !!alert.acknowledgedAt !== acknowledged) return false;
          return true;
        });

        for (const alert of activeAlerts) {
          allAlerts.push({
            ...alert.toObject(),
            systemId: system.systemId,
            hostname: system.hostname,
            environment: system.environment
          });
        }
      }

      // Sort by severity and timestamp
      const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
      allAlerts.sort((a, b) => {
        if (a.severity !== b.severity) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return b.triggeredAt - a.triggeredAt;
      });

      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAlerts = allAlerts.slice(startIndex, endIndex);

      return {
        alerts: paginatedAlerts,
        pagination: {
          total: allAlerts.length,
          page,
          limit,
          pages: Math.ceil(allAlerts.length / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get active alerts', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to get active alerts: ${error.message}`, 500);
    }
  }

  /**
   * Gets aggregated system metrics
   * @async
   * @param {Object} options - Aggregation options
   * @returns {Promise<Object>} Aggregated metrics
   */
  async getAggregatedMetrics(options = {}) {
    try {
      const {
        environment,
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate = new Date()
      } = options;

      // Get aggregated metrics from database
      const aggregated = await SystemModel.getAggregatedMetrics({
        environment,
        startDate,
        endDate
      });

      // Format response
      const metrics = {
        timeRange: { startDate, endDate },
        environment,
        summary: {
          avgCpu: 0,
          avgMemory: 0,
          avgResponseTime: 0,
          totalRequests: 0
        },
        timeline: []
      };

      // Calculate summary and build timeline
      for (const data of aggregated) {
        metrics.summary.avgCpu += data.avgCpu;
        metrics.summary.avgMemory += data.avgMemory;
        metrics.summary.avgResponseTime += data.avgResponseTime;
        metrics.summary.totalRequests += data.totalRequests;

        metrics.timeline.push({
          timestamp: new Date(2024, 0, data._id.day, data._id.hour),
          cpu: data.avgCpu,
          memory: data.avgMemory,
          responseTime: data.avgResponseTime,
          requests: data.totalRequests
        });
      }

      // Calculate averages
      if (aggregated.length > 0) {
        metrics.summary.avgCpu /= aggregated.length;
        metrics.summary.avgMemory /= aggregated.length;
        metrics.summary.avgResponseTime /= aggregated.length;
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to get aggregated metrics', {
        options,
        error: error.message
      });
      throw new AppError(`Failed to get aggregated metrics: ${error.message}`, 500);
    }
  }

  /**
   * Starts monitoring for a system
   * @async
   * @param {string} systemId - System ID
   * @returns {Promise<void>}
   */
  async startMonitoring(systemId) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Check if already monitoring
      if (this.#monitoringIntervals.has(systemId)) {
        logger.warn('Monitoring already active for system', { systemId });
        return;
      }

      // Start monitoring interval
      const interval = setInterval(async () => {
        try {
          await this.updateSystemMetrics(systemId);
        } catch (error) {
          logger.error('Error in monitoring interval', {
            systemId,
            error: error.message
          });
        }
      }, system.monitoring.interval * 1000);

      this.#monitoringIntervals.set(systemId, interval);

      logger.info('Monitoring started for system', {
        systemId,
        interval: system.monitoring.interval
      });
    } catch (error) {
      logger.error('Failed to start monitoring', {
        systemId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to start monitoring: ${error.message}`, 500);
    }
  }

  /**
   * Stops monitoring for a system
   * @async
   * @param {string} systemId - System ID
   * @returns {Promise<void>}
   */
  async stopMonitoring(systemId) {
    try {
      const interval = this.#monitoringIntervals.get(systemId);
      
      if (interval) {
        clearInterval(interval);
        this.#monitoringIntervals.delete(systemId);
        
        logger.info('Monitoring stopped for system', { systemId });
      }
    } catch (error) {
      logger.error('Failed to stop monitoring', {
        systemId,
        error: error.message
      });
    }
  }

  /**
   * Updates monitoring configuration
   * @async
   * @param {string} systemId - System ID
   * @param {Object} config - Monitoring configuration
   * @param {string} userId - User ID updating configuration
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async updateMonitoringConfig(systemId, config, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Get system
      const system = await SystemModel.findOne({ systemId }).session(session);
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Update monitoring configuration
      Object.assign(system.monitoring, config);

      // Save changes
      await system.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'system.monitoring.update',
        resource: 'system',
        resourceId: systemId,
        details: {
          changes: Object.keys(config)
        },
        session
      });

      await session.commitTransaction();

      // Restart monitoring if interval changed
      if (config.interval !== undefined) {
        await this.stopMonitoring(systemId);
        await this.startMonitoring(systemId);
      }

      logger.info('Monitoring configuration updated', {
        systemId,
        changes: Object.keys(config),
        userId
      });

      return system.monitoring.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update monitoring configuration', {
        systemId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update monitoring configuration: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Performs system health check
   * @async
   * @param {string} systemId - System ID
   * @returns {Promise<Object>} Health check results
   * @throws {AppError} If health check fails
   */
  async performHealthCheck(systemId) {
    try {
      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Collect current metrics
      const metrics = await this.#collectSystemMetrics();
      await system.updateMetrics(metrics);

      // Check all services
      const serviceChecks = await this.#checkAllServices(system);
      
      for (const serviceCheck of serviceChecks) {
        await system.updateServiceHealth(serviceCheck.serviceName, serviceCheck);
      }

      // Save system
      await system.save();

      // Build health check response
      const healthCheck = {
        timestamp: new Date(),
        systemId: system.systemId,
        status: system.status.overall,
        healthScore: system.healthScore,
        metrics: {
          cpu: system.metrics.cpu,
          memory: system.metrics.memory,
          disk: system.metrics.disk
        },
        services: system.services.map(s => ({
          name: s.serviceName,
          status: s.status,
          responseTime: s.responseTime?.current
        })),
        alerts: {
          active: system.alerts.filter(a => !a.resolvedAt).length,
          critical: system.alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length
        }
      };

      // Clear cache
      await this.#cacheService.delete(`${SystemService.CACHE_KEYS.SYSTEM_HEALTH}:${systemId}`);

      // Emit event
      await this.#notificationService.emit(SystemService.EVENTS.HEALTH_CHECK_COMPLETED, {
        systemId,
        healthCheck,
        timestamp: new Date()
      });

      logger.info('Health check completed', {
        systemId,
        status: system.status.overall,
        healthScore: system.healthScore
      });

      return healthCheck;
    } catch (error) {
      logger.error('Failed to perform health check', {
        systemId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to perform health check: ${error.message}`, 500);
    }
  }

  /**
   * Gets system performance statistics
   * @async
   * @param {string} systemId - System ID
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Performance statistics
   */
  async getPerformanceStats(systemId, options = {}) {
    try {
      const { timeRange = '1h', fromCache = true } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${SystemService.CACHE_KEYS.PERFORMANCE_STATS}:${systemId}:${timeRange}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Get system
      const system = await SystemModel.findOne({ systemId });
      if (!system) {
        throw new AppError('System not found', 404);
      }

      // Calculate time range
      const timeRangeMs = this.#parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      // Get metrics from buffer
      const bufferedMetrics = this.#metricsBuffer.get(systemId) || [];
      const recentMetrics = bufferedMetrics.filter(m => m.timestamp >= startTime);

      // Calculate statistics
      const stats = {
        systemId,
        timeRange,
        period: {
          start: startTime,
          end: new Date()
        },
        cpu: this.#calculateStats(recentMetrics.map(m => m.cpu?.usage).filter(Boolean)),
        memory: this.#calculateStats(recentMetrics.map(m => m.memory?.percentage).filter(Boolean)),
        responseTime: this.#calculateStats(recentMetrics.map(m => m.performance?.responseTime).filter(Boolean)),
        requestRate: this.#calculateStats(recentMetrics.map(m => m.performance?.requestsPerSecond).filter(Boolean)),
        errorRate: this.#calculateStats(recentMetrics.map(m => m.performance?.errorRate).filter(Boolean)),
        availability: this.#calculateAvailability(system, startTime)
      };

      // Cache result
      if (fromCache) {
        const cacheKey = `${SystemService.CACHE_KEYS.PERFORMANCE_STATS}:${systemId}:${timeRange}`;
        await this.#cacheService.set(cacheKey, stats, 60); // 1 minute
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get performance statistics', {
        systemId,
        options,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to get performance statistics: ${error.message}`, 500);
    }
  }

  // Private helper methods

  /**
   * Gathers system information
   * @private
   * @returns {Promise<Object>} System information
   */
  async #gatherSystemInfo() {
    try {
      const [osInfo, cpu, mem, fsSize, networkInterfaces] = await Promise.all([
        si.osInfo(),
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.networkInterfaces()
      ]);

      return {
        systemInfo: {
          os: {
            platform: osInfo.platform,
            release: osInfo.release,
            arch: osInfo.arch,
            hostname: os.hostname()
          },
          runtime: {
            name: 'node',
            version: process.version,
            uptime: process.uptime()
          },
          server: {
            type: 'express',
            version: require('express/package.json').version,
            port: process.env.PORT || 3000
          }
        },
        hardware: {
          cpu: {
            manufacturer: cpu.manufacturer,
            brand: cpu.brand,
            cores: cpu.cores,
            speed: cpu.speed
          },
          memory: {
            total: mem.total
          },
          disk: fsSize,
          network: networkInterfaces
        }
      };
    } catch (error) {
      logger.error('Failed to gather system information', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Collects current system metrics
   * @private
   * @returns {Promise<Object>} System metrics
   */
  async #collectSystemMetrics() {
    try {
      const [currentLoad, mem, fsSize, networkStats, processes] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.processes()
      ]);

      return {
        cpu: {
          usage: Math.round(currentLoad.currentLoad),
          cores: currentLoad.cpus.length,
          loadAverage: currentLoad.avgLoad ? [
            currentLoad.avgLoad.toFixed(2),
            currentLoad.avgLoad.toFixed(2),
            currentLoad.avgLoad.toFixed(2)
          ] : [0, 0, 0],
          processes: processes.all
        },
        memory: {
          used: mem.used,
          total: mem.total,
          percentage: Math.round((mem.used / mem.total) * 100),
          heap: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal
          },
          rss: process.memoryUsage().rss
        },
        disk: {
          volumes: fsSize.map(fs => ({
            path: fs.mount,
            filesystem: fs.fs,
            used: fs.used,
            available: fs.available,
            total: fs.size,
            percentage: Math.round(fs.use)
          }))
        },
        network: {
          interfaces: networkStats.map(net => ({
            name: net.iface,
            bytesReceived: net.rx_bytes,
            bytesSent: net.tx_bytes,
            packetsReceived: net.rx_dropped,
            packetsSent: net.tx_dropped
          }))
        }
      };
    } catch (error) {
      logger.error('Failed to collect system metrics', {
        error: error.message
      });
      // Return default metrics on error
      return {
        cpu: { usage: 0, cores: os.cpus().length, loadAverage: [0, 0, 0] },
        memory: { used: 0, total: 0, percentage: 0 },
        disk: { volumes: [] },
        network: { interfaces: [] }
      };
    }
  }

  /**
   * Buffers metrics for performance analysis
   * @private
   * @param {string} systemId - System ID
   * @param {Object} metrics - Metrics to buffer
   */
  #bufferMetrics(systemId, metrics) {
    if (!this.#metricsBuffer.has(systemId)) {
      this.#metricsBuffer.set(systemId, []);
    }

    const buffer = this.#metricsBuffer.get(systemId);
    buffer.push({
      timestamp: new Date(),
      ...metrics
    });

    // Keep only last 1000 metrics (approximately 16 hours at 1-minute intervals)
    if (buffer.length > 1000) {
      buffer.shift();
    }
  }

  /**
   * Checks threshold violations
   * @private
   * @param {Object} system - System instance
   * @param {Object} metrics - Current metrics
   * @returns {Array} Threshold violations
   */
  #checkThresholdViolations(system, metrics) {
    const violations = [];
    const thresholds = system.monitoring.thresholds;

    // CPU threshold check
    if (metrics.cpu.usage >= thresholds.cpu.critical) {
      violations.push({
        severity: 'critical',
        title: 'Critical CPU Usage',
        description: `CPU usage is at ${metrics.cpu.usage}%`,
        source: 'cpu',
        metric: {
          name: 'cpu.usage',
          value: metrics.cpu.usage,
          threshold: thresholds.cpu.critical
        }
      });
    } else if (metrics.cpu.usage >= thresholds.cpu.warning) {
      violations.push({
        severity: 'warning',
        title: 'High CPU Usage',
        description: `CPU usage is at ${metrics.cpu.usage}%`,
        source: 'cpu',
        metric: {
          name: 'cpu.usage',
          value: metrics.cpu.usage,
          threshold: thresholds.cpu.warning
        }
      });
    }

    // Memory threshold check
    if (metrics.memory.percentage >= thresholds.memory.critical) {
      violations.push({
        severity: 'critical',
        title: 'Critical Memory Usage',
        description: `Memory usage is at ${metrics.memory.percentage}%`,
        source: 'memory',
        metric: {
          name: 'memory.percentage',
          value: metrics.memory.percentage,
          threshold: thresholds.memory.critical
        }
      });
    } else if (metrics.memory.percentage >= thresholds.memory.warning) {
      violations.push({
        severity: 'warning',
        title: 'High Memory Usage',
        description: `Memory usage is at ${metrics.memory.percentage}%`,
        source: 'memory',
        metric: {
          name: 'memory.percentage',
          value: metrics.memory.percentage,
          threshold: thresholds.memory.warning
        }
      });
    }

    // Disk threshold check
    for (const volume of metrics.disk.volumes) {
      if (volume.percentage >= thresholds.disk.critical) {
        violations.push({
          severity: 'critical',
          title: 'Critical Disk Usage',
          description: `Disk usage on ${volume.path} is at ${volume.percentage}%`,
          source: 'disk',
          metric: {
            name: 'disk.percentage',
            value: volume.percentage,
            threshold: thresholds.disk.critical,
            volume: volume.path
          }
        });
      } else if (volume.percentage >= thresholds.disk.warning) {
        violations.push({
          severity: 'warning',
          title: 'High Disk Usage',
          description: `Disk usage on ${volume.path} is at ${volume.percentage}%`,
          source: 'disk',
          metric: {
            name: 'disk.percentage',
            value: volume.percentage,
            threshold: thresholds.disk.warning,
            volume: volume.path
          }
        });
      }
    }

    return violations;
  }

  /**
   * Checks all services health
   * @private
   * @param {Object} system - System instance
   * @returns {Promise<Array>} Service health checks
   */
  async #checkAllServices(system) {
    const serviceChecks = [];

    // Check database service
    try {
      const dbStart = Date.now();
      // Simulate database check
      const dbHealthy = true; // In production, actually check database
      
      serviceChecks.push({
        serviceName: 'database',
        displayName: 'Database Service',
        type: 'database',
        status: dbHealthy ? 'healthy' : 'unhealthy',
        responseTime: {
          current: Date.now() - dbStart
        }
      });
    } catch (error) {
      serviceChecks.push({
        serviceName: 'database',
        displayName: 'Database Service',
        type: 'database',
        status: 'unhealthy',
        error: {
          message: error.message,
          code: 'DB_CHECK_FAILED'
        }
      });
    }

    // Check cache service
    try {
      const cacheStart = Date.now();
      await this.#cacheService.ping();
      
      serviceChecks.push({
        serviceName: 'cache',
        displayName: 'Cache Service',
        type: 'cache',
        status: 'healthy',
        responseTime: {
          current: Date.now() - cacheStart
        }
      });
    } catch (error) {
      serviceChecks.push({
        serviceName: 'cache',
        displayName: 'Cache Service',
        type: 'cache',
        status: 'degraded',
        error: {
          message: error.message,
          code: 'CACHE_CHECK_FAILED'
        }
      });
    }

    // Check API service
    try {
      const apiStart = Date.now();
      // Simulate API health check
      const apiHealthy = true; // In production, check actual API endpoint
      
      serviceChecks.push({
        serviceName: 'api',
        displayName: 'API Service',
        type: 'api',
        status: apiHealthy ? 'healthy' : 'unhealthy',
        responseTime: {
          current: Date.now() - apiStart
        }
      });
    } catch (error) {
      serviceChecks.push({
        serviceName: 'api',
        displayName: 'API Service',
        type: 'api',
        status: 'unhealthy',
        error: {
          message: error.message,
          code: 'API_CHECK_FAILED'
        }
      });
    }

    return serviceChecks;
  }

  /**
   * Gets metric status based on thresholds
   * @private
   * @param {number} value - Metric value
   * @param {Object} thresholds - Threshold configuration
   * @returns {string} Metric status
   */
  #getMetricStatus(value, thresholds) {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'healthy';
  }

  /**
   * Parses time range string to milliseconds
   * @private
   * @param {string} timeRange - Time range string (e.g., '1h', '24h', '7d')
   * @returns {number} Milliseconds
   */
  #parseTimeRange(timeRange) {
    const units = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000
    };

    const match = timeRange.match(/^(\d+)([mhdw])$/);
    if (!match) {
      throw new AppError('Invalid time range format', 400);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Calculates statistics from values
   * @private
   * @param {Array<number>} values - Numeric values
   * @returns {Object} Statistics
   */
  #calculateStats(values) {
    if (!values || values.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        current: 0,
        count: 0
      };
    }

    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      current: values[values.length - 1],
      count: values.length,
      p50: sorted[Math.floor(values.length * 0.5)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)]
    };
  }

  /**
   * Calculates system availability
   * @private
   * @param {Object} system - System instance
   * @param {Date} startTime - Start time for calculation
   * @returns {number} Availability percentage
   */
  #calculateAvailability(system, startTime) {
    const totalTime = Date.now() - startTime.getTime();
    
    // Calculate downtime from alerts
    let downtimeMs = 0;
    const relevantAlerts = system.alerts.filter(a => 
      a.severity === 'critical' && 
      a.triggeredAt >= startTime
    );

    for (const alert of relevantAlerts) {
      const alertStart = Math.max(alert.triggeredAt.getTime(), startTime.getTime());
      const alertEnd = alert.resolvedAt ? 
        alert.resolvedAt.getTime() : 
        Date.now();
      
      downtimeMs += (alertEnd - alertStart);
    }

    const uptimeMs = totalTime - downtimeMs;
    return Math.max(0, Math.min(100, (uptimeMs / totalTime) * 100));
  }
}

// Export singleton instance
module.exports = new SystemService();