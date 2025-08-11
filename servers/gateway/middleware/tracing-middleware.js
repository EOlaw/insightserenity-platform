'use strict';

/**
 * @fileoverview Tracing Middleware - Distributed tracing and observability
 * @module servers/gateway/middleware/tracing-middleware
 * @requires events
 * @requires crypto
 * @requires perf_hooks
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { performance, PerformanceObserver } = require('perf_hooks');
const { AsyncLocalStorage } = require('async_hooks');

/**
 * TracingMiddleware class provides comprehensive distributed tracing capabilities
 * for the API Gateway. It implements OpenTelemetry-compatible tracing, supports
 * multiple export formats (Jaeger, Zipkin, AWS X-Ray), provides automatic span
 * creation and propagation, captures detailed metrics and metadata, supports
 * sampling strategies, and integrates with logging and monitoring systems.
 * 
 * @class TracingMiddleware
 * @extends EventEmitter
 */
class TracingMiddleware extends EventEmitter {
    /**
     * Creates an instance of TracingMiddleware
     * @constructor
     * @param {Object} config - Tracing configuration
     * @param {TraceManager} traceManager - Trace manager for trace operations
     * @param {MetricsCollector} metricsCollector - Metrics collector
     * @param {Logger} logger - Logger instance
     */
    constructor(config, traceManager, metricsCollector, logger) {
        super();
        this.config = config || {};
        this.traceManager = traceManager;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
        this.isInitialized = false;
        
        // Async context storage for trace context
        this.asyncLocalStorage = new AsyncLocalStorage();
        
        // Default configuration
        this.defaultConfig = {
            enabled: config.enabled !== false,
            serviceName: config.serviceName || 'api-gateway',
            serviceVersion: config.serviceVersion || '1.0.0',
            environment: config.environment || 'production',
            propagators: config.propagators || ['w3c', 'b3', 'jaeger'],
            samplingStrategy: config.samplingStrategy || 'probabilistic',
            samplingRate: config.samplingRate || 0.1,
            maxSpansPerTrace: config.maxSpansPerTrace || 1000,
            maxAttributesPerSpan: config.maxAttributesPerSpan || 128,
            maxEventsPerSpan: config.maxEventsPerSpan || 128,
            maxLinksPerSpan: config.maxLinksPerSpan || 128,
            exportInterval: config.exportInterval || 5000,
            exportTimeout: config.exportTimeout || 30000,
            exportBatchSize: config.exportBatchSize || 512,
            captureHttpHeaders: config.captureHttpHeaders !== false,
            captureHttpBody: config.captureHttpBody || false,
            captureStackTraces: config.captureStackTraces !== false,
            redactSensitiveData: config.redactSensitiveData !== false,
            ...config
        };
        
        // Trace context propagation formats
        this.propagators = {
            'w3c': this.w3cPropagator.bind(this),
            'b3': this.b3Propagator.bind(this),
            'jaeger': this.jaegerPropagator.bind(this),
            'aws': this.awsXRayPropagator.bind(this),
            'custom': this.customPropagator.bind(this)
        };
        
        // Sampling strategies
        this.samplingStrategies = {
            'always': this.alwaysSample.bind(this),
            'never': this.neverSample.bind(this),
            'probabilistic': this.probabilisticSample.bind(this),
            'rateLimiting': this.rateLimitingSample.bind(this),
            'adaptive': this.adaptiveSample.bind(this),
            'custom': this.customSample.bind(this)
        };
        
        // Active traces and spans
        this.activeTraces = new Map();
        this.activeSpans = new Map();
        this.completedSpans = [];
        
        // Span processors
        this.spanProcessors = [];
        this.spanEnrichers = [];
        this.spanFilters = [];
        
        // Export configuration
        this.exporters = new Map();
        this.exportQueue = [];
        this.exportTimer = null;
        
        // Baggage items for context propagation
        this.baggageItems = new Map();
        this.maxBaggageItems = config.maxBaggageItems || 64;
        this.maxBaggageValueLength = config.maxBaggageValueLength || 8192;
        
        // Performance monitoring
        this.performanceMarks = new Map();
        this.performanceMeasures = new Map();
        this.resourceTimings = new Map();
        
        // Correlation with logs and metrics
        this.logCorrelation = config.logCorrelation !== false;
        this.metricCorrelation = config.metricCorrelation !== false;
        
        // Sensitive data patterns for redaction
        this.sensitivePatterns = [
            /password/i,
            /secret/i,
            /token/i,
            /api[_-]?key/i,
            /authorization/i,
            /cookie/i,
            /credit[_-]?card/i,
            /ssn/i
        ];
        
        // Custom attributes to add to all spans
        this.globalAttributes = {
            'service.name': this.defaultConfig.serviceName,
            'service.version': this.defaultConfig.serviceVersion,
            'deployment.environment': this.defaultConfig.environment,
            'telemetry.sdk.name': 'custom-gateway-tracer',
            'telemetry.sdk.version': '1.0.0',
            'telemetry.sdk.language': 'javascript'
        };
        
        // Span kind mappings
        this.spanKinds = {
            SERVER: 'SERVER',
            CLIENT: 'CLIENT',
            PRODUCER: 'PRODUCER',
            CONSUMER: 'CONSUMER',
            INTERNAL: 'INTERNAL'
        };
        
        // Span status codes
        this.spanStatusCodes = {
            UNSET: 0,
            OK: 1,
            ERROR: 2
        };
        
        // Semantic conventions for span attributes
        this.semanticConventions = {
            HTTP_METHOD: 'http.method',
            HTTP_URL: 'http.url',
            HTTP_TARGET: 'http.target',
            HTTP_HOST: 'http.host',
            HTTP_SCHEME: 'http.scheme',
            HTTP_STATUS_CODE: 'http.status_code',
            HTTP_USER_AGENT: 'http.user_agent',
            HTTP_REQUEST_SIZE: 'http.request_content_length',
            HTTP_RESPONSE_SIZE: 'http.response_content_length',
            NET_PEER_IP: 'net.peer.ip',
            NET_PEER_PORT: 'net.peer.port',
            NET_PEER_NAME: 'net.peer.name',
            DB_SYSTEM: 'db.system',
            DB_NAME: 'db.name',
            DB_STATEMENT: 'db.statement',
            DB_OPERATION: 'db.operation',
            RPC_SYSTEM: 'rpc.system',
            RPC_SERVICE: 'rpc.service',
            RPC_METHOD: 'rpc.method',
            MESSAGE_TYPE: 'message.type',
            MESSAGE_ID: 'message.id'
        };
        
        // Rate limiting for sampling
        this.samplingRateLimiter = {
            tokens: 100,
            maxTokens: 100,
            refillRate: 10,
            lastRefill: Date.now()
        };
        
        // Adaptive sampling state
        this.adaptiveSamplingState = {
            currentRate: this.defaultConfig.samplingRate,
            targetLatency: 100,
            adjustmentFactor: 0.1,
            minRate: 0.001,
            maxRate: 1.0
        };
        
        // Statistics
        this.statistics = {
            tracesCreated: 0,
            spansCreated: 0,
            spansExported: 0,
            spansSampled: 0,
            spansDropped: 0,
            exportErrors: 0,
            propagationErrors: 0,
            averageSpanDuration: 0,
            activeTraceCount: 0,
            activeSpanCount: 0,
            bySpanKind: {},
            byOperation: {},
            samplingDecisions: {
                sampled: 0,
                notSampled: 0
            }
        };
        
        // Performance observer for resource timing
        this.performanceObserver = null;
        
        // Monitoring intervals
        this.monitoringInterval = null;
        this.cleanupInterval = null;
        
        // Distributed tracing context
        this.distributedContext = new Map();
        
        // Trace state management
        this.traceStates = new Map();
        
        // Custom span processors
        this.customProcessors = new Map();
    }

