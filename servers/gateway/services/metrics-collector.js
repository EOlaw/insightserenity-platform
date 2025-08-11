'use strict';

/**
 * @fileoverview Metrics Collector Service - Comprehensive metrics collection using Prometheus
 * @module servers/gateway/services/metrics-collector
 * @requires prom-client
 * @requires events
 * @requires perf_hooks
 */

const { EventEmitter } = require('events');
const prometheus = require('prom-client');
const { performance } = require('perf_hooks');

/**
 * MetricsCollector class provides comprehensive metrics collection and aggregation
 * for the API Gateway using Prometheus format. It tracks request metrics, system
 * performance, service health, business metrics, and custom metrics with support
 * for various metric types including counters, gauges, histograms, and summaries.
 * 
 * @class MetricsCollector
 * @extends EventEmitter
 */
class MetricsCollector extends EventEmitter {
    /**
     * Creates an instance of MetricsCollector
     * @constructor
     * @param {Object} config - Metrics configuration
     */
    constructor(config) {
        super();
        this.config = config || {};
        this.registry = new prometheus.Registry();
        this.isInitialized = false;
        
        // Metric storage
        this.metrics = new Map();
        this.customMetrics = new Map();
        this.aggregatedMetrics = new Map();
        
        // Metric types registry
        this.metricTypes = {
            counter: prometheus.Counter,
            gauge: prometheus.Gauge,
            histogram: prometheus.Histogram,
            summary: prometheus.Summary
        };
        
        // Default labels for all metrics
        this.defaultLabels = {
            service: 'api-gateway',
            environment: process.env.NODE_ENV || 'development',
            instance: process.env.HOSTNAME || 'localhost',
            version: process.env.APP_VERSION || '1.0.0',
            ...this.config.defaultLabels
        };
        
        // Histogram buckets configuration
        this.histogramBuckets = {
            default: this.config.buckets || [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30, 60],
            response_time: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            request_size: [100, 1000, 10000, 100000, 1000000, 10000000],
            response_size: [100, 1000, 10000, 100000, 1000000, 10000000],
            queue_size: [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
        };
        
        // Summary percentiles configuration
        this.summaryPercentiles = {
            default: [0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999],
            response_time: [0.5, 0.9, 0.95, 0.99, 0.999],
            processing_time: [0.5, 0.75, 0.9, 0.95, 0.99]
        };
        
        // Aggregation settings
        this.aggregation = {
            enabled: this.config.aggregation?.enabled !== false,
            interval: this.config.aggregation?.interval || 60000, // 1 minute
            retention: this.config.aggregation?.retention || 3600000 // 1 hour
        };
        
        // Export settings
        this.export = {
            format: this.config.export?.format || 'prometheus',
            includeTimestamp: this.config.export?.includeTimestamp !== false,
            includeHelp: this.config.export?.includeHelp !== false
        };
        
        // Metric categories
        this.categories = {
            http: 'HTTP Request Metrics',
            system: 'System Performance Metrics',
            business: 'Business Logic Metrics',
            security: 'Security Related Metrics',
            cache: 'Cache Performance Metrics',
            database: 'Database Performance Metrics',
            external: 'External Service Metrics',
            custom: 'Custom Application Metrics'
        };
        
        // Aggregation interval
        this.aggregationInterval = null;
        this.cleanupInterval = null;
    }

    /**
     * Initializes the metrics collector
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('Metrics collector already initialized');
            return;
        }

        try {
            console.log('Initializing Metrics Collector');
            
            // Set default labels
            this.registry.setDefaultLabels(this.defaultLabels);
            
            // Initialize default collectors
            this.initializeDefaultCollectors();
            
            // Initialize core metrics
            this.initializeCoreMetrics();
            
            // Initialize HTTP metrics
            this.initializeHttpMetrics();
            
            // Initialize system metrics
            this.initializeSystemMetrics();
            
            // Initialize business metrics
            this.initializeBusinessMetrics();
            
            // Initialize security metrics
            this.initializeSecurityMetrics();
            
            // Initialize cache metrics
            this.initializeCacheMetrics();
            
            // Initialize database metrics
            this.initializeDatabaseMetrics();
            
            // Initialize external service metrics
            this.initializeExternalServiceMetrics();
            
            // Start aggregation if enabled
            if (this.aggregation.enabled) {
                this.startAggregation();
            }
            
            // Start cleanup interval
            this.startCleanup();
            
            this.isInitialized = true;
            this.emit('metrics:initialized');
            
            console.log('Metrics Collector initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Metrics Collector:', error);
            throw error;
        }
    }

    /**
     * Initializes default Prometheus collectors
     * @private
     */
    initializeDefaultCollectors() {
        // Collect default Node.js metrics
        prometheus.collectDefaultMetrics({
            register: this.registry,
            prefix: 'gateway_',
            gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
            eventLoopMonitoringPrecision: 10
        });
        
        console.log('Default Prometheus collectors initialized');
    }

    /**
     * Initializes core gateway metrics
     * @private
     */
    initializeCoreMetrics() {
        // Gateway uptime
        this.createMetric('gateway_uptime_seconds', 'gauge', {
            help: 'Gateway uptime in seconds',
            category: 'system'
        });
        
        // Gateway start time
        this.createMetric('gateway_start_time_seconds', 'gauge', {
            help: 'Gateway start time in epoch seconds',
            category: 'system'
        });
        
        // Set initial values
        this.metrics.get('gateway_start_time_seconds').set(Date.now() / 1000);
        
        // Update uptime periodically
        setInterval(() => {
            this.metrics.get('gateway_uptime_seconds').set(process.uptime());
        }, 10000);
    }

    /**
     * Initializes HTTP request metrics
     * @private
     */
    initializeHttpMetrics() {
        // Total requests counter
        this.createMetric('http_requests_total', 'counter', {
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'path', 'status', 'service'],
            category: 'http'
        });
        
        // Request duration histogram
        this.createMetric('http_request_duration_seconds', 'histogram', {
            help: 'HTTP request duration in seconds',
            labelNames: ['method', 'path', 'status', 'service'],
            buckets: this.histogramBuckets.response_time,
            category: 'http'
        });
        
        // Request size histogram
        this.createMetric('http_request_size_bytes', 'histogram', {
            help: 'HTTP request size in bytes',
            labelNames: ['method', 'path', 'service'],
            buckets: this.histogramBuckets.request_size,
            category: 'http'
        });
        
        // Response size histogram
        this.createMetric('http_response_size_bytes', 'histogram', {
            help: 'HTTP response size in bytes',
            labelNames: ['method', 'path', 'status', 'service'],
            buckets: this.histogramBuckets.response_size,
            category: 'http'
        });
        
        // Active requests gauge
        this.createMetric('http_requests_active', 'gauge', {
            help: 'Number of active HTTP requests',
            labelNames: ['method', 'service'],
            category: 'http'
        });
        
        // Request rate
        this.createMetric('http_request_rate', 'gauge', {
            help: 'HTTP request rate per second',
            labelNames: ['service'],
            category: 'http'
        });
        
        // Error rate
        this.createMetric('http_error_rate', 'gauge', {
            help: 'HTTP error rate per second',
            labelNames: ['service'],
            category: 'http'
        });
        
        // Response time percentiles
        this.createMetric('http_response_time_percentiles', 'summary', {
            help: 'HTTP response time percentiles',
            labelNames: ['method', 'path', 'service'],
            percentiles: this.summaryPercentiles.response_time,
            maxAgeSeconds: 600,
            ageBuckets: 5,
            category: 'http'
        });
    }

