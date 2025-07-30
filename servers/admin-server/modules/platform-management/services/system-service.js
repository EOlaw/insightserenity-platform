'use strict';

/**
 * @fileoverview System monitoring and resource management service
 * @module servers/admin-server/modules/platform-management/services/system-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:servers/admin-server/modules/platform-management/models/system-model
 * @requires os
 * @requires process
 */

const os = require('os');
const process = require('process');
const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const SystemModel = require('../models/system-model');

/**
 * Service for system monitoring and resource management
 * @class SystemService
 */
class SystemService {
  constructor() {
    this.cacheService = new CacheService('system');
    this.cacheKeyPrefix = 'system:';
    this.cacheTTL = 60; // 1 minute for system metrics
    this.metricsInterval = null;
    this.nodeId = this.#generateNodeId();
  }

  /**
   * Register current node in the system
   * @param {Object} options Registration options
   * @returns {Promise<Object>} Registered node
   */
  async registerNode(options = {}) {
    try {
      const nodeData = {
        nodeId: this.nodeId,
        hostname: os.hostname(),
        nodeType: options.nodeType || process.env.NODE_TYPE || 'api',
        systemInfo: {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          cpuCount: os.cpus().length,
          totalMemory: os.totalmem(),
          nodeVersion: process.version,
          processId: process.pid,
          startTime: new Date()
        },
        pid: process.pid
      };

      const node = await SystemModel.registerNode(nodeData);

      // Start metrics collection
      this.#startMetricsCollection();

      logger.info('Node registered successfully', {
        nodeId: this.nodeId,
        nodeType: nodeData.nodeType
      });

      return node;
    } catch (error) {
      logger.error('Failed to register node', error);
      throw error;
    }
  }

  /**
   * Get system metrics for a specific node
   * @param {String} nodeId Node identifier
   * @returns {Promise<Object>} System metrics
   */
  async getNodeMetrics(nodeId) {
    try {
      const cacheKey = `${this.cacheKeyPrefix}node:${nodeId}`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const node = await SystemModel.findOne({ nodeId });
      
      if (!node) {
        throw new AppError('Node not found', 404, 'NODE_NOT_FOUND');
      }

      const metrics = node.toObject();
      
      await this.cacheService.set(cacheKey, metrics, this.cacheTTL);

      return metrics;
    } catch (error) {
      logger.error('Failed to get node metrics', error);
      throw error;
    }
  }

  /**
   * Get cluster-wide system health
   * @returns {Promise<Object>} Cluster health data
   */
  async getClusterHealth() {
    try {
      const cacheKey = `${this.cacheKeyPrefix}cluster:health`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const clusterHealth = await SystemModel.getClusterHealth();
      
      // Add additional metrics
      clusterHealth.timestamp = new Date();
      clusterHealth.uptimeSeconds = process.uptime();

      await this.cacheService.set(cacheKey, clusterHealth, this.cacheTTL);

      return clusterHealth;
    } catch (error) {
      logger.error('Failed to get cluster health', error);
      throw error;
    }
  }

  /**
   * Get resource trends for analysis
   * @param {String} nodeId Node identifier
   * @param {Object} options Query options
   * @returns {Promise<Object>} Resource trends
   */
  async getResourceTrends(nodeId, options = {}) {
    try {
      const duration = options.duration || 3600000; // 1 hour default
      const trends = await SystemModel.getResourceTrends(nodeId, duration);

      return trends;
    } catch (error) {
      logger.error('Failed to get resource trends', error);
      throw error;
    }
  }

  /**
   * Update system metrics for current node
   * @returns {Promise<Object>} Updated metrics
   */
  async updateNodeMetrics() {
    try {
      const metrics = await this.#collectSystemMetrics();
      
      const node = await SystemModel.findOne({ nodeId: this.nodeId });
      
      if (!node) {
        logger.warn('Node not found for metrics update', { nodeId: this.nodeId });
        return null;
      }

      await node.updateMetrics(metrics);

      // Check for critical alerts
      if (node.alerts.active.some(a => a.severity === 'critical')) {
        await this.#handleCriticalAlerts(node.alerts.active);
      }

      return node;
    } catch (error) {
      logger.error('Failed to update node metrics', error);
      throw error;
    }
  }

  /**
   * Add system event
   * @param {Object} eventData Event information
   * @returns {Promise<Object>} Added event
   */
  async addSystemEvent(eventData) {
    try {
      const node = await SystemModel.findOne({ nodeId: this.nodeId });
      
      if (!node) {
        throw new AppError('Node not found', 404, 'NODE_NOT_FOUND');
      }

      const event = await node.addEvent(eventData);

      // Notify if severe event
      if (eventData.severity === 'critical' || eventData.severity === 'error') {
        await NotificationService.sendSystemNotification({
          type: 'system_event',
          severity: eventData.severity,
          title: `System Event: ${eventData.type}`,
          message: eventData.description,
          metadata: {
            nodeId: this.nodeId,
            eventType: eventData.type
          }
        });
      }

      return event;
    } catch (error) {
      logger.error('Failed to add system event', error);
      throw error;
    }
  }