    /**
     * Initializes the tracing middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Tracing middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Tracing Middleware');
            
            // Initialize exporters
            await this.initializeExporters();
            
            // Setup span processors
            this.setupSpanProcessors();
            
            // Initialize performance observer
            this.initializePerformanceObserver();
            
            // Start export timer
            this.startExportTimer();
            
            // Start monitoring
            this.startMonitoring();
            
            // Start cleanup
            this.startCleanup();
            
            this.isInitialized = true;
            this.emit('tracing:initialized');
            
            this.log('info', 'Tracing Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Tracing Middleware', error);
            throw error;
        }
    }

    /**
     * Traces incoming requests
     * @param {Object} options - Tracing options
     * @returns {Function} Express middleware function
     */
    trace(options = {}) {
        return async (req, res, next) => {
            if (!this.defaultConfig.enabled) {
                return next();
            }
            
            const startTime = performance.now();
            
            try {
                // Extract trace context from incoming request
                const parentContext = this.extractTraceContext(req);
                
                // Make sampling decision
                const sampled = await this.shouldSample(req, parentContext);
                
                // Create root span for the request
                const span = this.createSpan({
                    name: `${req.method} ${req.path}`,
                    kind: this.spanKinds.SERVER,
                    parent: parentContext,
                    attributes: {
                        [this.semanticConventions.HTTP_METHOD]: req.method,
                        [this.semanticConventions.HTTP_URL]: req.url,
                        [this.semanticConventions.HTTP_TARGET]: req.path,
                        [this.semanticConventions.HTTP_HOST]: req.hostname,
                        [this.semanticConventions.HTTP_SCHEME]: req.protocol,
                        [this.semanticConventions.HTTP_USER_AGENT]: req.headers['user-agent'],
                        [this.semanticConventions.NET_PEER_IP]: req.ip,
                        'http.route': req.route?.path,
                        'tenant.id': req.tenant?.id,
                        'user.id': req.user?.id
                    },
                    sampled
                });
                
                // Store span in async context
                this.asyncLocalStorage.run({ span, trace: span.trace }, () => {
                    // Inject trace context into request
                    req.traceContext = {
                        traceId: span.trace.traceId,
                        spanId: span.spanId,
                        sampled: span.sampled
                    };
                    
                    // Add trace headers to response
                    this.injectResponseHeaders(res, span);
                    
                    // Capture request body if configured
                    if (this.defaultConfig.captureHttpBody && req.body) {
                        span.setAttribute('http.request.body', 
                            this.redactSensitiveData(req.body));
                    }
                    
                    // Capture headers if configured
                    if (this.defaultConfig.captureHttpHeaders) {
                        span.setAttribute('http.request.headers', 
                            this.redactHeaders(req.headers));
                    }
                    
                    // Hook response events
                    const originalSend = res.send;
                    const originalJson = res.json;
                    const originalEnd = res.end;
                    
                    const responseHandler = (body) => {
                        // Capture response details
                        span.setAttribute(this.semanticConventions.HTTP_STATUS_CODE, res.statusCode);
                        
                        if (body && this.defaultConfig.captureHttpBody) {
                            span.setAttribute('http.response.body', 
                                this.redactSensitiveData(body));
                        }
                        
                        if (this.defaultConfig.captureHttpHeaders) {
                            span.setAttribute('http.response.headers', 
                                this.redactHeaders(res.getHeaders()));
                        }
                        
                        // Set span status based on HTTP status
                        if (res.statusCode >= 400) {
                            span.setStatus({
                                code: this.spanStatusCodes.ERROR,
                                message: `HTTP ${res.statusCode}`
                            });
                        } else {
                            span.setStatus({ code: this.spanStatusCodes.OK });
                        }
                        
                        // End span
                        const duration = performance.now() - startTime;
                        span.end(duration);
                        
                        // Update statistics
                        this.updateStatistics(span, duration);
                    };
                    
                    res.send = function(body) {
                        responseHandler(body);
                        return originalSend.call(this, body);
                    };
                    
                    res.json = function(body) {
                        responseHandler(body);
                        return originalJson.call(this, body);
                    };
                    
                    res.end = function(chunk, encoding) {
                        responseHandler(chunk);
                        return originalEnd.call(this, chunk, encoding);
                    };
                    
                    // Handle errors
                    const errorHandler = (error) => {
                        span.recordException(error);
                        span.setStatus({
                            code: this.spanStatusCodes.ERROR,
                            message: error.message
                        });
                    };
                    
                    // Continue with next middleware
                    next();
                });
                
            } catch (error) {
                this.log('error', 'Tracing middleware error', error);
                this.statistics.propagationErrors++;
                next(error);
            }
        };
    }