    /**
     * Initializes system performance metrics
     * @private
     */
    initializeSystemMetrics() {
        // CPU usage
        this.createMetric('system_cpu_usage_percent', 'gauge', {
            help: 'System CPU usage percentage',
            labelNames: ['core'],
            category: 'system'
        });
        
        // Memory usage
        this.createMetric('system_memory_usage_bytes', 'gauge', {
            help: 'System memory usage in bytes',
            labelNames: ['type'],
            category: 'system'
        });
        
        // Disk usage
        this.createMetric('system_disk_usage_bytes', 'gauge', {
            help: 'System disk usage in bytes',
            labelNames: ['mount'],
            category: 'system'
        });
        
        // Network I/O
        this.createMetric('system_network_io_bytes', 'counter', {
            help: 'Network I/O in bytes',
            labelNames: ['direction', 'interface'],
            category: 'system'
        });
        
        // Load average
        this.createMetric('system_load_average', 'gauge', {
            help: 'System load average',
            labelNames: ['duration'],
            category: 'system'
        });
        
        // File descriptors
        this.createMetric('system_file_descriptors', 'gauge', {
            help: 'Number of file descriptors',
            labelNames: ['state'],
            category: 'system'
        });
    }

    /**
     * Initializes business logic metrics
     * @private
     */
    initializeBusinessMetrics() {
        // User registrations
        this.createMetric('business_user_registrations_total', 'counter', {
            help: 'Total number of user registrations',
            labelNames: ['type', 'source'],
            category: 'business'
        });
        
        // User logins
        this.createMetric('business_user_logins_total', 'counter', {
            help: 'Total number of user logins',
            labelNames: ['method', 'result'],
            category: 'business'
        });
        
        // Active users
        this.createMetric('business_active_users', 'gauge', {
            help: 'Number of active users',
            labelNames: ['tenant', 'plan'],
            category: 'business'
        });
        
        // Transactions
        this.createMetric('business_transactions_total', 'counter', {
            help: 'Total number of business transactions',
            labelNames: ['type', 'status'],
            category: 'business'
        });
        
        // Revenue
        this.createMetric('business_revenue_total', 'counter', {
            help: 'Total revenue',
            labelNames: ['currency', 'source'],
            category: 'business'
        });
        
        // API usage
        this.createMetric('business_api_usage_total', 'counter', {
            help: 'Total API usage',
            labelNames: ['tenant', 'endpoint', 'plan'],
            category: 'business'
        });
        
        // Feature usage
        this.createMetric('business_feature_usage_total', 'counter', {
            help: 'Feature usage statistics',
            labelNames: ['feature', 'tenant'],
            category: 'business'
        });
    }