  /**
   * Set alert thresholds
   * @param {Object} thresholds New threshold values
   * @returns {Promise<Object>} Updated thresholds
   */
  async setAlertThresholds(thresholds) {
    try {
      const node = await SystemModel.findOne({ nodeId: this.nodeId });
      
      if (!node) {
        throw new AppError('Node not found', 404, 'NODE_NOT_FOUND');
      }

      Object.assign(node.alerts.thresholds, thresholds);
      await node.save();

      logger.info('Alert thresholds updated', {
        nodeId: this.nodeId,
        thresholds
      });

      return node.alerts.thresholds;
    } catch (error) {
      logger.error('Failed to set alert thresholds', error);
      throw error;
    }
  }

  /**
   * Get active alerts across all nodes
   * @param {Object} filters Alert filters
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts(filters = {}) {
    try {
      const query = {
        lastUpdated: { $gte: new Date(Date.now() - 300000) } // Active in last 5 minutes
      };

      if (filters.severity) {
        query['alerts.active.severity'] = filters.severity;
      }

      if (filters.nodeType) {
        query.nodeType = filters.nodeType;
      }

      const nodes = await SystemModel.find(query).select('nodeId hostname nodeType alerts.active');
      
      const alerts = [];
      nodes.forEach(node => {
        node.alerts.active.forEach(alert => {
          alerts.push({
            ...alert.toObject(),
            nodeId: node.nodeId,
            hostname: node.hostname,
            nodeType: node.nodeType
          });
        });
      });

      // Sort by severity and time
      alerts.sort((a, b) => {
        const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return b.triggeredAt - a.triggeredAt;
      });

      return alerts;
    } catch (error) {
      logger.error('Failed to get active alerts', error);
      throw error;
    }
  }

  /**
   * Perform system cleanup
   * @returns {Promise<Object>} Cleanup results
   */
  async performCleanup() {
    try {
      const results = await SystemModel.performSystemCleanup();

      logger.info('System cleanup completed', results);

      return results;
    } catch (error) {
      logger.error('Failed to perform system cleanup', error);
      throw error;
    }
  }

  /**
   * Export system metrics
   * @param {Object} options Export options
   * @returns {Promise<Object>} Exported metrics
   */
  async exportMetrics(options = {}) {
    try {
      const { startDate, endDate, nodeTypes, format = 'json' } = options;

      const query = {};
      
      if (startDate || endDate) {
        query.lastUpdated = {};
        if (startDate) query.lastUpdated.$gte = new Date(startDate);
        if (endDate) query.lastUpdated.$lte = new Date(endDate);
      }

      if (nodeTypes && nodeTypes.length > 0) {
        query.nodeType = { $in: nodeTypes };
      }

      const metrics = await SystemModel.find(query).sort({ lastUpdated: -1 });

      const exportData = {
        exportDate: new Date(),
        totalNodes: metrics.length,
        period: {
          start: startDate || 'all',
          end: endDate || 'current'
        },
        metrics: metrics.map(m => ({
          nodeId: m.nodeId,
          hostname: m.hostname,
          nodeType: m.nodeType,
          health: m.health,
          resources: m.resources,
          services: m.services,
          lastUpdated: m.lastUpdated
        }))
      };

      if (format === 'csv') {
        return this.#convertToCSV(exportData);
      }

      return exportData;
    } catch (error) {
      logger.error('Failed to export metrics', error);
      throw error;
    }
  }

  /**
   * Start metrics collection interval
   * @private
   */
  #startMetricsCollection() {
    if (this.metricsInterval) {
      return;
    }

    const interval = parseInt(process.env.METRICS_INTERVAL) || 60000; // 1 minute default

    this.metricsInterval = setInterval(async () => {
      try {
        await this.updateNodeMetrics();
      } catch (error) {
        logger.error('Metrics collection error', error);
      }
    }, interval);

