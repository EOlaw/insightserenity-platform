/**
 * Metrics Collector
 * Collects and exposes Prometheus metrics
 */

const promClient = require('prom-client');

/**
 * Metrics Collector Class
 */
class MetricsCollector {
    constructor(config) {
        this.config = config;
        this.register = new promClient.Registry();
        this.metrics = {};
        this.customMetrics = new Map();
    }

    /**
     * Initialize metrics collector
     */
    async initialize() {
        if (!this.config.enabled) {
            console.info('Metrics collection is disabled');
            return;
        }

        console.info('Initializing Metrics Collector');
        
        // Set default labels
        this.register.setDefaultLabels(this.config.defaultLabels || {});
        
        // Register default metrics
        this.registerDefaultMetrics();
        
        // Register gateway-specific metrics
        this.registerGatewayMetrics();
        
        console.info('Metrics Collector initialized');
    }

    /**
     * Register default metrics
     */
    registerDefaultMetrics() {
        // Collect default metrics (CPU, memory, etc.)
        promClient.collectDefaultMetrics({
            register: this.register,
            prefix: 'gateway_',
            gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
            eventLoopMonitoringPrecision: 10
        });
    }

    /**
     * Register gateway-specific metrics
     */
    registerGatewayMetrics() {
        // HTTP request duration histogram
        this.metrics.httpRequestDuration = new promClient.Histogram({
            name: 'gateway_http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status_code', 'service'],
            buckets: this.config.buckets || [0.003, 0.03, 0.1, 0.3, 1.5, 10]
        });
        this.register.registerMetric(this.metrics.httpRequestDuration);