    /**
     * Initializes security metrics
     * @private
     */
    initializeSecurityMetrics() {
        // Authentication attempts
        this.createMetric('security_auth_attempts_total', 'counter', {
            help: 'Total authentication attempts',
            labelNames: ['method', 'result'],
            category: 'security'
        });
        
        // Authorization failures
        this.createMetric('security_auth_failures_total', 'counter', {
            help: 'Total authorization failures',
            labelNames: ['reason', 'resource'],
            category: 'security'
        });
        
        // Rate limit violations
        this.createMetric('security_rate_limit_violations_total', 'counter', {
            help: 'Total rate limit violations',
            labelNames: ['ip', 'endpoint'],
            category: 'security'
        });
        
        // Blocked requests
        this.createMetric('security_blocked_requests_total', 'counter', {
            help: 'Total blocked requests',
            labelNames: ['reason', 'source'],
            category: 'security'
        });
        
        // Security events
        this.createMetric('security_events_total', 'counter', {
            help: 'Total security events',
            labelNames: ['type', 'severity'],
            category: 'security'
        });
        
        // Token validations
        this.createMetric('security_token_validations_total', 'counter', {
            help: 'Total token validations',
            labelNames: ['type', 'result'],
            category: 'security'
        });
        
        // Suspicious activity
        this.createMetric('security_suspicious_activity_total', 'counter', {
            help: 'Total suspicious activity detections',
            labelNames: ['type', 'action'],
            category: 'security'
        });
    }

    /**
     * Initializes cache performance metrics
     * @private
     */
    initializeCacheMetrics() {
        // Cache hits
        this.createMetric('cache_hits_total', 'counter', {
            help: 'Total cache hits',
            labelNames: ['cache', 'type'],
            category: 'cache'
        });
        
        // Cache misses
        this.createMetric('cache_misses_total', 'counter', {
            help: 'Total cache misses',
            labelNames: ['cache', 'type'],
            category: 'cache'
        });
        
        // Cache hit ratio
        this.createMetric('cache_hit_ratio', 'gauge', {
            help: 'Cache hit ratio',
            labelNames: ['cache'],
            category: 'cache'
        });
        
        // Cache size
        this.createMetric('cache_size_bytes', 'gauge', {
            help: 'Cache size in bytes',
            labelNames: ['cache', 'type'],
            category: 'cache'
        });
        
        // Cache evictions
        this.createMetric('cache_evictions_total', 'counter', {
            help: 'Total cache evictions',
            labelNames: ['cache', 'reason'],
            category: 'cache'
        });
        
        // Cache operations duration
        this.createMetric('cache_operation_duration_seconds', 'histogram', {
            help: 'Cache operation duration',
            labelNames: ['cache', 'operation'],
            buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
            category: 'cache'
        });
    }