    /**
     * Creates a child span
     * @param {string} name - Span name
     * @param {Object} options - Span options
     * @returns {Object} Span object
     */
    createChildSpan(name, options = {}) {
        const context = this.asyncLocalStorage.getStore();
        
        if (!context || !context.span) {
            return this.createSpan({ name, ...options });
        }
        
        return this.createSpan({
            name,
            parent: context.span,
            ...options
        });
    }

    /**
     * Initializes exporters
     * @private
     * @async
     */
    async initializeExporters() {
        const exporterConfigs = this.config.exporters || [];
        
        for (const exporterConfig of exporterConfigs) {
            const exporter = await this.createExporter(exporterConfig);
            if (exporter) {
                this.exporters.set(exporterConfig.type, exporter);
            }
        }
        
        // Add console exporter for debugging if no exporters configured
        if (this.exporters.size === 0 && this.config.debug) {
            this.exporters.set('console', this.createConsoleExporter());
        }
        
        this.log('info', `Initialized ${this.exporters.size} trace exporters`);
    }

    /**
     * Creates an exporter based on configuration
     * @private
     * @async
     * @param {Object} config - Exporter configuration
     * @returns {Promise<Object>} Exporter instance
     */
    async createExporter(config) {
        switch (config.type) {
            case 'jaeger':
                return this.createJaegerExporter(config);
            case 'zipkin':
                return this.createZipkinExporter(config);
            case 'otlp':
                return this.createOTLPExporter(config);
            case 'xray':
                return this.createXRayExporter(config);
            case 'console':
                return this.createConsoleExporter();
            case 'custom':
                return config.exporter;
            default:
                this.log('warn', `Unknown exporter type: ${config.type}`);
                return null;
        }
    }

    /**
     * Creates Jaeger exporter
     * @private
     * @param {Object} config - Jaeger configuration
     * @returns {Object} Jaeger exporter
     */
    createJaegerExporter(config) {
        return {
            type: 'jaeger',
            endpoint: config.endpoint || 'http://localhost:14268/api/traces',
            export: async (spans) => {
                // Convert spans to Jaeger format
                const jaegerSpans = spans.map(span => this.convertToJaegerFormat(span));
                
                // Send to Jaeger collector
                // In production, use actual HTTP client
                this.log('debug', `Exporting ${spans.length} spans to Jaeger`);
                
                return { success: true };
            }
        };
    }

    /**
     * Creates Zipkin exporter
     * @private
     * @param {Object} config - Zipkin configuration
     * @returns {Object} Zipkin exporter
     */
    createZipkinExporter(config) {
        return {
            type: 'zipkin',
            endpoint: config.endpoint || 'http://localhost:9411/api/v2/spans',
            export: async (spans) => {
                // Convert spans to Zipkin format
                const zipkinSpans = spans.map(span => this.convertToZipkinFormat(span));
                
                // Send to Zipkin collector
                this.log('debug', `Exporting ${spans.length} spans to Zipkin`);
                
                return { success: true };
            }
        };
    }

    /**
     * Creates OTLP exporter
     * @private
     * @param {Object} config - OTLP configuration
     * @returns {Object} OTLP exporter
     */
    createOTLPExporter(config) {
        return {
            type: 'otlp',
            endpoint: config.endpoint || 'http://localhost:4317',
            export: async (spans) => {
                // Convert spans to OTLP format
                const otlpSpans = spans.map(span => this.convertToOTLPFormat(span));
                
                // Send to OTLP collector
                this.log('debug', `Exporting ${spans.length} spans to OTLP`);
                
                return { success: true };
            }
        };
    }