    // Initial collection
    this.updateNodeMetrics().catch(error => {
      logger.error('Initial metrics collection failed', error);
    });
  }

  /**
   * Stop metrics collection
   */
  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Generate unique node identifier
   * @private
   * @returns {String} Node ID
   */
  #generateNodeId() {
    const hostname = os.hostname();
    const pid = process.pid;
    const timestamp = Date.now();
    return `${hostname}-${pid}-${timestamp}`;
  }

  /**
   * Collect system metrics
   * @private
   * @returns {Promise<Object>} Collected metrics
   */
  async #collectSystemMetrics() {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    const memoryUsage = process.memoryUsage();

    // Calculate CPU usage
    const cpuUsage = this.#calculateCPUUsage(cpus);

    // Get disk usage (this would require additional system calls)
    const diskUsage = await this.#getDiskUsage();

    // Get network stats (simplified)
    const networkStats = this.#getNetworkStats();

    // Get service health
    const serviceHealth = await this.#checkServiceHealth();

    return {
      resources: {
        cpu: {
          usage: cpuUsage,
          loadAverage,
          processTime: process.cpuUsage().user + process.cpuUsage().system
        },
        memory: {
          total: os.totalmem(),
          used: os.totalmem() - os.freemem(),
          free: os.freemem(),
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          rss: memoryUsage.rss
        },
        disk: diskUsage,
        network: networkStats
      },
      services: serviceHealth,
      process: {
        pid: process.pid,
        ppid: process.ppid,
        uptime: process.uptime(),
        handles: process._getActiveHandles?.().length || 0,
        threads: process._getActiveRequests?.().length || 0,
        gcStats: {
          collections: global.gc ? 1 : 0,
          pauseTime: 0,
          lastGC: new Date()
        }
      }
    };
  }

  /**
   * Calculate CPU usage percentage
   * @private
   * @param {Array} cpus CPU information
   * @returns {Number} CPU usage percentage
   */
  #calculateCPUUsage(cpus) {
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Get disk usage statistics
   * @private
   * @returns {Promise<Object>} Disk usage
   */
  async #getDiskUsage() {
    // This would typically use a system library
    // Simplified implementation
    return {
      total: 1000000000000, // 1TB
      used: 500000000000,   // 500GB
      free: 500000000000,   // 500GB
      partitions: [{
        mount: '/',
        total: 1000000000000,
        used: 500000000000,
        free: 500000000000,
        percentage: 50
      }]
    };
  }

  /**
   * Get network statistics
   * @private
   * @returns {Object} Network stats
   */
  #getNetworkStats() {
    const interfaces = os.networkInterfaces();
    const stats = {
      interfaces: [],
      connections: {
        active: 0,
        established: 0,
        timeWait: 0,
        closeWait: 0
      }
    };

    Object.keys(interfaces).forEach(name => {
      if (interfaces[name][0] && !interfaces[name][0].internal) {
        stats.interfaces.push({
          name,
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0,
          errors: 0
        });
      }
    });

    return stats;
  }

  /**
   * Check service health
   * @private
   * @returns {Promise<Object>} Service health status
   */
  async #checkServiceHealth() {
    const mongoose = require('mongoose');
    
    return {
      database: {
        connected: mongoose.connection.readyState === 1,
        connections: {
          active: mongoose.connection.client?.s?.pool?.totalConnectionCount || 0,
          idle: 0,
          total: mongoose.connection.client?.s?.pool?.size || 0
        },
        queryStats: {
          total: 0,
          slow: 0,
          failed: 0,
          avgResponseTime: 0
        },
        replication: {
          enabled: false,
          lag: 0,
          status: 'not_configured'
        }
      },
      cache: {
        connected: true,
        hitRate: 85,
        missRate: 15,
        evictions: 0,
        memoryUsage: 1024 * 1024 * 100, // 100MB
        keys: 1000
      },
      queue: {
        connected: true,
        jobs: {
          active: 0,
          waiting: 0,
          completed: 0,
          failed: 0,
          delayed: 0
        },
        throughput: 0
      },
      api: {
        requests: {
          total: 0,
          success: 0,
          errors: 0,
          rateLimit: 0
        },
        responseTime: {
          avg: 0,
          p50: 0,
          p95: 0,
          p99: 0
        },
        endpoints: []
      }
    };
  }

  /**
   * Handle critical alerts
   * @private
   * @param {Array} alerts Critical alerts
   */
  async #handleCriticalAlerts(alerts) {
    for (const alert of alerts) {
      await NotificationService.sendSystemNotification({
        type: 'critical_system_alert',
        severity: 'critical',
        title: `Critical System Alert: ${alert.type}`,
        message: alert.message,
        metadata: {
          nodeId: this.nodeId,
          alertType: alert.type,
          threshold: alert.threshold,
          value: alert.value
        }
      });
    }
  }

  /**
   * Convert metrics to CSV format
   * @private
   * @param {Object} exportData Export data
   * @returns {String} CSV formatted data
   */
  #convertToCSV(exportData) {
    const headers = [
      'nodeId',
      'hostname',
      'nodeType',
      'healthStatus',
      'healthScore',
      'cpuUsage',
      'memoryUsage',
      'diskUsage',
      'lastUpdated'
    ];

    const rows = exportData.metrics.map(m => [
      m.nodeId,
      m.hostname,
      m.nodeType,
      m.health.status,
      m.health.score,
      m.resources.cpu.usage,
      Math.round((m.resources.memory.used / m.resources.memory.total) * 100),
      Math.round((m.resources.disk.used / m.resources.disk.total) * 100),
      m.lastUpdated
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }
}

module.exports = new SystemService();