    /**
     * Initializes database performance metrics
     * @private
     */
    initializeDatabaseMetrics() {
        // Database connections
        this.createMetric('database_connections_active', 'gauge', {
            help: 'Active database connections',
            labelNames: ['database', 'pool'],
            category: 'database'
        });
        
        // Database queries
        this.createMetric('database_queries_total', 'counter', {
            help: 'Total database queries',
            labelNames: ['database', 'operation', 'table'],
            category: 'database'
        });
        
        // Query duration
        this.createMetric('database_query_duration_seconds', 'histogram', {
            help: 'Database query duration',
            labelNames: ['database', 'operation'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
            category: 'database'
        });
        
        // Database errors
        this.createMetric('database_errors_total', 'counter', {
            help: 'Total database errors',
            labelNames: ['database', 'error_type'],
            category: 'database'
        });
        
        // Connection pool size
        this.createMetric('database_pool_size', 'gauge', {
            help: 'Database connection pool size',
            labelNames: ['database', 'state'],
            category: 'database'
        });
        
        // Transaction duration
        this.createMetric('database_transaction_duration_seconds', 'histogram', {
            help: 'Database transaction duration',
            labelNames: ['database', 'status'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
            category: 'database'
        });
    }

    /**
     * Initializes external service metrics
     * @private
     */
    initializeExternalServiceMetrics() {
        // External API calls
        this.createMetric('external_api_calls_total', 'counter', {
            help: 'Total external API calls',
            labelNames: ['service', 'endpoint', 'status'],
            category: 'external'
        });
        
        // External API response time
        this.createMetric('external_api_response_time_seconds', 'histogram', {
            help: 'External API response time',
            labelNames: ['service', 'endpoint'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
            category: 'external'
        });
        
        // External API errors
        this.createMetric('external_api_errors_total', 'counter', {
            help: 'Total external API errors',
            labelNames: ['service', 'error_type'],
            category: 'external'
        });
        
        // Circuit breaker state
        this.createMetric('circuit_breaker_state', 'gauge', {
            help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
            labelNames: ['service'],
            category: 'external'
        });
        
        // Service availability
        this.createMetric('external_service_availability', 'gauge', {
            help: 'External service availability (0=down, 1=up)',
            labelNames: ['service'],
            category: 'external'
        });
    }

    /**
     * Creates a new metric
     * @private
     * @param {string} name - Metric name
     * @param {string} type - Metric type (counter, gauge, histogram, summary)
     * @param {Object} options - Metric options
     * @returns {Object} Created metric instance
     */
    createMetric(name, type, options = {}) {
        if (this.metrics.has(name)) {
            console.warn(`Metric ${name} already exists`);
            return this.metrics.get(name);
        }

        const MetricClass = this.metricTypes[type];
        if (!MetricClass) {
            throw new Error(`Unknown metric type: ${type}`);
        }

        const metricOptions = {
            name: `gateway_${name}`,
            help: options.help || `${name} metric`,
            labelNames: options.labelNames || [],
            registers: [this.registry],
            ...options
        };

        // Add buckets for histogram
        if (type === 'histogram' && options.buckets) {
            metricOptions.buckets = options.buckets;
        }

        // Add percentiles for summary
        if (type === 'summary' && options.percentiles) {
            metricOptions.percentiles = options.percentiles;
            metricOptions.maxAgeSeconds = options.maxAgeSeconds || 600;
            metricOptions.ageBuckets = options.ageBuckets || 5;
        }

        const metric = new MetricClass(metricOptions);
        
        this.metrics.set(name, metric);
        
        // Store metadata
        if (options.category) {
            if (!this.metricsByCategory) {
                this.metricsByCategory = new Map();
            }
            if (!this.metricsByCategory.has(options.category)) {
                this.metricsByCategory.set(options.category, new Set());
            }
            this.metricsByCategory.get(options.category).add(name);
        }
        
        console.log(`Metric created: ${name} (${type})`);
        return metric;
    }

    /**
     * Increments a counter metric
     * @param {string} name - Metric name
     * @param {Object} labels - Metric labels
     * @param {number} value - Value to increment by (default: 1)
     */
    incrementCounter(name, labels = {}, value = 1) {
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Metric ${name} not found`);
            return;
        }

        if (metric instanceof prometheus.Counter) {
            metric.inc(labels, value);
            this.emit('metric:incremented', { name, labels, value });
        } else {
            console.error(`Metric ${name} is not a counter`);
        }
    }

    /**
     * Sets a gauge metric value
     * @param {string} name - Metric name
     * @param {number} value - Value to set
     * @param {Object} labels - Metric labels
     */
    setGauge(name, value, labels = {}) {
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Metric ${name} not found`);
            return;
        }

        if (metric instanceof prometheus.Gauge) {
            metric.set(labels, value);
            this.emit('metric:set', { name, labels, value });
        } else {
            console.error(`Metric ${name} is not a gauge`);
        }
    }

    /**
     * Registers a gauge metric
     * @param {string} name - Metric name
     * @param {number} value - Value to set
     * @param {Object} labels - Metric labels
     */
    registerGauge(name, value, labels = {}) {
        this.setGauge(name, value, labels);
    }

    /**
     * Records a histogram observation
     * @param {string} name - Metric name
     * @param {number} value - Value to observe
     * @param {Object} labels - Metric labels
     */
    recordHistogram(name, value, labels = {}) {
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Metric ${name} not found`);
            return;
        }

        if (metric instanceof prometheus.Histogram) {
            metric.observe(labels, value);
            this.emit('metric:observed', { name, labels, value });
            
            // Update aggregated metrics if enabled
            if (this.aggregation.enabled) {
                this.updateAggregatedMetric(name, value, labels);
            }
        } else {
            console.error(`Metric ${name} is not a histogram`);
        }
    }

    /**
     * Records a summary observation
     * @param {string} name - Metric name
     * @param {number} value - Value to observe
     * @param {Object} labels - Metric labels
     */
    recordSummary(name, value, labels = {}) {
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Metric ${name} not found`);
            return;
        }