        // HTTP request total counter
        this.metrics.httpRequestTotal = new promClient.Counter({
            name: 'gateway_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code', 'service']
        });
        this.register.registerMetric(this.metrics.httpRequestTotal);

        // Active connections gauge
        this.metrics.activeConnections = new promClient.Gauge({
            name: 'gateway_active_connections',
            help: 'Number of active connections',
            labelNames: ['service']
        });
        this.register.registerMetric(this.metrics.activeConnections);

        // Request size histogram
        this.metrics.requestSize = new promClient.Histogram({
            name: 'gateway_http_request_size_bytes',
            help: 'Size of HTTP requests in bytes',
            labelNames: ['method', 'route', 'service'],
            buckets: [100, 1000, 10000, 100000, 1000000, 10000000]
        });
        this.register.registerMetric(this.metrics.requestSize);

        // Response size histogram
        this.metrics.responseSize = new promClient.Histogram({
            name: 'gateway_http_response_size_bytes',
            help: 'Size of HTTP responses in bytes',
            labelNames: ['method', 'route', 'service'],
            buckets: [100, 1000, 10000, 100000, 1000000, 10000000]
        });
        this.register.registerMetric(this.metrics.responseSize);

        // Rate limit metrics
        this.metrics.rateLimitHits = new promClient.Counter({
            name: 'gateway_rate_limit_hits_total',
            help: 'Total number of rate limit hits',
            labelNames: ['endpoint', 'limit_type']
        });
        this.register.registerMetric(this.metrics.rateLimitHits);

        // Cache metrics
        this.metrics.cacheHits = new promClient.Counter({
            name: 'gateway_cache_hits_total',
            help: 'Total number of cache hits',
            labelNames: ['cache_type', 'endpoint']
        });
        this.register.registerMetric(this.metrics.cacheHits);

        this.metrics.cacheMisses = new promClient.Counter({
            name: 'gateway_cache_misses_total',
            help: 'Total number of cache misses',
            labelNames: ['cache_type', 'endpoint']
        });
        this.register.registerMetric(this.metrics.cacheMisses);

        // Circuit breaker metrics
        this.metrics.circuitBreakerState = new promClient.Gauge({
            name: 'gateway_circuit_breaker_state',
            help: 'Current state of circuit breaker (0=closed, 1=open, 0.5=half-open)',
            labelNames: ['service', 'breaker_name']
        });
        this.register.registerMetric(this.metrics.circuitBreakerState);

        // Authentication metrics
        this.metrics.authSuccess = new promClient.Counter({
            name: 'gateway_auth_success_total',
            help: 'Total number of successful authentications',
            labelNames: ['method', 'provider']
        });
        this.register.registerMetric(this.metrics.authSuccess);

        this.metrics.authFailure = new promClient.Counter({
            name: 'gateway_auth_failure_total',
            help: 'Total number of failed authentications',
            labelNames: ['method', 'provider', 'reason']
        });
        this.register.registerMetric(this.metrics.authFailure);

        // Service health metrics
        this.metrics.serviceHealth = new promClient.Gauge({
            name: 'gateway_service_health',
            help: 'Health status of backend services (1=healthy, 0=unhealthy)',
            labelNames: ['service', 'instance']
        });
        this.register.registerMetric(this.metrics.serviceHealth);

        // Proxy metrics
        this.metrics.proxyLatency = new promClient.Histogram({
            name: 'gateway_proxy_latency_seconds',
            help: 'Latency of proxy requests in seconds',
            labelNames: ['service', 'method', 'status'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
        });
        this.register.registerMetric(this.metrics.proxyLatency);

        // WebSocket metrics
        this.metrics.websocketConnections = new promClient.Gauge({
            name: 'gateway_websocket_connections',
            help: 'Number of active WebSocket connections',
            labelNames: ['service']
        });
        this.register.registerMetric(this.metrics.websocketConnections);

        // Error metrics
        this.metrics.errors = new promClient.Counter({
            name: 'gateway_errors_total',
            help: 'Total number of errors',
            labelNames: ['type', 'service', 'code']
        });
        this.register.registerMetric(this.metrics.errors);
    }

    /**
     * Increment counter metric
     */
    incrementCounter(name, labels = {}) {
        if (this.metrics[name]) {
            this.metrics[name].inc(labels);
        } else {
            const customMetric = this.customMetrics.get(name);
            if (customMetric && customMetric.type === 'Counter') {
                customMetric.metric.inc(labels);
            }
        }
    }

    /**
     * Observe histogram metric
     */
    observeHistogram(name, value, labels = {}) {
        if (this.metrics[name]) {
            this.metrics[name].observe(labels, value);
        } else {
            const customMetric = this.customMetrics.get(name);
            if (customMetric && customMetric.type === 'Histogram') {
                customMetric.metric.observe(labels, value);
            }
        }
    }

    /**
     * Set gauge metric
     */
    setGauge(name, value, labels = {}) {
        if (this.metrics[name]) {
            this.metrics[name].set(labels, value);
        } else {
            const customMetric = this.customMetrics.get(name);
            if (customMetric && customMetric.type === 'Gauge') {
                customMetric.metric.set(labels, value);
            }
        }
    }

    /**
     * Register gauge metric
     */
    registerGauge(name, value, labels = {}) {
        if (!this.customMetrics.has(name)) {
            const gauge = new promClient.Gauge({
                name: name,
                help: `Custom gauge metric: ${name}`,
                labelNames: Object.keys(labels)
            });
            this.register.registerMetric(gauge);
            this.customMetrics.set(name, { type: 'Gauge', metric: gauge });
        }
        this.setGauge(name, value, labels);
    }

    /**
     * Register counter metric
     */
    registerCounter(name, labels = {}) {
        if (!this.customMetrics.has(name)) {
            const counter = new promClient.Counter({
                name: name,
                help: `Custom counter metric: ${name}`,
                labelNames: Object.keys(labels)
            });
            this.register.registerMetric(counter);
            this.customMetrics.set(name, { type: 'Counter', metric: counter });
        }
        return this.customMetrics.get(name).metric;
    }

    /**
     * Register histogram metric
     */
    registerHistogram(name, buckets = [], labels = {}) {
        if (!this.customMetrics.has(name)) {
            const histogram = new promClient.Histogram({
                name: name,
                help: `Custom histogram metric: ${name}`,
                labelNames: Object.keys(labels),
                buckets: buckets.length > 0 ? buckets : this.config.buckets
            });
            this.register.registerMetric(histogram);
            this.customMetrics.set(name, { type: 'Histogram', metric: histogram });
        }
        return this.customMetrics.get(name).metric;
    }

    /**
     * Register summary metric
     */
    registerSummary(name, percentiles = [0.5, 0.9, 0.99], labels = {}) {
        if (!this.customMetrics.has(name)) {
            const summary = new promClient.Summary({
                name: name,
                help: `Custom summary metric: ${name}`,
                labelNames: Object.keys(labels),
                percentiles: percentiles
            });
            this.register.registerMetric(summary);
            this.customMetrics.set(name, { type: 'Summary', metric: summary });
        }
        return this.customMetrics.get(name).metric;
    }

    /**
     * Record HTTP request
     */
    recordHttpRequest(method, route, statusCode, duration, service = 'unknown') {
        const labels = {
            method: method,
            route: route || 'unknown',
            status_code: statusCode,
            service: service
        };
        
        this.metrics.httpRequestTotal.inc(labels);
        this.metrics.httpRequestDuration.observe(labels, duration / 1000);
    }

    /**
     * Record request size
     */
    recordRequestSize(method, route, size, service = 'unknown') {
        this.metrics.requestSize.observe({
            method: method,
            route: route || 'unknown',
            service: service
        }, size);
    }

    /**
     * Record response size
     */
    recordResponseSize(method, route, size, service = 'unknown') {
        this.metrics.responseSize.observe({
            method: method,
            route: route || 'unknown',
            service: service
        }, size);
    }

    /**
     * Update active connections
     */
    updateActiveConnections(service, count) {
        this.metrics.activeConnections.set({ service: service }, count);
    }

    /**
     * Record authentication attempt
     */
    recordAuth(success, method = 'jwt', provider = 'local', reason = null) {
        if (success) {
            this.metrics.authSuccess.inc({ method, provider });
        } else {
            this.metrics.authFailure.inc({ method, provider, reason: reason || 'unknown' });
        }
    }

    /**
     * Record cache operation
     */
    recordCache(hit, cacheType = 'redis', endpoint = 'unknown') {
        if (hit) {
            this.metrics.cacheHits.inc({ cache_type: cacheType, endpoint });
        } else {
            this.metrics.cacheMisses.inc({ cache_type: cacheType, endpoint });
        }
    }

    /**
     * Update service health
     */
    updateServiceHealth(service, instance, healthy) {
        this.metrics.serviceHealth.set(
            { service, instance },
            healthy ? 1 : 0
        );
    }

    /**
     * Record error
     */
    recordError(type, service = 'unknown', code = 'unknown') {
        this.metrics.errors.inc({ type, service, code });
    }

    /**
     * Get metrics in Prometheus format
     */
    async getMetrics() {
        return await this.register.metrics();
    }

    /**
     * Get metrics as JSON
     */
    async getMetricsJSON() {
        return await this.register.getMetricsAsJSON();
    }

    /**
     * Get single metric
     */
    getSingleMetric(name) {
        return this.register.getSingleMetric(name);
    }

    /**
     * Get single metric as string
     */
    async getSingleMetricAsString(name) {
        return await this.register.getSingleMetricAsString(name);
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.register.resetMetrics();
    }

    /**
     * Clear specific metric
     */
    clear(name) {
        const metric = this.metrics[name] || this.customMetrics.get(name)?.metric;
        if (metric && metric.reset) {
            metric.reset();
        }
    }

    /**
     * Flush metrics (for graceful shutdown)
     */
    async flush() {
        // Metrics are pulled, so just ensure all pending observations are recorded
        // This is mainly for custom implementations that might buffer metrics
        return Promise.resolve();
    }

    /**
     * Get content type for metrics
     */
    getContentType() {
        return this.register.contentType;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Clear all metrics
        this.register.clear();
        this.customMetrics.clear();
        this.metrics = {};
    }
}

module.exports = { MetricsCollector };