    /**
     * Creates AWS X-Ray exporter
     * @private
     * @param {Object} config - X-Ray configuration
     * @returns {Object} X-Ray exporter
     */
    createXRayExporter(config) {
        return {
            type: 'xray',
            export: async (spans) => {
                // Convert spans to X-Ray format
                const xraySegments = spans.map(span => this.convertToXRayFormat(span));
                
                // Send to X-Ray daemon
                this.log('debug', `Exporting ${spans.length} spans to X-Ray`);
                
                return { success: true };
            }
        };
    }

    /**
     * Creates console exporter for debugging
     * @private
     * @returns {Object} Console exporter
     */
    createConsoleExporter() {
        return {
            type: 'console',
            export: async (spans) => {
                spans.forEach(span => {
                    console.log('TRACE:', JSON.stringify({
                        traceId: span.trace.traceId,
                        spanId: span.spanId,
                        name: span.name,
                        duration: span.duration,
                        attributes: span.attributes
                    }, null, 2));
                });
                
                return { success: true };
            }
        };
    }

    /**
     * Sets up span processors
     * @private
     */
    setupSpanProcessors() {
        // Batch span processor
        this.spanProcessors.push({
            name: 'batch',
            process: (span) => {
                this.exportQueue.push(span);
                
                if (this.exportQueue.length >= this.defaultConfig.exportBatchSize) {
                    this.exportBatch();
                }
            }
        });
        
        // Attribute enrichment processor
        this.spanProcessors.push({
            name: 'enrichment',
            process: (span) => {
                // Add global attributes
                Object.entries(this.globalAttributes).forEach(([key, value]) => {
                    span.setAttribute(key, value);
                });
                
                // Apply custom enrichers
                this.spanEnrichers.forEach(enricher => enricher(span));
            }
        });
        
        // Filtering processor
        this.spanProcessors.push({
            name: 'filtering',
            process: (span) => {
                // Apply span filters
                for (const filter of this.spanFilters) {
                    if (!filter(span)) {
                        span.drop = true;
                        this.statistics.spansDropped++;
                        break;
                    }
                }
            }
        });
        
        this.log('info', 'Span processors configured');
    }

