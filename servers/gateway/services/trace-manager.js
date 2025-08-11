'use strict';

/**
 * @fileoverview Trace Manager Service - OpenTelemetry distributed tracing implementation
 * @module servers/gateway/services/trace-manager
 * @requires @opentelemetry/api
 * @requires @opentelemetry/sdk-node
 * @requires @opentelemetry/auto-instrumentations-node
 * @requires @opentelemetry/exporter-jaeger
 * @requires @opentelemetry/instrumentation-express
 * @requires @opentelemetry/instrumentation-http
 * @requires events
 */

const { EventEmitter } = require('events');
const opentelemetry = require('@opentelemetry/api');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } = require('@opentelemetry/core');
const { diag, DiagConsoleLogger, DiagLogLevel, trace, context, propagation, SpanStatusCode, SpanKind } = opentelemetry;

/**
 * TraceManager class provides comprehensive distributed tracing capabilities using OpenTelemetry.
 * It implements trace collection, context propagation, span management, and integration with
 * various observability backends including Jaeger, Zipkin, and cloud providers. The manager
 * supports automatic instrumentation of HTTP requests, database queries, and custom spans
 * for detailed performance monitoring across microservices.
 * 
 * @class TraceManager
 * @extends EventEmitter
 */
class TraceManager extends EventEmitter {
    /**
     * Creates an instance of TraceManager
     * @constructor
     * @param {Object} config - Tracing configuration
     */
    constructor(config) {
        super();
        this.config = config || {};
        this.sdk = null;
        this.tracer = null;
        this.isInitialized = false;
        
        // Tracing components
        this.exporters = new Map();
        this.spanProcessors = new Map();
        this.instrumentations = new Map();
        this.propagators = null;
        
        // Active spans tracking
        this.activeSpans = new Map();
        this.spanMetadata = new Map();
        
        // Sampling configuration
        this.sampling = {
            rate: config.samplingRate || 1.0,
            rules: config.samplingRules || [],
            dynamic: config.dynamicSampling || false
        };
        
        // Baggage items for context propagation
        this.baggageItems = new Map();
        
        // Trace context storage
        this.traceContexts = new Map();
        this.maxContextAge = config.maxContextAge || 3600000; // 1 hour
        
        // Performance monitoring
        this.performanceMetrics = {
            tracesCreated: 0,
            spansCreated: 0,
            spansExported: 0,
            spansFailed: 0,
            averageSpanDuration: 0
        };
        
        // Error tracking
        this.errorSpans = [];
        this.maxErrorSpans = 100;
        
        // Custom span processors
        this.customProcessors = new Map();
        
        // Trace enrichment functions
        this.enrichmentFunctions = new Map();
        
        // Service map for dependency tracking
        this.serviceMap = new Map();
        
        // Configuration for different environments
        this.environmentConfig = {
            development: {
                logLevel: DiagLogLevel.DEBUG,
                consoleExporter: true,
                batchingDelay: 1000
            },
            staging: {
                logLevel: DiagLogLevel.INFO,
                consoleExporter: false,
                batchingDelay: 5000
            },
            production: {
                logLevel: DiagLogLevel.WARN,
                consoleExporter: false,
                batchingDelay: 10000
            }
        };
    }

