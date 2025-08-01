'use strict';

/**
 * @fileoverview Performance logger middleware for tracking application performance metrics
 * @module shared/lib/middleware/logging/performance-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/config
 * @requires module:perf_hooks
 * @requires module:v8
 * @requires module:os
 */

const logger = require('../../utils/logger');
const CacheService = require('../../services/cache-service');
const NotificationService = require('../../services/notification-service');
const config = require('..\helmet-config');
const { performance, PerformanceObserver } = require('perf_hooks');
const v8 = require('v8');
const os = require('os');

/**
 * @class PerformanceLogger
 * @description Advanced performance monitoring with real-time metrics, bottleneck detection,
 * and integration with APM (Application Performance Monitoring) services
 */
class PerformanceLogger {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {NotificationService}
   */
  #notificationService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #performanceMetrics;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #activeOperations;

  /**
   * @private
   * @type {PerformanceObserver}
   */
  #performanceObserver;

  /**
   * @private
   * @type {Object}
   */
  #systemMetrics;

  /**
   * @private
   * @type {Set<string>}
   */
  #slowOperations;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enabled: process.env.PERFORMANCE_LOGGER_ENABLED !== 'false',
    samplingRate: parseFloat(process.env.PERFORMANCE_LOGGER_SAMPLING_RATE || '1.0'),
    slowThreshold: parseInt(process.env.PERFORMANCE_LOGGER_SLOW_THRESHOLD || '1000', 10), // 1 second
    memoryThreshold: parseInt(process.env.PERFORMANCE_LOGGER_MEMORY_THRESHOLD || '512', 10), // 512MB
    cpuThreshold: parseFloat(process.env.PERFORMANCE_LOGGER_CPU_THRESHOLD || '80'), // 80%
    captureStackTraces: process.env.PERFORMANCE_LOGGER_CAPTURE_STACK === 'true',
    enableGC: process.env.PERFORMANCE_LOGGER_ENABLE_GC === 'true',
    enableHeapSnapshot: process.env.PERFORMANCE_LOGGER_ENABLE_HEAP_SNAPSHOT === 'true',
    metricsInterval: parseInt(process.env.PERFORMANCE_LOGGER_METRICS_INTERVAL || '60000', 10), // 1 minute
    aggregationWindow: parseInt(process.env.PERFORMANCE_LOGGER_AGGREGATION_WINDOW || '300000', 10), // 5 minutes
    metrics: {
      http: true,
      database: true,
      cache: true,
      external: true,
      custom: true
    },
    thresholds: {
      http: {
        p50: 100,  // 100ms
        p95: 500,  // 500ms
        p99: 1000  // 1s
      },
      database: {
        p50: 50,   // 50ms
        p95: 200,  // 200ms
        p99: 500   // 500ms
      }
    },
    alerts: {
      enabled: process.env.PERFORMANCE_ALERTS_ENABLED === 'true',
      slowRequestThreshold: 10, // 10 slow requests in window
      memoryLeakThreshold: 0.1, // 10% growth per hour
      errorRateThreshold: 0.05  // 5% error rate
    },
    externalServices: {
      newRelic: {
        enabled: process.env.NEW_RELIC_ENABLED === 'true',
        appName: process.env.NEW_RELIC_APP_NAME,
        licenseKey: process.env.NEW_RELIC_LICENSE_KEY
      },
      datadog: {
        enabled: process.env.DATADOG_APM_ENABLED === 'true',
        service: process.env.DATADOG_SERVICE_NAME || 'insightserenity-api'
      },
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED === 'true',
        pushGateway: process.env.PROMETHEUS_PUSH_GATEWAY
      }
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #METRIC_TYPES = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    SUMMARY: 'summary'
  };

  /**
   * Creates PerformanceLogger instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {NotificationService} [notificationService] - Notification service instance
   */
  constructor(options = {}, cacheService, notificationService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#notificationService = notificationService || new NotificationService();
    this.#performanceMetrics = new Map();
    this.#activeOperations = new Map();
    this.#systemMetrics = {};
    this.#slowOperations = new Set();

    // Initialize performance monitoring
    this.#initializePerformanceMonitoring();

    // Initialize external services
    this.#initializeExternalServices();

    // Start system metrics collection
    this.#startSystemMetricsCollection();

    logger.info('PerformanceLogger initialized', {
      enabled: this.#config.enabled,
      samplingRate: this.#config.samplingRate,
      metricsInterval: this.#config.metricsInterval
    });
  }

  /**
   * Express middleware for performance tracking
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware
   */
  middleware = (options = {}) => {
    return (req, res, next) => {
      if (!this.#config.enabled || !this.#shouldSample()) {
        return next();
      }

      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();
      const operationId = this.#generateOperationId();

      // Track operation
      const operation = {
        id: operationId,
        type: 'http',
        method: req.method,
        path: req.route?.path || req.path,
        url: req.originalUrl,
        startTime,
        startMemory
      };

      this.#activeOperations.set(operationId, operation);

      // Capture request details
      req.performanceData = {
        operationId,
        startTime,
        marks: new Map()
      };

      // Override res.json and res.send to capture response timing
      const originalJson = res.json;
      const originalSend = res.send;

      res.json = function(...args) {
        req.performanceData.responseStart = process.hrtime.bigint();
        return originalJson.apply(this, args);
      };

      res.send = function(...args) {
        req.performanceData.responseStart = process.hrtime.bigint();
        return originalSend.apply(this, args);
      };

      // Complete tracking on response finish
      res.on('finish', () => {
        this.#completeOperation(operationId, {
          statusCode: res.statusCode,
          responseSize: res.get('content-length')
        });
      });

      // Handle errors
      res.on('error', (error) => {
        this.#completeOperation(operationId, {
          error: error.message,
          statusCode: res.statusCode
        });
      });

      next();
    };
  };

  /**
   * Tracks a custom operation
   * @param {string} name - Operation name
   * @param {string} [type='custom'] - Operation type
   * @returns {Object} Operation tracker
   */
  trackOperation(name, type = 'custom') {
    if (!this.#config.enabled || !this.#shouldSample()) {
      return {
        end: () => {},
        mark: () => {},
        measure: () => {}
      };
    }

    const operationId = this.#generateOperationId();
    const startTime = process.hrtime.bigint();
    const startMark = `${operationId}:start`;

    performance.mark(startMark);

    const operation = {
      id: operationId,
      name,
      type,
      startTime,
      startMark,
      marks: new Map()
    };

    this.#activeOperations.set(operationId, operation);

    return {
      /**
       * Ends the operation tracking
       * @param {Object} [metadata] - Additional metadata
       */
      end: (metadata = {}) => {
        this.#completeOperation(operationId, metadata);
      },

      /**
       * Marks a point in the operation
       * @param {string} name - Mark name
       */
      mark: (name) => {
        const markName = `${operationId}:${name}`;
        performance.mark(markName);
        operation.marks.set(name, process.hrtime.bigint());
      },

      /**
       * Measures between two marks
       * @param {string} name - Measurement name
       * @param {string} startMark - Start mark name
       * @param {string} endMark - End mark name
       */
      measure: (name, startMark, endMark) => {
        try {
          performance.measure(
            `${operationId}:${name}`,
            `${operationId}:${startMark}`,
            `${operationId}:${endMark}`
          );
        } catch (error) {
          logger.error('Failed to create performance measure', {
            error: error.message,
            operationId
          });
        }
      }
    };
  }

  /**
   * Records a performance metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} [tags] - Metric tags
   * @param {string} [type] - Metric type
   */
  recordMetric(name, value, tags = {}, type = PerformanceLogger.#METRIC_TYPES.GAUGE) {
    if (!this.#config.enabled) return;

    const metric = {
      name,
      value,
      type,
      tags,
      timestamp: Date.now()
    };

    // Store metric
    const key = this.#getMetricKey(name, tags);
    if (!this.#performanceMetrics.has(key)) {
      this.#performanceMetrics.set(key, {
        name,
        type,
        tags,
        values: []
      });
    }

    const metricData = this.#performanceMetrics.get(key);
    metricData.values.push({
      value,
      timestamp: metric.timestamp
    });

    // Limit stored values
    if (metricData.values.length > 1000) {
      metricData.values = metricData.values.slice(-500);
    }

    // Send to external services
    this.#sendToExternalServices(metric);
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...PerformanceLogger.#DEFAULT_CONFIG };

    Object.keys(PerformanceLogger.#DEFAULT_CONFIG).forEach(key => {
      if (typeof PerformanceLogger.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(PerformanceLogger.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...PerformanceLogger.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes performance monitoring
   */
  #initializePerformanceMonitoring() {
    // Set up performance observer
    this.#performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.#handlePerformanceEntry(entry);
      }
    });

    // Observe various entry types
    try {
      this.#performanceObserver.observe({ 
        entryTypes: ['measure', 'mark', 'resource', 'navigation'] 
      });
    } catch (error) {
      logger.warn('Some performance entry types not supported', {
        error: error.message
      });
    }

    // Enable GC tracking if requested
    if (this.#config.enableGC) {
      try {
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            this.recordMetric('gc.duration', entry.duration, {
              kind: entry.kind
            });
          });
        });
        obs.observe({ entryTypes: ['gc'] });
      } catch (error) {
        logger.warn('GC tracking not available', { error: error.message });
      }
    }
  }

  /**
   * @private
   * Initializes external APM services
   */
  #initializeExternalServices() {
    // Initialize New Relic
    if (this.#config.externalServices.newRelic.enabled) {
      try {
        require('newrelic');
        logger.info('New Relic APM initialized');
      } catch (error) {
        logger.error('Failed to initialize New Relic', {
          error: error.message
        });
      }
    }

    // Initialize Datadog APM
    if (this.#config.externalServices.datadog.enabled) {
      try {
        const tracer = require('dd-trace').init({
          service: this.#config.externalServices.datadog.service,
          env: process.env.NODE_ENV
        });
        this.datadogTracer = tracer;
        logger.info('Datadog APM initialized');
      } catch (error) {
        logger.error('Failed to initialize Datadog APM', {
          error: error.message
        });
      }
    }
  }

  /**
   * @private
   * Starts system metrics collection
   */
  #startSystemMetricsCollection() {
    // Collect system metrics periodically
    this.metricsInterval = setInterval(() => {
      this.#collectSystemMetrics();
      this.#analyzePerformance();
      this.#checkPerformanceAlerts();
    }, this.#config.metricsInterval);

    // Initial collection
    this.#collectSystemMetrics();

    // Cleanup on exit
    process.on('beforeExit', () => {
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }
    });
  }

  /**
   * @private
   * Collects system metrics
   */
  #collectSystemMetrics() {
    // CPU metrics
    const cpus = os.cpus();
    const cpuUsage = this.#calculateCPUUsage(cpus);
    this.recordMetric('system.cpu.usage', cpuUsage, { type: 'percentage' });

    // Memory metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    this.recordMetric('process.memory.rss', memoryUsage.rss, { unit: 'bytes' });
    this.recordMetric('process.memory.heapTotal', memoryUsage.heapTotal, { unit: 'bytes' });
    this.recordMetric('process.memory.heapUsed', memoryUsage.heapUsed, { unit: 'bytes' });
    this.recordMetric('process.memory.external', memoryUsage.external, { unit: 'bytes' });
    this.recordMetric('system.memory.total', totalMemory, { unit: 'bytes' });
    this.recordMetric('system.memory.free', freeMemory, { unit: 'bytes' });
    this.recordMetric('system.memory.usage', ((totalMemory - freeMemory) / totalMemory) * 100, { type: 'percentage' });

    // Event loop metrics
    const eventLoopDelay = this.#measureEventLoopDelay();
    if (eventLoopDelay !== null) {
      this.recordMetric('process.eventLoop.delay', eventLoopDelay, { unit: 'ms' });
    }

    // V8 heap statistics
    if (this.#config.enableHeapSnapshot) {
      const heapStats = v8.getHeapStatistics();
      this.recordMetric('v8.heap.totalSize', heapStats.total_heap_size, { unit: 'bytes' });
      this.recordMetric('v8.heap.usedSize', heapStats.used_heap_size, { unit: 'bytes' });
      this.recordMetric('v8.heap.limit', heapStats.heap_size_limit, { unit: 'bytes' });
    }

    // Active handles and requests
    const activeHandles = process._getActiveHandles?.()?.length || 0;
    const activeRequests = process._getActiveRequests?.()?.length || 0;
    this.recordMetric('process.activeHandles', activeHandles);
    this.recordMetric('process.activeRequests', activeRequests);

    // Store for analysis
    this.#systemMetrics = {
      cpu: cpuUsage,
      memory: {
        process: memoryUsage,
        system: { total: totalMemory, free: freeMemory }
      },
      eventLoopDelay,
      timestamp: Date.now()
    };
  }

  /**
   * @private
   * Calculates CPU usage percentage
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

    return usage;
  }

  /**
   * @private
   * Measures event loop delay
   */
  #measureEventLoopDelay() {
    // Simple event loop delay measurement
    const start = process.hrtime.bigint();
    
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
      this.lastEventLoopDelay = delay;
    });

    return this.lastEventLoopDelay || null;
  }

  /**
   * @private
   * Handles performance entry
   */
  #handlePerformanceEntry(entry) {
    logger.debug('Performance entry', {
      name: entry.name,
      entryType: entry.entryType,
      duration: entry.duration
    });

    // Record based on entry type
    switch (entry.entryType) {
      case 'measure':
        this.recordMetric('performance.measure', entry.duration, {
          name: entry.name,
          entryType: entry.entryType
        });
        break;

      case 'resource':
        this.recordMetric('performance.resource', entry.duration, {
          name: entry.name,
          initiatorType: entry.initiatorType
        });
        break;
    }
  }

  /**
   * @private
   * Checks if should sample
   */
  #shouldSample() {
    return Math.random() < this.#config.samplingRate;
  }

  /**
   * @private
   * Completes operation tracking
   */
  #completeOperation(operationId, metadata = {}) {
    const operation = this.#activeOperations.get(operationId);
    if (!operation) return;

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - operation.startTime) / 1e6; // Convert to ms

    // Clean up
    this.#activeOperations.delete(operationId);
    if (operation.startMark) {
      performance.clearMarks(operation.startMark);
    }

    // Record metrics
    const tags = {
      type: operation.type,
      ...(operation.method && { method: operation.method }),
      ...(operation.path && { path: operation.path }),
      ...(metadata.statusCode && { status: Math.floor(metadata.statusCode / 100) + 'xx' }),
      ...(metadata.error && { error: 'true' })
    };

    this.recordMetric(`${operation.type}.duration`, duration, tags, PerformanceLogger.#METRIC_TYPES.HISTOGRAM);
    this.recordMetric(`${operation.type}.count`, 1, tags, PerformanceLogger.#METRIC_TYPES.COUNTER);

    // Check if slow operation
    if (duration > this.#config.slowThreshold) {
      this.#handleSlowOperation(operation, duration, metadata);
    }

    // Log performance data
    logger.debug('Operation completed', {
      operationId,
      type: operation.type,
      name: operation.name,
      duration,
      ...metadata
    });
  }

  /**
   * @private
   * Handles slow operation
   */
  #handleSlowOperation(operation, duration, metadata) {
    const key = `${operation.type}:${operation.name || operation.path || 'unknown'}`;
    this.#slowOperations.add(key);

    logger.warn('Slow operation detected', {
      type: operation.type,
      name: operation.name,
      path: operation.path,
      duration,
      threshold: this.#config.slowThreshold,
      ...metadata
    });

    // Capture additional diagnostics if enabled
    if (this.#config.captureStackTraces) {
      const stack = new Error().stack;
      logger.debug('Slow operation stack trace', { stack });
    }
  }

  /**
   * @private
   * Analyzes performance metrics
   */
  #analyzePerformance() {
    const analysis = {
      timestamp: Date.now(),
      operations: {},
      system: this.#systemMetrics
    };

    // Analyze operation metrics
    for (const [key, metricData] of this.#performanceMetrics.entries()) {
      if (metricData.name.includes('.duration')) {
        const stats = this.#calculateStatistics(metricData.values.map(v => v.value));
        analysis.operations[key] = stats;
      }
    }

    // Store analysis
    this.#cacheService.set('performance:analysis:latest', analysis, 3600).catch(err => {
      logger.error('Failed to cache performance analysis', { error: err.message });
    });

    // Log summary
    logger.info('Performance analysis', {
      activeOperations: this.#activeOperations.size,
      slowOperations: this.#slowOperations.size,
      cpu: this.#systemMetrics.cpu,
      memoryUsage: Math.round(this.#systemMetrics.memory.process.heapUsed / 1024 / 1024) + 'MB'
    });
  }

  /**
   * @private
   * Calculates statistics for values
   */
  #calculateStatistics(values) {
    if (values.length === 0) {
      return { count: 0 };
    }

    const sorted = values.sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      median: sorted[Math.floor(count / 2)],
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    };
  }

  /**
   * @private
   * Checks performance alerts
   */
  async #checkPerformanceAlerts() {
    if (!this.#config.alerts.enabled) return;

    const alerts = [];

    // Check CPU usage
    if (this.#systemMetrics.cpu > this.#config.cpuThreshold) {
      alerts.push({
        type: 'cpu',
        message: `High CPU usage: ${this.#systemMetrics.cpu}%`,
        severity: 'warning'
      });
    }

    // Check memory usage
    const heapUsed = this.#systemMetrics.memory.process.heapUsed / 1024 / 1024; // MB
    if (heapUsed > this.#config.memoryThreshold) {
      alerts.push({
        type: 'memory',
        message: `High memory usage: ${Math.round(heapUsed)}MB`,
        severity: 'warning'
      });
    }

    // Check slow operations
    if (this.#slowOperations.size > this.#config.alerts.slowRequestThreshold) {
      alerts.push({
        type: 'performance',
        message: `Too many slow operations: ${this.#slowOperations.size}`,
        severity: 'error'
      });
    }

    // Send alerts
    if (alerts.length > 0) {
      await this.#sendPerformanceAlerts(alerts);
    }
  }

  /**
   * @private
   * Sends performance alerts
   */
  async #sendPerformanceAlerts(alerts) {
    try {
      await this.#notificationService.sendNotification({
        type: 'performance_alert',
        priority: 'high',
        recipients: ['ops-team@insightserenity.com'],
        subject: 'Performance Alert',
        data: {
          alerts,
          systemMetrics: this.#systemMetrics,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to send performance alerts', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Sends metrics to external services
   */
  #sendToExternalServices(metric) {
    // Send to Prometheus
    if (this.#config.externalServices.prometheus.enabled) {
      // Implementation would push to Prometheus gateway
    }

    // Send to Datadog
    if (this.#config.externalServices.datadog.enabled && this.datadogTracer) {
      // Implementation would use Datadog metrics API
    }
  }

  /**
   * @private
   * Gets metric key
   */
  #getMetricKey(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${name}${tagString ? `:${tagString}` : ''}`;
  }

  /**
   * @private
   * Generates operation ID
   */
  #generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets performance metrics
   * @param {Object} [filter] - Filter options
   * @returns {Object} Performance metrics
   */
  getMetrics(filter = {}) {
    const metrics = {
      operations: {},
      system: this.#systemMetrics,
      summary: {}
    };

    // Filter and aggregate metrics
    for (const [key, metricData] of this.#performanceMetrics.entries()) {
      if (filter.name && !metricData.name.includes(filter.name)) continue;
      if (filter.type && metricData.type !== filter.type) continue;

      const stats = this.#calculateStatistics(
        metricData.values
          .filter(v => !filter.since || v.timestamp > filter.since)
          .map(v => v.value)
      );

      metrics.operations[key] = {
        ...metricData,
        stats,
        values: undefined // Don't include raw values
      };
    }

    // Calculate summary
    metrics.summary = {
      totalMetrics: this.#performanceMetrics.size,
      activeOperations: this.#activeOperations.size,
      slowOperations: this.#slowOperations.size,
      lastUpdate: new Date().toISOString()
    };

    return metrics;
  }

  /**
   * Gets performance report
   * @param {Object} [options] - Report options
   * @returns {Promise<Object>} Performance report
   */
  async getPerformanceReport(options = {}) {
    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: options.startDate || new Date(Date.now() - 3600000).toISOString(),
        end: options.endDate || new Date().toISOString()
      },
      metrics: this.getMetrics({ since: options.startDate }),
      analysis: {},
      recommendations: []
    };

    // Analyze performance patterns
    report.analysis = {
      slowestOperations: this.#getSlowstOperations(),
      errorRate: this.#calculateErrorRate(),
      throughput: this.#calculateThroughput()
    };

    // Generate recommendations
    if (report.analysis.errorRate > this.#config.alerts.errorRateThreshold) {
      report.recommendations.push({
        type: 'error_rate',
        message: 'High error rate detected. Review error logs and recent deployments.',
        severity: 'high'
      });
    }

    if (this.#slowOperations.size > 10) {
      report.recommendations.push({
        type: 'performance',
        message: 'Multiple slow operations detected. Consider performance optimization.',
        severity: 'medium'
      });
    }

    return report;
  }

  /**
   * @private
   * Gets slowest operations
   */
  #getSlowstOperations() {
    const operations = [];

    for (const [key, metricData] of this.#performanceMetrics.entries()) {
      if (metricData.name.includes('.duration')) {
        const stats = this.#calculateStatistics(metricData.values.map(v => v.value));
        if (stats.p95 > this.#config.slowThreshold) {
          operations.push({
            name: metricData.name,
            tags: metricData.tags,
            stats
          });
        }
      }
    }

    return operations.sort((a, b) => b.stats.p95 - a.stats.p95).slice(0, 10);
  }

  /**
   * @private
   * Calculates error rate
   */
  #calculateErrorRate() {
    let totalRequests = 0;
    let errorRequests = 0;

    for (const [key, metricData] of this.#performanceMetrics.entries()) {
      if (metricData.name === 'http.count') {
        totalRequests += metricData.values.length;
        if (metricData.tags.error === 'true') {
          errorRequests += metricData.values.length;
        }
      }
    }

    return totalRequests > 0 ? errorRequests / totalRequests : 0;
  }

  /**
   * @private
   * Calculates throughput
   */
  #calculateThroughput() {
    const windowStart = Date.now() - this.#config.aggregationWindow;
    let requestCount = 0;

    for (const [key, metricData] of this.#performanceMetrics.entries()) {
      if (metricData.name === 'http.count') {
        requestCount += metricData.values.filter(v => v.timestamp > windowStart).length;
      }
    }

    return requestCount / (this.#config.aggregationWindow / 1000); // Requests per second
  }

  /**
   * Clears metrics
   */
  clearMetrics() {
    this.#performanceMetrics.clear();
    this.#slowOperations.clear();
    logger.info('Performance metrics cleared');
  }

  /**
   * Takes heap snapshot
   * @returns {Promise<string>} Snapshot filename
   */
  async takeHeapSnapshot() {
    if (!this.#config.enableHeapSnapshot) {
      throw new Error('Heap snapshots not enabled');
    }

    const filename = `heap-${Date.now()}.heapsnapshot`;
    const stream = v8.writeHeapSnapshot(filename);
    
    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filename));
      stream.on('error', reject);
    });
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates PerformanceLogger instance
 * @param {Object} [options] - Configuration options
 * @returns {PerformanceLogger} PerformanceLogger instance
 */
const getPerformanceLogger = (options) => {
  if (!instance) {
    instance = new PerformanceLogger(options);
  }
  return instance;
};

module.exports = {
  PerformanceLogger,
  getPerformanceLogger,
  // Export convenience methods
  middleware: (options) => getPerformanceLogger().middleware(options),
  trackOperation: (name, type) => getPerformanceLogger().trackOperation(name, type),
  recordMetric: (name, value, tags, type) => getPerformanceLogger().recordMetric(name, value, tags, type),
  getMetrics: (filter) => getPerformanceLogger().getMetrics(filter),
  getPerformanceReport: (options) => getPerformanceLogger().getPerformanceReport(options)
};