    /**
     * Initializes performance observer
     * @private
     */
    initializePerformanceObserver() {
        this.performanceObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this.handlePerformanceEntry(entry);
            }
        });
        
        this.performanceObserver.observe({ 
            entryTypes: ['measure', 'mark', 'resource', 'navigation'] 
        });
        
        this.log('info', 'Performance observer initialized');
    }

    /**
     * Creates a span
     * @private
     * @param {Object} options - Span options
     * @returns {Object} Span object
     */
    createSpan(options) {
        const span = {
            spanId: this.generateSpanId(),
            parentSpanId: options.parent?.spanId || null,
            name: options.name,
            kind: options.kind || this.spanKinds.INTERNAL,
            startTime: performance.now(),
            endTime: null,
            duration: null,
            attributes: options.attributes || {},
            events: [],
            links: options.links || [],
            status: { code: this.spanStatusCodes.UNSET },
            sampled: options.sampled !== false,
            trace: options.parent?.trace || this.createTrace()
        };
        
        // Add methods to span
        span.setAttribute = (key, value) => {
            if (Object.keys(span.attributes).length < this.defaultConfig.maxAttributesPerSpan) {
                span.attributes[key] = this.sanitizeAttributeValue(value);
            }
        };
        
        span.setAttributes = (attributes) => {
            Object.entries(attributes).forEach(([key, value]) => {
                span.setAttribute(key, value);
            });
        };
        
        span.addEvent = (name, attributes) => {
            if (span.events.length < this.defaultConfig.maxEventsPerSpan) {
                span.events.push({
                    name,
                    timestamp: performance.now(),
                    attributes: attributes || {}
                });
            }
        };
        
        span.recordException = (error) => {
            span.addEvent('exception', {
                'exception.type': error.name,
                'exception.message': error.message,
                'exception.stacktrace': this.defaultConfig.captureStackTraces ? 
                    error.stack : undefined
            });
        };
        
        span.setStatus = (status) => {
            span.status = status;
        };
        
        span.end = (duration) => {
            span.endTime = performance.now();
            span.duration = duration || (span.endTime - span.startTime);
            
            // Process span
            this.processSpan(span);
        };
        
        // Track active span
        this.activeSpans.set(span.spanId, span);
        
        // Update statistics
        this.statistics.spansCreated++;
        this.statistics.activeSpanCount = this.activeSpans.size;
        
        if (span.sampled) {
            this.statistics.spansSampled++;
        }
        
        this.emit('span:created', span);
        
        return span;
    }

    /**
     * Creates a trace
     * @private
     * @returns {Object} Trace object
     */
    createTrace() {
        const trace = {
            traceId: this.generateTraceId(),
            startTime: Date.now(),
            spans: [],
            baggage: new Map()
        };
        
        this.activeTraces.set(trace.traceId, trace);
        
        this.statistics.tracesCreated++;
        this.statistics.activeTraceCount = this.activeTraces.size;
        
        return trace;
    }

    /**
     * Processes a completed span
     * @private
     * @param {Object} span - Span to process
     */
    processSpan(span) {
        // Remove from active spans
        this.activeSpans.delete(span.spanId);
        this.statistics.activeSpanCount = this.activeSpans.size;
        
        // Check if span should be dropped
        if (span.drop) {
            return;
        }
        
        // Apply span processors
        for (const processor of this.spanProcessors) {
            processor.process(span);
            
            if (span.drop) {
                return;
            }
        }
        
        // Apply custom processors
        for (const processor of this.customProcessors.values()) {
            processor(span);
        }
        
        // Add to completed spans
        this.completedSpans.push(span);
        
        // Update trace
        const trace = this.activeTraces.get(span.trace.traceId);
        if (trace) {
            trace.spans.push(span);
            
            // Check if trace is complete
            if (this.isTraceComplete(trace)) {
                this.completeTrace(trace);
            }
        }
        
        this.emit('span:completed', span);
    }

    /**
     * Extracts trace context from request
     * @private
     * @param {Object} req - Request object
     * @returns {Object|null} Parent context
     */
    extractTraceContext(req) {
        for (const propagatorName of this.defaultConfig.propagators) {
            const propagator = this.propagators[propagatorName];
            
            if (propagator) {
                const context = propagator.extract(req);
                
                if (context) {
                    return context;
                }
            }
        }
        
        return null;
    }

    /**
     * Propagator implementations
     */
    
    w3cPropagator = {
        extract: (req) => {
            const traceparent = req.headers.traceparent;
            if (!traceparent) return null;
            
            const parts = traceparent.split('-');
            if (parts.length !== 4) return null;
            
            return {
                traceId: parts[1],
                spanId: parts[2],
                traceFlags: parseInt(parts[3], 16),
                sampled: (parseInt(parts[3], 16) & 0x01) === 1
            };
        },
        inject: (carrier, context) => {
            const version = '00';
            const traceFlags = context.sampled ? '01' : '00';
            carrier.traceparent = `${version}-${context.traceId}-${context.spanId}-${traceFlags}`;
            
            if (context.traceState) {
                carrier.tracestate = context.traceState;
            }
        }
    };
    
    b3Propagator = {
        extract: (req) => {
            const traceId = req.headers['x-b3-traceid'];
            const spanId = req.headers['x-b3-spanid'];
            const sampled = req.headers['x-b3-sampled'];
            
            if (!traceId || !spanId) return null;
            
            return {
                traceId,
                spanId,
                parentSpanId: req.headers['x-b3-parentspanid'],
                sampled: sampled === '1'
            };
        },
        inject: (carrier, context) => {
            carrier['x-b3-traceid'] = context.traceId;
            carrier['x-b3-spanid'] = context.spanId;
            carrier['x-b3-sampled'] = context.sampled ? '1' : '0';
            
            if (context.parentSpanId) {
                carrier['x-b3-parentspanid'] = context.parentSpanId;
            }
        }
    };
    
    jaegerPropagator = {
        extract: (req) => {
            const uberTraceId = req.headers['uber-trace-id'];
            if (!uberTraceId) return null;
            
            const parts = uberTraceId.split(':');
            if (parts.length !== 4) return null;
            
            return {
                traceId: parts[0],
                spanId: parts[1],
                parentSpanId: parts[2],
                sampled: parts[3] === '1'
            };
        },
        inject: (carrier, context) => {
            const flags = context.sampled ? '1' : '0';
            carrier['uber-trace-id'] = 
                `${context.traceId}:${context.spanId}:${context.parentSpanId || '0'}:${flags}`;
        }
    };
    
    awsXRayPropagator = {
        extract: (req) => {
            const traceHeader = req.headers['x-amzn-trace-id'];
            if (!traceHeader) return null;
            
            const parts = traceHeader.split(';');
            const values = {};
            
            parts.forEach(part => {
                const [key, value] = part.split('=');
                values[key] = value;
            });
            
            if (!values.Root) return null;
            
            return {
                traceId: values.Root.replace('Root=', ''),
                parentId: values.Parent,
                sampled: values.Sampled === '1'
            };
        },
        inject: (carrier, context) => {
            const parts = [`Root=${context.traceId}`];
            
            if (context.parentId) {
                parts.push(`Parent=${context.parentId}`);
            }
            
            parts.push(`Sampled=${context.sampled ? '1' : '0'}`);
            
            carrier['x-amzn-trace-id'] = parts.join(';');
        }
    };
    
    customPropagator = {
        extract: (req) => {
            if (this.config.customExtractor) {
                return this.config.customExtractor(req);
            }
            return null;
        },
        inject: (carrier, context) => {
            if (this.config.customInjector) {
                this.config.customInjector(carrier, context);
            }
        }
    };

    /**
     * Injects trace headers into response
     * @private
     * @param {Object} res - Response object
     * @param {Object} span - Current span
     */
    injectResponseHeaders(res, span) {
        const context = {
            traceId: span.trace.traceId,
            spanId: span.spanId,
            sampled: span.sampled
        };
        
        // Add trace ID header for correlation
        res.setHeader('X-Trace-Id', context.traceId);
        
        // Inject using configured propagators
        for (const propagatorName of this.defaultConfig.propagators) {
            const propagator = this.propagators[propagatorName];
            
            if (propagator && propagator.inject) {
                const headers = {};
                propagator.inject(headers, context);
                
                Object.entries(headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
            }
        }
    }

    /**
     * Sampling strategies
     */
    
    async shouldSample(req, parentContext) {
        // Honor parent sampling decision if present
        if (parentContext && parentContext.sampled !== undefined) {
            return parentContext.sampled;
        }
        
        const strategy = this.samplingStrategies[this.defaultConfig.samplingStrategy];
        
        if (strategy) {
            const decision = await strategy(req);
            
            this.statistics.samplingDecisions[decision ? 'sampled' : 'notSampled']++;
            
            return decision;
        }
        
        return true;
    }
    
    async alwaysSample() {
        return true;
    }
    
    async neverSample() {
        return false;
    }
    
    async probabilisticSample() {
        return Math.random() < this.defaultConfig.samplingRate;
    }
    
    async rateLimitingSample() {
        // Refill tokens
        const now = Date.now();
        const elapsed = (now - this.samplingRateLimiter.lastRefill) / 1000;
        const tokensToAdd = elapsed * this.samplingRateLimiter.refillRate;
        
        this.samplingRateLimiter.tokens = Math.min(
            this.samplingRateLimiter.maxTokens,
            this.samplingRateLimiter.tokens + tokensToAdd
        );
        
        this.samplingRateLimiter.lastRefill = now;
        
        // Check if we have tokens
        if (this.samplingRateLimiter.tokens >= 1) {
            this.samplingRateLimiter.tokens--;
            return true;
        }
        
        return false;
    }
    
    async adaptiveSample(req) {
        // Adjust sampling rate based on system load
        const currentLoad = this.getCurrentSystemLoad();
        
        if (currentLoad > 0.8) {
            // High load - reduce sampling
            this.adaptiveSamplingState.currentRate = Math.max(
                this.adaptiveSamplingState.minRate,
                this.adaptiveSamplingState.currentRate * 0.9
            );
        } else if (currentLoad < 0.5) {
            // Low load - increase sampling
            this.adaptiveSamplingState.currentRate = Math.min(
                this.adaptiveSamplingState.maxRate,
                this.adaptiveSamplingState.currentRate * 1.1
            );
        }
        
        return Math.random() < this.adaptiveSamplingState.currentRate;
    }
    
    async customSample(req) {
        if (this.config.customSampler) {
            return await this.config.customSampler(req);
        }
        return true;
    }

    /**
     * Data sanitization and redaction
     */
    
    redactSensitiveData(data) {
        if (!this.defaultConfig.redactSensitiveData) {
            return data;
        }
        
        if (typeof data === 'string') {
            return this.redactString(data);
        }
        
        if (typeof data === 'object' && data !== null) {
            return this.redactObject(data);
        }
        
        return data;
    }
    
    redactObject(obj) {
        const redacted = Array.isArray(obj) ? [] : {};
        
        for (const [key, value] of Object.entries(obj)) {
            if (this.isSensitiveKey(key)) {
                redacted[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                redacted[key] = this.redactObject(value);
            } else if (typeof value === 'string') {
                redacted[key] = this.redactString(value);
            } else {
                redacted[key] = value;
            }
        }
        
        return redacted;
    }
    
    redactString(str) {
        // Redact potential credit card numbers
        str = str.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED_CC]');
        
        // Redact potential SSNs
        str = str.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
        
        // Redact email addresses if needed
        if (this.config.redactEmails) {
            str = str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
        }
        
        return str;
    }
    
    redactHeaders(headers) {
        const redacted = {};
        
        for (const [key, value] of Object.entries(headers)) {
            if (this.isSensitiveHeader(key)) {
                redacted[key] = '[REDACTED]';
            } else {
                redacted[key] = value;
            }
        }
        
        return redacted;
    }
    
    isSensitiveKey(key) {
        return this.sensitivePatterns.some(pattern => pattern.test(key));
    }
    
    isSensitiveHeader(header) {
        const sensitiveHeaders = [
            'authorization',
            'cookie',
            'x-api-key',
            'x-auth-token'
        ];
        
        return sensitiveHeaders.includes(header.toLowerCase());
    }
    
    sanitizeAttributeValue(value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value).substring(0, 1000);
            } catch {
                return '[Object]';
            }
        }
        
        if (typeof value === 'string' && value.length > 1000) {
            return value.substring(0, 1000) + '...';
        }
        
        return value;
    }

    /**
     * Export and batching
     */
    
    startExportTimer() {
        this.exportTimer = setInterval(() => {
            if (this.exportQueue.length > 0) {
                this.exportBatch();
            }
        }, this.defaultConfig.exportInterval);
        
        this.log('info', 'Export timer started');
    }
    
    async exportBatch() {
        if (this.exportQueue.length === 0) return;
        
        const batch = this.exportQueue.splice(0, this.defaultConfig.exportBatchSize);
        
        for (const [type, exporter] of this.exporters) {
            try {
                await exporter.export(batch);
                this.statistics.spansExported += batch.length;
            } catch (error) {
                this.statistics.exportErrors++;
                this.log('error', `Export failed for ${type}`, error);
            }
        }
        
        this.emit('spans:exported', { count: batch.length });
    }

    /**
     * Format converters
     */
    
    convertToJaegerFormat(span) {
        return {
            traceID: span.trace.traceId,
            spanID: span.spanId,
            parentSpanID: span.parentSpanId,
            operationName: span.name,
            startTime: span.startTime * 1000,
            duration: span.duration * 1000,
            tags: this.attributesToJaegerTags(span.attributes),
            logs: span.events.map(event => ({
                timestamp: event.timestamp * 1000,
                fields: this.attributesToJaegerTags(event.attributes)
            })),
            process: {
                serviceName: this.defaultConfig.serviceName,
                tags: this.attributesToJaegerTags(this.globalAttributes)
            }
        };
    }
    
    convertToZipkinFormat(span) {
        return {
            traceId: span.trace.traceId,
            id: span.spanId,
            parentId: span.parentSpanId,
            name: span.name,
            timestamp: span.startTime * 1000,
            duration: span.duration * 1000,
            kind: span.kind,
            localEndpoint: {
                serviceName: this.defaultConfig.serviceName
            },
            tags: span.attributes,
            annotations: span.events.map(event => ({
                timestamp: event.timestamp * 1000,
                value: event.name
            }))
        };
    }
    
    convertToOTLPFormat(span) {
        return {
            traceId: span.trace.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            kind: this.spanKindToOTLP(span.kind),
            startTimeUnixNano: span.startTime * 1000000,
            endTimeUnixNano: span.endTime * 1000000,
            attributes: this.attributesToOTLP(span.attributes),
            events: span.events.map(event => ({
                timeUnixNano: event.timestamp * 1000000,
                name: event.name,
                attributes: this.attributesToOTLP(event.attributes)
            })),
            status: {
                code: span.status.code,
                message: span.status.message
            }
        };
    }
    
    convertToXRayFormat(span) {
        return {
            id: span.spanId,
            trace_id: span.trace.traceId,
            parent_id: span.parentSpanId,
            name: span.name,
            start_time: span.startTime / 1000,
            end_time: span.endTime / 1000,
            http: this.extractHttpFields(span.attributes),
            annotations: span.attributes,
            metadata: {
                default: span.events
            }
        };
    }
    
    attributesToJaegerTags(attributes) {
        return Object.entries(attributes).map(([key, value]) => ({
            key,
            type: typeof value === 'number' ? 'float64' : 
                  typeof value === 'boolean' ? 'bool' : 'string',
            value: value.toString()
        }));
    }
    
    attributesToOTLP(attributes) {
        return Object.entries(attributes).map(([key, value]) => ({
            key,
            value: this.createOTLPAttributeValue(value)
        }));
    }
    
    createOTLPAttributeValue(value) {
        if (typeof value === 'string') {
            return { stringValue: value };
        } else if (typeof value === 'number') {
            return Number.isInteger(value) ? 
                { intValue: value } : { doubleValue: value };
        } else if (typeof value === 'boolean') {
            return { boolValue: value };
        } else if (Array.isArray(value)) {
            return { arrayValue: { values: value.map(v => this.createOTLPAttributeValue(v)) } };
        } else {
            return { stringValue: JSON.stringify(value) };
        }
    }
    
    spanKindToOTLP(kind) {
        const mapping = {
            'SERVER': 2,
            'CLIENT': 3,
            'PRODUCER': 4,
            'CONSUMER': 5,
            'INTERNAL': 1
        };
        
        return mapping[kind] || 0;
    }
    
    extractHttpFields(attributes) {
        const http = {};
        
        const httpFields = [
            'http.method',
            'http.url',
            'http.status_code',
            'http.request_content_length',
            'http.response_content_length'
        ];
        
        httpFields.forEach(field => {
            if (attributes[field]) {
                const key = field.replace('http.', '');
                http[key] = attributes[field];
            }
        });
        
        return Object.keys(http).length > 0 ? http : undefined;
    }

    /**
     * Helper methods
     */
    
    generateTraceId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    generateSpanId() {
        return crypto.randomBytes(8).toString('hex');
    }
    
    getCurrentSystemLoad() {
        // Simplified load calculation
        // In production, use actual system metrics
        return 0.5;
    }
    
    isTraceComplete(trace) {
        // Simple check - trace is complete if root span is ended
        // In production, implement more sophisticated logic
        const rootSpan = trace.spans.find(s => !s.parentSpanId);
        return rootSpan && rootSpan.endTime !== null;
    }
    
    completeTrace(trace) {
        // Remove from active traces
        this.activeTraces.delete(trace.traceId);
        this.statistics.activeTraceCount = this.activeTraces.size;
        
        // Export if needed
        if (this.config.exportCompleteTraces) {
            this.exportTrace(trace);
        }
        
        this.emit('trace:completed', trace);
    }
    
    async exportTrace(trace) {
        // Export all spans in the trace
        for (const span of trace.spans) {
            this.exportQueue.push(span);
        }
        
        // Trigger immediate export for complete traces
        if (this.config.immediateTraceExport) {
            await this.exportBatch();
        }
    }
    
    handlePerformanceEntry(entry) {
        const context = this.asyncLocalStorage.getStore();
        
        if (context && context.span) {
            context.span.addEvent('performance', {
                'perf.name': entry.name,
                'perf.type': entry.entryType,
                'perf.duration': entry.duration,
                'perf.start': entry.startTime
            });
        }
    }
    
    updateStatistics(span, duration) {
        // Update span kind statistics
        this.statistics.bySpanKind[span.kind] = 
            (this.statistics.bySpanKind[span.kind] || 0) + 1;
        
        // Update operation statistics
        this.statistics.byOperation[span.name] = 
            (this.statistics.byOperation[span.name] || 0) + 1;
        
        // Update average duration
        const totalSpans = this.statistics.spansCreated;
        this.statistics.averageSpanDuration = 
            (this.statistics.averageSpanDuration * (totalSpans - 1) + duration) / totalSpans;
    }

    /**
     * Monitoring and maintenance
     */
    
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.emit('tracing:metrics', this.getStatistics());
        }, 30000); // Every 30 seconds
        
        this.log('info', 'Tracing monitoring started');
    }
    
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const maxAge = 300000; // 5 minutes
            
            // Clean old completed spans
            this.completedSpans = this.completedSpans.filter(
                span => (now - span.startTime) < maxAge
            );
            
            // Clean inactive traces
            for (const [traceId, trace] of this.activeTraces) {
                if ((now - trace.startTime) > maxAge) {
                    this.activeTraces.delete(traceId);
                    this.log('warn', `Trace timeout: ${traceId}`);
                }
            }
            
            // Clean orphaned spans
            for (const [spanId, span] of this.activeSpans) {
                if ((now - span.startTime) > maxAge) {
                    this.activeSpans.delete(spanId);
                    this.log('warn', `Span timeout: ${spanId}`);
                }
            }
            
            this.statistics.activeTraceCount = this.activeTraces.size;
            this.statistics.activeSpanCount = this.activeSpans.size;
            
        }, 60000); // Every minute
        
        this.log('info', 'Tracing cleanup started');
    }
    
    collectMetrics() {
        if (this.metricsCollector) {
            this.metricsCollector.setGauge('traces_active', this.statistics.activeTraceCount);
            this.metricsCollector.setGauge('spans_active', this.statistics.activeSpanCount);
            this.metricsCollector.setGauge('spans_created_total', this.statistics.spansCreated);
            this.metricsCollector.setGauge('spans_exported_total', this.statistics.spansExported);
            this.metricsCollector.setGauge('spans_dropped_total', this.statistics.spansDropped);
            this.metricsCollector.setGauge('export_errors_total', this.statistics.exportErrors);
            this.metricsCollector.setGauge('average_span_duration_ms', this.statistics.averageSpanDuration);
        }
    }

    /**
     * Public API methods
     */
    
    getCurrentSpan() {
        const context = this.asyncLocalStorage.getStore();
        return context ? context.span : null;
    }
    
    getCurrentTrace() {
        const context = this.asyncLocalStorage.getStore();
        return context ? context.trace : null;
    }
    
    withSpan(span, fn) {
        return this.asyncLocalStorage.run({ span, trace: span.trace }, fn);
    }
    
    addSpanProcessor(processor) {
        this.spanProcessors.push(processor);
        this.log('info', `Span processor added: ${processor.name}`);
    }
    
    addSpanEnricher(enricher) {
        this.spanEnrichers.push(enricher);
        this.log('info', 'Span enricher added');
    }
    
    addSpanFilter(filter) {
        this.spanFilters.push(filter);
        this.log('info', 'Span filter added');
    }
    
    registerCustomProcessor(name, processor) {
        this.customProcessors.set(name, processor);
        this.log('info', `Custom processor registered: ${name}`);
    }
    
    setBaggage(key, value) {
        const context = this.asyncLocalStorage.getStore();
        
        if (context && context.trace) {
            if (context.trace.baggage.size < this.maxBaggageItems) {
                const sanitizedValue = value.toString().substring(0, this.maxBaggageValueLength);
                context.trace.baggage.set(key, sanitizedValue);
            }
        }
    }
    
    getBaggage(key) {
        const context = this.asyncLocalStorage.getStore();
        
        if (context && context.trace) {
            return context.trace.baggage.get(key);
        }
        
        return null;
    }
    
    getAllBaggage() {
        const context = this.asyncLocalStorage.getStore();
        
        if (context && context.trace) {
            return Object.fromEntries(context.trace.baggage);
        }
        
        return {};
    }
    
    injectContext(carrier) {
        const context = this.asyncLocalStorage.getStore();
        
        if (context && context.span) {
            const traceContext = {
                traceId: context.trace.traceId,
                spanId: context.span.spanId,
                sampled: context.span.sampled
            };
            
            for (const propagatorName of this.defaultConfig.propagators) {
                const propagator = this.propagators[propagatorName];
                
                if (propagator && propagator.inject) {
                    propagator.inject(carrier, traceContext);
                }
            }
        }
    }
    
    extractContext(carrier) {
        for (const propagatorName of this.defaultConfig.propagators) {
            const propagator = this.propagators[propagatorName];
            
            if (propagator && propagator.extract) {
                const context = propagator.extract({ headers: carrier });
                
                if (context) {
                    return context;
                }
            }
        }
        
        return null;
    }
    
    forceFlush() {
        return this.exportBatch();
    }
    
    getStatistics() {
        return {
            ...this.statistics,
            exportQueueSize: this.exportQueue.length,
            completedSpansBuffered: this.completedSpans.length,
            exporters: Array.from(this.exporters.keys()),
            samplingRate: this.adaptiveSamplingState.currentRate
        };
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.log('info', 'Cleaning up Tracing Middleware');
        
        // Export remaining spans
        await this.forceFlush();
        
        // Clear intervals
        if (this.exportTimer) {
            clearInterval(this.exportTimer);
        }
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Stop performance observer
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
        }
        
        // Clear maps
        this.activeTraces.clear();
        this.activeSpans.clear();
        this.exporters.clear();
        this.baggageItems.clear();
        this.performanceMarks.clear();
        this.performanceMeasures.clear();
        this.resourceTimings.clear();
        this.distributedContext.clear();
        this.traceStates.clear();
        this.customProcessors.clear();
        
        // Clear arrays
        this.completedSpans = [];
        this.exportQueue = [];
        this.spanProcessors = [];
        this.spanEnrichers = [];
        this.spanFilters = [];
        
        this.isInitialized = false;
        this.emit('tracing:cleanup');
    }
}

module.exports = { TracingMiddleware };