    /**
     * Initializes the trace manager
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('Trace Manager already initialized');
            return;
        }

        try {
            console.log('Initializing Trace Manager');
            
            // Setup diagnostic logging
            this.setupDiagnostics();
            
            // Create resource with service information
            const resource = this.createResource();
            
            // Setup exporters
            await this.setupExporters();
            
            // Setup span processors
            this.setupSpanProcessors();
            
            // Setup propagators
            this.setupPropagators();
            
            // Setup instrumentations
            this.setupInstrumentations();
            
            // Initialize OpenTelemetry SDK
            await this.initializeSDK(resource);
            
            // Get tracer instance
            this.tracer = trace.getTracer(
                this.config.serviceName || 'api-gateway',
                this.config.serviceVersion || '1.0.0'
            );
            
            // Setup context cleanup
            this.startContextCleanup();
            
            // Register custom span processors
            this.registerDefaultProcessors();
            
            // Setup service dependency tracking
            this.setupServiceTracking();
            
            this.isInitialized = true;
            this.emit('trace-manager:initialized');
            
            console.log('Trace Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Trace Manager:', error);
            throw error;
        }
    }

    /**
     * Sets up diagnostic logging for OpenTelemetry
     * @private
     */
    setupDiagnostics() {
        const environment = process.env.NODE_ENV || 'development';
        const envConfig = this.environmentConfig[environment] || this.environmentConfig.development;
        
        diag.setLogger(new DiagConsoleLogger(), envConfig.logLevel);
        console.log(`OpenTelemetry diagnostics set to level: ${envConfig.logLevel}`);
    }