        if (metric instanceof prometheus.Summary) {
            metric.observe(labels, value);
            this.emit('metric:observed', { name, labels, value });
        } else {
            console.error(`Metric ${name} is not a summary`);
        }
    }

    /**
     * Starts a timer for histogram metric
     * @param {string} name - Metric name
     * @param {Object} labels - Metric labels
     * @returns {Function} End timer function
     */
    startTimer(name, labels = {}) {
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Metric ${name} not found`);
            return () => {};
        }

        if (metric instanceof prometheus.Histogram) {
            return metric.startTimer(labels);
        } else if (metric instanceof prometheus.Summary) {
            const start = performance.now();
            return () => {
                const duration = (performance.now() - start) / 1000;
                metric.observe(labels, duration);
            };
        } else {
            console.error(`Metric ${name} does not support timing`);
            return () => {};
        }
    }

    /**
     * Creates a custom metric
     * @param {string} name - Metric name
     * @param {string} type - Metric type
     * @param {Object} options - Metric options
     * @returns {Object} Created metric
     */
    createCustomMetric(name, type, options = {}) {
        const metricName = `custom_${name}`;
        const metric = this.createMetric(metricName, type, {
            ...options,
            category: 'custom'
        });
        
        this.customMetrics.set(name, metric);
        return metric;
    }

    /**
     * Updates aggregated metrics
     * @private
     * @param {string} name - Metric name
     * @param {number} value - Value to aggregate
     * @param {Object} labels - Metric labels
     */
    updateAggregatedMetric(name, value, labels) {
        const key = `${name}:${JSON.stringify(labels)}`;
        
        if (!this.aggregatedMetrics.has(key)) {
            this.aggregatedMetrics.set(key, {
                name,
                labels,
                values: [],
                timestamp: Date.now()
            });
        }
        
        const aggregated = this.aggregatedMetrics.get(key);
        aggregated.values.push(value);
        
        // Trim old values
        const cutoff = Date.now() - this.aggregation.retention;
        if (aggregated.timestamp < cutoff) {
            aggregated.values = [];
            aggregated.timestamp = Date.now();
        }
    }

    /**
     * Starts metric aggregation
     * @private
     */
    startAggregation() {
        this.aggregationInterval = setInterval(() => {
            this.performAggregation();
        }, this.aggregation.interval);
        
        console.log(`Metric aggregation started with interval: ${this.aggregation.interval}ms`);
    }

    /**
     * Performs metric aggregation
     * @private
     */
    performAggregation() {
        for (const [key, data] of this.aggregatedMetrics) {
            if (data.values.length === 0) continue;
            
            const stats = this.calculateStatistics(data.values);
            
            // Create aggregated metrics
            this.setGauge(`${data.name}_avg`, stats.avg, data.labels);
            this.setGauge(`${data.name}_min`, stats.min, data.labels);
            this.setGauge(`${data.name}_max`, stats.max, data.labels);
            this.setGauge(`${data.name}_p50`, stats.p50, data.labels);
            this.setGauge(`${data.name}_p95`, stats.p95, data.labels);
            this.setGauge(`${data.name}_p99`, stats.p99, data.labels);
            
            // Clear processed values
            data.values = [];
        }
    }

    /**
     * Calculates statistics for a set of values
     * @private
     * @param {Array<number>} values - Values to calculate statistics for
     * @returns {Object} Calculated statistics
     */
    calculateStatistics(values) {
        if (values.length === 0) {
            return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
        }
        
        const sorted = values.sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        
        return {
            avg: sum / sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: this.percentile(sorted, 0.5),
            p95: this.percentile(sorted, 0.95),
            p99: this.percentile(sorted, 0.99)
        };
    }

    /**
     * Calculates percentile value
     * @private
     * @param {Array<number>} sorted - Sorted array of values
     * @param {number} p - Percentile (0-1)
     * @returns {number} Percentile value
     */
    percentile(sorted, p) {
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Starts cleanup interval for old metrics
     * @private
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, 300000); // 5 minutes
        
        console.log('Metric cleanup interval started');
    }

    /**
     * Cleans up old aggregated metrics
     * @private
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.aggregation.retention;
        let cleaned = 0;
        
        for (const [key, data] of this.aggregatedMetrics) {
            if (data.timestamp < cutoff && data.values.length === 0) {
                this.aggregatedMetrics.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old aggregated metrics`);
        }
    }

    /**
     * Records HTTP request metrics
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {number} duration - Request duration in ms
     */
    recordHttpRequest(req, res, duration) {
        const labels = {
            method: req.method,
            path: req.route?.path || req.path,
            status: res.statusCode,
            service: req.headers['x-service-name'] || 'unknown'
        };
        
        // Increment request counter
        this.incrementCounter('http_requests_total', labels);
        
        // Record request duration
        this.recordHistogram('http_request_duration_seconds', duration / 1000, labels);
        
        // Record request size
        const requestSize = parseInt(req.headers['content-length'] || '0');
        if (requestSize > 0) {
            this.recordHistogram('http_request_size_bytes', requestSize, {
                method: labels.method,
                path: labels.path,
                service: labels.service
            });
        }
        
        // Record response size
        const responseSize = parseInt(res.get('content-length') || '0');
        if (responseSize > 0) {
            this.recordHistogram('http_response_size_bytes', responseSize, labels);
        }
        
        // Update error rate if applicable
        if (res.statusCode >= 400) {
            this.incrementCounter('http_errors_total', {
                method: labels.method,
                path: labels.path,
                status_class: `${Math.floor(res.statusCode / 100)}xx`,
                service: labels.service
            });
        }
    }

    /**
     * Records service metrics
     * @param {string} service - Service name
     * @param {Object} metrics - Service metrics
     */
    recordServiceMetrics(service, metrics) {
        if (metrics.responseTime !== undefined) {
            this.recordHistogram('service_response_time_seconds', metrics.responseTime / 1000, {
                service
            });
        }
        
        if (metrics.errorCount !== undefined) {
            this.incrementCounter('service_errors_total', { service }, metrics.errorCount);
        }
        
        if (metrics.requestCount !== undefined) {
            this.incrementCounter('service_requests_total', { service }, metrics.requestCount);
        }
        
        if (metrics.availability !== undefined) {
            this.setGauge('service_availability', metrics.availability, { service });
        }
    }

    /**
     * Records cache metrics
     * @param {string} operation - Cache operation (hit, miss, set, delete)
     * @param {string} cache - Cache name
     * @param {number} duration - Operation duration in ms
     */
    recordCacheMetrics(operation, cache, duration) {
        if (operation === 'hit') {
            this.incrementCounter('cache_hits_total', { cache, type: 'read' });
        } else if (operation === 'miss') {
            this.incrementCounter('cache_misses_total', { cache, type: 'read' });
        }
        
        if (duration !== undefined) {
            this.recordHistogram('cache_operation_duration_seconds', duration / 1000, {
                cache,
                operation
            });
        }
        
        // Update hit ratio
        const hits = this.metrics.get('cache_hits_total')?.get({ cache }) || 0;
        const misses = this.metrics.get('cache_misses_total')?.get({ cache }) || 0;
        const total = hits + misses;
        
        if (total > 0) {
            this.setGauge('cache_hit_ratio', hits / total, { cache });
        }
    }

    /**
     * Records database metrics
     * @param {Object} metrics - Database metrics
     */
    recordDatabaseMetrics(metrics) {
        const { database, operation, duration, error } = metrics;
        
        if (operation) {
            this.incrementCounter('database_queries_total', {
                database,
                operation,
                table: metrics.table || 'unknown'
            });
        }
        
        if (duration !== undefined) {
            this.recordHistogram('database_query_duration_seconds', duration / 1000, {
                database,
                operation
            });
        }
        
        if (error) {
            this.incrementCounter('database_errors_total', {
                database,
                error_type: error.type || 'unknown'
            });
        }
        
        if (metrics.connections !== undefined) {
            this.setGauge('database_connections_active', metrics.connections, {
                database,
                pool: metrics.pool || 'default'
            });
        }
    }

    /**
     * Records security metrics
     * @param {string} event - Security event type
     * @param {Object} details - Event details
     */
    recordSecurityMetrics(event, details = {}) {
        switch (event) {
            case 'auth_attempt':
                this.incrementCounter('security_auth_attempts_total', {
                    method: details.method || 'unknown',
                    result: details.success ? 'success' : 'failure'
                });
                break;
            
            case 'auth_failure':
                this.incrementCounter('security_auth_failures_total', {
                    reason: details.reason || 'unknown',
                    resource: details.resource || 'unknown'
                });
                break;
            
            case 'rate_limit':
                this.incrementCounter('security_rate_limit_violations_total', {
                    ip: details.ip || 'unknown',
                    endpoint: details.endpoint || 'unknown'
                });
                break;
            
            case 'blocked':
                this.incrementCounter('security_blocked_requests_total', {
                    reason: details.reason || 'unknown',
                    source: details.source || 'unknown'
                });
                break;
            
            default:
                this.incrementCounter('security_events_total', {
                    type: event,
                    severity: details.severity || 'info'
                });
        }
    }

    /**
     * Gets metrics for export
     * @param {string} format - Export format (prometheus, json)
     * @returns {string|Object} Formatted metrics
     */
    async getMetrics(format = 'prometheus') {
        if (format === 'prometheus') {
            return this.registry.metrics();
        } else if (format === 'json') {
            return this.registry.getMetricsAsJSON();
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Gets metrics by category
     * @param {string} category - Metric category
     * @returns {Array} Metrics in category
     */
    getMetricsByCategory(category) {
        if (!this.metricsByCategory || !this.metricsByCategory.has(category)) {
            return [];
        }
        
        const metricNames = this.metricsByCategory.get(category);
        const metrics = [];
        
        for (const name of metricNames) {
            const metric = this.metrics.get(name);
            if (metric) {
                metrics.push({
                    name,
                    type: this.getMetricType(metric),
                    values: metric.get()
                });
            }
        }
        
        return metrics;
    }

    /**
     * Gets metric type
     * @private
     * @param {Object} metric - Metric instance
     * @returns {string} Metric type
     */
    getMetricType(metric) {
        if (metric instanceof prometheus.Counter) return 'counter';
        if (metric instanceof prometheus.Gauge) return 'gauge';
        if (metric instanceof prometheus.Histogram) return 'histogram';
        if (metric instanceof prometheus.Summary) return 'summary';
        return 'unknown';
    }

    /**
     * Resets all metrics
     */
    reset() {
        this.registry.resetMetrics();
        this.aggregatedMetrics.clear();
        console.log('All metrics reset');
    }

    /**
     * Flushes pending metrics
     * @async
     * @returns {Promise<void>}
     */
    async flush() {
        if (this.aggregation.enabled) {
            this.performAggregation();
        }
        
        this.emit('metrics:flushed');
        console.log('Metrics flushed');
    }

    /**
     * Shuts down the metrics collector
     * @async
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('Shutting down Metrics Collector');
        
        // Stop aggregation
        if (this.aggregationInterval) {
            clearInterval(this.aggregationInterval);
            this.aggregationInterval = null;
        }
        
        // Stop cleanup
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Flush pending metrics
        await this.flush();
        
        // Clear registries
        this.metrics.clear();
        this.customMetrics.clear();
        this.aggregatedMetrics.clear();
        
        this.isInitialized = false;
        this.emit('metrics:shutdown');
        
        console.log('Metrics Collector shut down');
    }
}

module.exports = { MetricsCollector };