    /**
     * Creates resource with service information
     * @private
     * @returns {Resource} OpenTelemetry resource
     */
    createResource() {
        return new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName || 'api-gateway',
            [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion || '1.0.0',
            [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: this.config.serviceInstanceId || process.pid.toString(),
            [SemanticResourceAttributes.SERVICE_NAMESPACE]: this.config.serviceNamespace || 'insightserenity',
            [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
            [SemanticResourceAttributes.HOST_NAME]: require('os').hostname(),
            [SemanticResourceAttributes.PROCESS_PID]: process.pid,
            [SemanticResourceAttributes.PROCESS_EXECUTABLE_NAME]: process.title,
            [SemanticResourceAttributes.PROCESS_RUNTIME_NAME]: 'nodejs',
            [SemanticResourceAttributes.PROCESS_RUNTIME_VERSION]: process.version,
            [SemanticResourceAttributes.CONTAINER_ID]: process.env.CONTAINER_ID,
            [SemanticResourceAttributes.K8S_NAMESPACE_NAME]: process.env.K8S_NAMESPACE,
            [SemanticResourceAttributes.K8S_POD_NAME]: process.env.K8S_POD_NAME,
            [SemanticResourceAttributes.K8S_NODE_NAME]: process.env.K8S_NODE_NAME,
            'gateway.version': '1.0.0',
            'gateway.type': 'api',
            'organization': 'insightserenity'
        });
    }

    /**
     * Sets up trace exporters
     * @private
     * @async
     */
    async setupExporters() {
        const environment = process.env.NODE_ENV || 'development';
        const envConfig = this.environmentConfig[environment];
        
        // Jaeger exporter
        if (this.config.endpoint) {
            const jaegerExporter = new JaegerExporter({
                endpoint: this.config.endpoint,
                username: this.config.username,
                password: this.config.password,
                maxPacketSize: 65000
            });
            this.exporters.set('jaeger', jaegerExporter);
            console.log('Jaeger exporter configured');
        }
        
        // Console exporter for development
        if (envConfig.consoleExporter) {
            const consoleExporter = new ConsoleSpanExporter();
            this.exporters.set('console', consoleExporter);
            console.log('Console exporter configured');
        }
        
        // Prometheus metrics exporter
        if (this.config.metrics?.enabled) {
            const prometheusExporter = new PrometheusExporter({
                port: this.config.metrics.port || 9090,
                endpoint: this.config.metrics.endpoint || '/metrics'
            }, () => {
                console.log('Prometheus metrics exporter started');
            });
            this.exporters.set('prometheus', prometheusExporter);
        }
        
        // Custom exporters
        if (this.config.customExporters) {
            for (const [name, exporter] of Object.entries(this.config.customExporters)) {
                this.exporters.set(name, exporter);
                console.log(`Custom exporter configured: ${name}`);
            }
        }
    }

    /**
     * Sets up span processors
     * @private
     */
    setupSpanProcessors() {
        const environment = process.env.NODE_ENV || 'development';
        const envConfig = this.environmentConfig[environment];
        
        // Batch span processor for Jaeger
        const jaegerExporter = this.exporters.get('jaeger');
        if (jaegerExporter) {
            const batchProcessor = new BatchSpanProcessor(jaegerExporter, {
                maxQueueSize: 2048,
                maxExportBatchSize: 512,
                scheduledDelayMillis: envConfig.batchingDelay,
                exportTimeoutMillis: 30000
            });
            this.spanProcessors.set('batch', batchProcessor);
        }
        
        // Simple span processor for console (development)
        const consoleExporter = this.exporters.get('console');
        if (consoleExporter) {
            const simpleProcessor = new SimpleSpanProcessor(consoleExporter);
            this.spanProcessors.set('console', simpleProcessor);
        }
        
        // Custom span processor for filtering and enrichment
        const customProcessor = {
            forceFlush: () => Promise.resolve(),
            onStart: (span, parentContext) => {
                this.onSpanStart(span, parentContext);
            },
            onEnd: (span) => {
                this.onSpanEnd(span);
            },
            shutdown: () => Promise.resolve()
        };
        this.spanProcessors.set('custom', customProcessor);
    }

    /**
     * Sets up context propagators
     * @private
     */
    setupPropagators() {
        const propagators = [];
        
        // W3C Trace Context propagator
        if (this.config.propagators?.includes('w3c') !== false) {
            propagators.push(new W3CTraceContextPropagator());
        }
        
        // W3C Baggage propagator
        if (this.config.propagators?.includes('baggage') !== false) {
            propagators.push(new W3CBaggagePropagator());
        }
        
        // Composite propagator
        this.propagators = new CompositePropagator({
            propagators
        });
        
        propagation.setGlobalPropagator(this.propagators);
        console.log('Context propagators configured');
    }

    /**
     * Sets up instrumentations
     * @private
     */
    setupInstrumentations() {
        // HTTP instrumentation
        const httpInstrumentation = new HttpInstrumentation({
            requestHook: (span, request) => {
                this.enrichHttpRequestSpan(span, request);
            },
            responseHook: (span, response) => {
                this.enrichHttpResponseSpan(span, response);
            },
            ignoreIncomingPaths: this.config.ignoreIncomingPaths || [
                /\/health/,
                /\/metrics/,
                /\/favicon.ico/
            ],
            ignoreOutgoingUrls: this.config.ignoreOutgoingUrls || []
        });
        this.instrumentations.set('http', httpInstrumentation);
        
        // Express instrumentation
        const expressInstrumentation = new ExpressInstrumentation({
            requestHook: (span, info) => {
                span.setAttribute('express.type', info.layerType);
                span.setAttribute('express.name', info.route);
            }
        });
        this.instrumentations.set('express', expressInstrumentation);
        
        // Auto instrumentations
        if (this.config.autoInstrument !== false) {
            const autoInstrumentations = getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': {
                    enabled: false // Disable fs instrumentation to reduce noise
                },
                '@opentelemetry/instrumentation-dns': {
                    enabled: false // Disable DNS instrumentation
                }
            });
            this.instrumentations.set('auto', autoInstrumentations);
        }
    }

    /**
     * Initializes OpenTelemetry SDK
     * @private
     * @param {Resource} resource - OpenTelemetry resource
     * @async
     */
    async initializeSDK(resource) {
        const spanProcessors = Array.from(this.spanProcessors.values());
        const instrumentations = Array.from(this.instrumentations.values()).flat();
        
        this.sdk = new NodeSDK({
            resource,
            spanProcessor: spanProcessors.length === 1 ? spanProcessors[0] : undefined,
            spanProcessors: spanProcessors.length > 1 ? spanProcessors : undefined,
            instrumentations,
            traceExporter: this.exporters.get('jaeger')
        });
        
        await this.sdk.start();
        console.log('OpenTelemetry SDK started');
    }

    /**
     * Starts a new span
     * @param {string} name - Span name
     * @param {Object} options - Span options
     * @returns {Object} Started span
     */
    startSpan(name, options = {}) {
        const spanOptions = {
            kind: options.kind || SpanKind.INTERNAL,
            attributes: {
                'span.type': options.type || 'custom',
                'service.name': this.config.serviceName,
                ...options.attributes
            }
        };
        
        // Apply sampling decision
        if (!this.shouldSample(name, options)) {
            spanOptions.sampling = { decision: 0 };
        }
        
        const span = this.tracer.startSpan(name, spanOptions);
        
        // Track active span
        const spanId = span.spanContext().spanId;
        this.activeSpans.set(spanId, {
            span,
            startTime: Date.now(),
            name,
            metadata: options.metadata || {}
        });
        
        // Apply enrichment
        this.enrichSpan(span, options);
        
        // Update metrics
        this.performanceMetrics.spansCreated++;
        
        this.emit('span:started', { name, spanId });
        
        return span;
    }

    /**
     * Starts an active span with context
     * @param {string} name - Span name
     * @param {Function} fn - Function to execute within span context
     * @param {Object} options - Span options
     * @returns {*} Function result
     */
    async startActiveSpan(name, fn, options = {}) {
        return this.tracer.startActiveSpan(name, async (span) => {
            try {
                // Set span attributes
                if (options.attributes) {
                    Object.entries(options.attributes).forEach(([key, value]) => {
                        span.setAttribute(key, value);
                    });
                }
                
                // Execute function
                const result = await fn(span);
                
                // Set success status
                span.setStatus({ code: SpanStatusCode.OK });
                
                return result;
            } catch (error) {
                // Record error
                span.recordException(error);
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error.message
                });
                throw error;
            } finally {
                span.end();
            }
        });
    }

    /**
     * Gets the current active span
     * @returns {Object|null} Active span or null
     */
    getActiveSpan() {
        return trace.getActiveSpan();
    }

    /**
     * Sets attributes on the active span
     * @param {Object} attributes - Attributes to set
     */
    setSpanAttributes(attributes) {
        const span = this.getActiveSpan();
        if (span) {
            Object.entries(attributes).forEach(([key, value]) => {
                span.setAttribute(key, value);
            });
        }
    }

    /**
     * Adds an event to the active span
     * @param {string} name - Event name
     * @param {Object} attributes - Event attributes
     */
    addSpanEvent(name, attributes = {}) {
        const span = this.getActiveSpan();
        if (span) {
            span.addEvent(name, attributes);
        }
    }

    /**
     * Records an exception in the active span
     * @param {Error} error - Exception to record
     */
    recordException(error) {
        const span = this.getActiveSpan();
        if (span) {
            span.recordException(error);
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
        }
    }

    /**
     * Creates a trace context for propagation
     * @param {Object} span - Span to create context from
     * @returns {Object} Trace context
     */
    getTraceContext(span) {
        const spanContext = span.spanContext();
        return {
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            traceFlags: spanContext.traceFlags,
            traceState: spanContext.traceState?.serialize()
        };
    }

    /**
     * Injects trace context into headers
     * @param {Object} headers - Headers object to inject into
     * @param {Object} span - Span to inject context from
     */
    injectContext(headers, span) {
        const context = trace.setSpan(opentelemetry.context.active(), span);
        propagation.inject(context, headers);
    }

    /**
     * Extracts trace context from headers
     * @param {Object} headers - Headers to extract from
     * @returns {Object} Extracted context
     */
    extractContext(headers) {
        return propagation.extract(opentelemetry.context.active(), headers);
    }

    /**
     * Links spans together
     * @param {Object} span - Span to add link to
     * @param {Object} linkedSpan - Span to link
     * @param {Object} attributes - Link attributes
     */
    linkSpans(span, linkedSpan, attributes = {}) {
        const linkedContext = linkedSpan.spanContext();
        span.addLink({
            context: linkedContext,
            attributes
        });
    }

    /**
     * Sets baggage items for context propagation
     * @param {string} key - Baggage key
     * @param {string} value - Baggage value
     */
    setBaggage(key, value) {
        this.baggageItems.set(key, value);
        const baggage = propagation.getBaggage(context.active());
        if (baggage) {
            baggage.setEntry(key, { value });
        }
    }

    /**
     * Gets baggage items from context
     * @param {string} key - Baggage key
     * @returns {string|null} Baggage value
     */
    getBaggage(key) {
        const baggage = propagation.getBaggage(context.active());
        if (baggage) {
            const entry = baggage.getEntry(key);
            return entry ? entry.value : null;
        }
        return this.baggageItems.get(key) || null;
    }

    /**
     * Determines if a span should be sampled
     * @private
     * @param {string} name - Span name
     * @param {Object} options - Span options
     * @returns {boolean} Sampling decision
     */
    shouldSample(name, options) {
        // Check sampling rules
        for (const rule of this.sampling.rules) {
            if (rule.pattern && rule.pattern.test(name)) {
                return Math.random() < (rule.rate || 0);
            }
        }
        
        // Apply default sampling rate
        return Math.random() < this.sampling.rate;
    }

    /**
     * Enriches a span with additional information
     * @private
     * @param {Object} span - Span to enrich
     * @param {Object} options - Enrichment options
     */
    enrichSpan(span, options) {
        // Add environment attributes
        span.setAttribute('environment', process.env.NODE_ENV || 'development');
        span.setAttribute('node.version', process.version);
        
        // Add custom enrichments
        for (const [name, fn] of this.enrichmentFunctions) {
            try {
                const attributes = fn(span, options);
                if (attributes) {
                    Object.entries(attributes).forEach(([key, value]) => {
                        span.setAttribute(key, value);
                    });
                }
            } catch (error) {
                console.error(`Enrichment function ${name} failed:`, error);
            }
        }
    }

    /**
     * Enriches HTTP request span
     * @private
     * @param {Object} span - Span to enrich
     * @param {Object} request - HTTP request
     */
    enrichHttpRequestSpan(span, request) {
        const headers = request.headers || request.getHeaders?.() || {};
        
        span.setAttributes({
            'http.request_content_length': headers['content-length'],
            'http.user_agent': headers['user-agent'],
            'http.referer': headers['referer'],
            'http.x_forwarded_for': headers['x-forwarded-for'],
            'http.x_request_id': headers['x-request-id'],
            'gateway.tenant_id': headers['x-tenant-id'],
            'gateway.api_version': headers['x-api-version']
        });
    }

    /**
     * Enriches HTTP response span
     * @private
     * @param {Object} span - Span to enrich
     * @param {Object} response - HTTP response
     */
    enrichHttpResponseSpan(span, response) {
        if (response.statusCode) {
            span.setAttribute('http.status_code', response.statusCode);
            
            // Set span status based on HTTP status
            if (response.statusCode >= 400) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: `HTTP ${response.statusCode}`
                });
            }
        }
        
        const headers = response.headers || response.getHeaders?.() || {};
        span.setAttributes({
            'http.response_content_length': headers['content-length'],
            'http.response_content_type': headers['content-type']
        });
    }

    /**
     * Handles span start event
     * @private
     * @param {Object} span - Started span
     * @param {Object} parentContext - Parent context
     */
    onSpanStart(span, parentContext) {
        const spanContext = span.spanContext();
        
        // Store span metadata
        this.spanMetadata.set(spanContext.spanId, {
            name: span.name,
            startTime: Date.now(),
            traceId: spanContext.traceId,
            parentSpanId: parentContext?.spanId
        });
        
        // Apply custom processors
        for (const processor of this.customProcessors.values()) {
            if (processor.onStart) {
                processor.onStart(span, parentContext);
            }
        }
    }

    /**
     * Handles span end event
     * @private
     * @param {Object} span - Ended span
     */
    onSpanEnd(span) {
        const spanContext = span.spanContext();
        const spanId = spanContext.spanId;
        
        // Remove from active spans
        const activeSpan = this.activeSpans.get(spanId);
        if (activeSpan) {
            const duration = Date.now() - activeSpan.startTime;
            
            // Update performance metrics
            this.updatePerformanceMetrics(duration);
            
            // Check for errors
            if (span.status?.code === SpanStatusCode.ERROR) {
                this.trackErrorSpan(span, activeSpan);
            }
            
            this.activeSpans.delete(spanId);
        }
        
        // Update service map
        this.updateServiceMap(span);
        
        // Apply custom processors
        for (const processor of this.customProcessors.values()) {
            if (processor.onEnd) {
                processor.onEnd(span);
            }
        }
        
        // Clean up metadata
        this.spanMetadata.delete(spanId);
        
        this.emit('span:ended', { spanId, name: span.name });
    }

    /**
     * Updates performance metrics
     * @private
     * @param {number} duration - Span duration in ms
     */
    updatePerformanceMetrics(duration) {
        const currentAvg = this.performanceMetrics.averageSpanDuration;
        const totalSpans = this.performanceMetrics.spansCreated;
        
        this.performanceMetrics.averageSpanDuration = 
            (currentAvg * (totalSpans - 1) + duration) / totalSpans;
        
        this.performanceMetrics.spansExported++;
    }

    /**
     * Tracks error spans
     * @private
     * @param {Object} span - Error span
     * @param {Object} metadata - Span metadata
     */
    trackErrorSpan(span, metadata) {
        const errorInfo = {
            spanId: span.spanContext().spanId,
            traceId: span.spanContext().traceId,
            name: metadata.name,
            error: span.status?.message,
            timestamp: Date.now(),
            duration: Date.now() - metadata.startTime
        };
        
        this.errorSpans.push(errorInfo);
        
        // Trim error spans list
        if (this.errorSpans.length > this.maxErrorSpans) {
            this.errorSpans.shift();
        }
        
        this.performanceMetrics.spansFailed++;
        this.emit('span:error', errorInfo);
    }

    /**
     * Updates service dependency map
     * @private
     * @param {Object} span - Span to analyze
     */
    updateServiceMap(span) {
        const attributes = span.attributes || {};
        const serviceName = attributes['service.name'] || 'unknown';
        const targetService = attributes['peer.service'] || attributes['db.system'];
        
        if (targetService) {
            if (!this.serviceMap.has(serviceName)) {
                this.serviceMap.set(serviceName, new Set());
            }
            this.serviceMap.get(serviceName).add(targetService);
        }
    }

    /**
     * Registers default span processors
     * @private
     */
    registerDefaultProcessors() {
        // Sampling processor
        this.registerCustomProcessor('sampling', {
            onStart: (span) => {
                if (this.sampling.dynamic) {
                    const load = this.getSystemLoad();
                    if (load > 0.8) {
                        // Reduce sampling under high load
                        this.sampling.rate = Math.max(0.1, this.sampling.rate * 0.5);
                    } else if (load < 0.3) {
                        // Increase sampling under low load
                        this.sampling.rate = Math.min(1.0, this.sampling.rate * 1.5);
                    }
                }
            }
        });
        
        // Security processor
        this.registerCustomProcessor('security', {
            onStart: (span) => {
                // Redact sensitive information
                const attributes = span.attributes || {};
                const sensitiveKeys = ['password', 'token', 'api_key', 'secret'];
                
                for (const key of Object.keys(attributes)) {
                    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                        span.setAttribute(key, '[REDACTED]');
                    }
                }
            }
        });
    }

    /**
     * Registers a custom span processor
     * @param {string} name - Processor name
     * @param {Object} processor - Processor implementation
     */
    registerCustomProcessor(name, processor) {
        this.customProcessors.set(name, processor);
        console.log(`Custom span processor registered: ${name}`);
    }

    /**
     * Registers an enrichment function
     * @param {string} name - Enrichment name
     * @param {Function} fn - Enrichment function
     */
    registerEnrichment(name, fn) {
        this.enrichmentFunctions.set(name, fn);
        console.log(`Span enrichment registered: ${name}`);
    }

    /**
     * Sets up service dependency tracking
     * @private
     */
    setupServiceTracking() {
        // Track service dependencies periodically
        setInterval(() => {
            this.emit('service:dependencies', {
                map: Array.from(this.serviceMap.entries()).map(([service, deps]) => ({
                    service,
                    dependencies: Array.from(deps)
                })),
                timestamp: Date.now()
            });
        }, 60000); // Every minute
    }

    /**
     * Starts context cleanup interval
     * @private
     */
    startContextCleanup() {
        setInterval(() => {
            const now = Date.now();
            const cutoff = now - this.maxContextAge;
            
            // Clean up old trace contexts
            for (const [id, context] of this.traceContexts) {
                if (context.timestamp < cutoff) {
                    this.traceContexts.delete(id);
                }
            }
            
            // Clean up old span metadata
            for (const [id, metadata] of this.spanMetadata) {
                if (metadata.startTime < cutoff) {
                    this.spanMetadata.delete(id);
                }
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Gets system load for dynamic sampling
     * @private
     * @returns {number} System load (0-1)
     */
    getSystemLoad() {
        const loadAvg = require('os').loadavg()[0];
        const cpuCount = require('os').cpus().length;
        return Math.min(1, loadAvg / cpuCount);
    }

    /**
     * Gets tracing statistics
     * @returns {Object} Tracing statistics
     */
    getStatistics() {
        return {
            performance: { ...this.performanceMetrics },
            activeSpans: this.activeSpans.size,
            errorSpans: this.errorSpans.length,
            samplingRate: this.sampling.rate,
            serviceDependencies: this.serviceMap.size,
            customProcessors: this.customProcessors.size,
            enrichments: this.enrichmentFunctions.size
        };
    }

    /**
     * Gets error spans
     * @param {number} limit - Maximum number of error spans to return
     * @returns {Array} Error spans
     */
    getErrorSpans(limit = 10) {
        return this.errorSpans.slice(-limit);
    }

    /**
     * Gets service dependency map
     * @returns {Object} Service dependency map
     */
    getServiceDependencies() {
        const dependencies = {};
        for (const [service, deps] of this.serviceMap) {
            dependencies[service] = Array.from(deps);
        }
        return dependencies;
    }

    /**
     * Exports traces in various formats
     * @param {string} format - Export format (json, otlp)
     * @returns {Object|string} Exported traces
     */
    exportTraces(format = 'json') {
        const traces = {
            serviceName: this.config.serviceName,
            statistics: this.getStatistics(),
            errorSpans: this.errorSpans,
            serviceDependencies: this.getServiceDependencies(),
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(traces, null, 2);
        } else if (format === 'otlp') {
            // Convert to OTLP format
            return traces; // Simplified - would need proper OTLP conversion
        } else {
            throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Flushes all pending spans
     * @async
     * @returns {Promise<void>}
     */
    async flush() {
        console.log('Flushing trace data');
        
        // Force flush all span processors
        const flushPromises = Array.from(this.spanProcessors.values()).map(processor => {
            if (processor.forceFlush) {
                return processor.forceFlush();
            }
            return Promise.resolve();
        });
        
        await Promise.all(flushPromises);
        this.emit('traces:flushed');
        console.log('Trace data flushed');
    }

    /**
     * Shuts down the trace manager
     * @async
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('Shutting down Trace Manager');
        
        try {
            // Flush pending spans
            await this.flush();
            
            // Shutdown SDK
            if (this.sdk) {
                await this.sdk.shutdown();
            }
            
            // Clear internal state
            this.activeSpans.clear();
            this.spanMetadata.clear();
            this.traceContexts.clear();
            this.errorSpans = [];
            this.serviceMap.clear();
            
            this.isInitialized = false;
            this.emit('trace-manager:shutdown');
            
            console.log('Trace Manager shut down successfully');
        } catch (error) {
            console.error('Error during Trace Manager shutdown:', error);
            throw error;
        }
    }
}

module.exports = { TraceManager };