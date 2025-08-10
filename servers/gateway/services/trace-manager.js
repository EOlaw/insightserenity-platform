/**
 * Trace Manager
 * Manages OpenTelemetry tracing for distributed tracing
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } = require('@opentelemetry/core');
const opentelemetry = require('@opentelemetry/api');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

/**
 * Trace Manager Class
 */
class TraceManager {
    constructor(config) {
        this.config = config;
        this.sdk = null;
        this.tracer = null;
        this.provider = null;
        this.propagator = null;
        this.exporter = null;
        this.initialized = false;
    }

    /**
     * Initialize tracing
     */
    async initialize() {
        if (!this.config.enabled) {
            console.info('Tracing is disabled');
            return;
        }

        try {
            // Set up diagnostic logging
            if (process.env.NODE_ENV === 'development') {
                diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
            }

            // Create resource
            const resource = Resource.default().merge(
                new Resource({
                    [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName || 'api-gateway',
                    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
                    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'gateway-instance',
                    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'insightserenity',
                    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
                    'service.type': 'gateway',
                    'platform.name': 'insightserenity',
                    'platform.version': '1.0.0'
                })
            );

            // Create trace exporter
            this.exporter = new OTLPTraceExporter({
                url: this.config.endpoint || 'http://localhost:4318/v1/traces',
                headers: this.config.headers || {},
                concurrencyLimit: 10,
                timeoutMillis: this.config.exportTimeoutMillis || 10000
            });

            // Create span processor
            const spanProcessor = new BatchSpanProcessor(this.exporter, {
                maxQueueSize: 2048,
                maxExportBatchSize: 512,
                scheduledDelayMillis: this.config.exportIntervalMillis || 5000,
                exportTimeoutMillis: this.config.exportTimeoutMillis || 10000
            });

            // Add console exporter in development
            const spanProcessors = [spanProcessor];
            if (process.env.NODE_ENV === 'development') {
                spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
            }

            // Create propagators
            const propagators = [];
            const configuredPropagators = this.config.propagators || ['tracecontext', 'baggage'];
            
            if (configuredPropagators.includes('tracecontext')) {
                propagators.push(new W3CTraceContextPropagator());
            }
            if (configuredPropagators.includes('baggage')) {
                propagators.push(new W3CBaggagePropagator());
            }
            
            this.propagator = new CompositePropagator({
                propagators: propagators
            });

            // Configure SDK
            this.sdk = new NodeSDK({
                resource: resource,
                spanProcessor: spanProcessors,
                textMapPropagator: this.propagator,
                instrumentations: this.getInstrumentations(),
                serviceName: this.config.serviceName || 'api-gateway',
                traceExporter: this.exporter,
                autoDetectResources: true
            });

            // Initialize SDK
            await this.sdk.start();

            // Get tracer provider
            this.provider = opentelemetry.trace.getTracerProvider();
            
            // Set global propagator
            opentelemetry.propagation.setGlobalPropagator(this.propagator);

            // Get tracer
            this.tracer = opentelemetry.trace.getTracer(
                this.config.serviceName || 'api-gateway',
                '1.0.0'
            );

            // Configure sampling
            this.configureSampling();

            this.initialized = true;
            console.info('Tracing initialized successfully', {
                endpoint: this.config.endpoint,
                serviceName: this.config.serviceName
            });
        } catch (error) {
            console.error('Failed to initialize tracing:', error);
            throw error;
        }
    }

    /**
     * Get instrumentations
     */
    getInstrumentations() {
        return [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': {
                    enabled: false // Disable fs instrumentation to reduce noise
                },
                '@opentelemetry/instrumentation-dns': {
                    enabled: false // Disable DNS instrumentation
                },
                '@opentelemetry/instrumentation-net': {
                    enabled: false // Disable net instrumentation
                },
                '@opentelemetry/instrumentation-http': {
                    enabled: true,
                    requestHook: (span, request) => {
                        span.setAttribute('http.request.body.size', request.headers['content-length'] || 0);
                        span.setAttribute('http.request.id', request.headers['x-request-id']);
                    },
                    responseHook: (span, response) => {
                        span.setAttribute('http.response.body.size', response.headers['content-length'] || 0);
                    },
                    ignoreIncomingPaths: ['/health', '/metrics', '/favicon.ico'],
                    ignoreOutgoingUrls: []
                },
                '@opentelemetry/instrumentation-express': {
                    enabled: true,
                    requestHook: (span, { req }) => {
                        span.setAttribute('express.route', req.route?.path);
                        span.setAttribute('express.params', JSON.stringify(req.params));
                    }
                },
                '@opentelemetry/instrumentation-mongodb': {
                    enabled: true,
                    enhancedDatabaseReporting: true
                },
                '@opentelemetry/instrumentation-redis': {
                    enabled: true
                },
                '@opentelemetry/instrumentation-ioredis': {
                    enabled: true
                }
            })
        ];
    }

    /**
     * Configure sampling
     */
    configureSampling() {
        const samplingRate = this.config.samplingRate || 1.0;
        
        // Custom sampler implementation
        const sampler = {
            shouldSample: (context, traceId, spanName, spanKind, attributes, links) => {
                // Always sample health checks and metrics at a lower rate
                if (spanName.includes('/health') || spanName.includes('/metrics')) {
                    return {
                        decision: Math.random() < 0.01 ? 1 : 0,
                        attributes: attributes
                    };
                }
                
                // Sample based on configured rate
                return {
                    decision: Math.random() < samplingRate ? 1 : 0,
                    attributes: attributes
                };
            },
            toString: () => `CustomSampler(${samplingRate})`
        };

        // Note: In production, you would configure the sampler through the SDK
        // This is a simplified example
    }

    /**
     * Get tracer
     */
    getTracer() {
        if (!this.initialized) {
            // Return a no-op tracer if not initialized
            return opentelemetry.trace.getTracer('noop');
        }
        return this.tracer;
    }

    /**
     * Get propagator
     */
    getPropagator() {
        return this.propagator || opentelemetry.propagation;
    }

    /**
     * Create span
     */
    createSpan(name, options = {}) {
        if (!this.tracer) {
            return null;
        }

        return this.tracer.startSpan(name, {
            kind: options.kind || opentelemetry.SpanKind.INTERNAL,
            attributes: options.attributes || {},
            links: options.links || [],
            startTime: options.startTime || Date.now()
        });
    }

    /**
     * Get active span
     */
    getActiveSpan() {
        return opentelemetry.trace.getActiveSpan();
    }

    /**
     * With span
     */
    withSpan(span, fn) {
        return opentelemetry.context.with(
            opentelemetry.trace.setSpan(opentelemetry.context.active(), span),
            fn
        );
    }

    /**
     * Record exception
     */
    recordException(error, span = null) {
        const activeSpan = span || this.getActiveSpan();
        if (activeSpan) {
            activeSpan.recordException(error);
            activeSpan.setStatus({
                code: opentelemetry.SpanStatusCode.ERROR,
                message: error.message
            });
        }
    }

    /**
     * Add event
     */
    addEvent(name, attributes = {}, span = null) {
        const activeSpan = span || this.getActiveSpan();
        if (activeSpan) {
            activeSpan.addEvent(name, attributes);
        }
    }

    /**
     * Set attributes
     */
    setAttributes(attributes, span = null) {
        const activeSpan = span || this.getActiveSpan();
        if (activeSpan) {
            activeSpan.setAttributes(attributes);
        }
    }

    /**
     * Extract context from carrier
     */
    extractContext(carrier) {
        return this.propagator.extract(
            opentelemetry.ROOT_CONTEXT,
            carrier,
            opentelemetry.defaultTextMapGetter
        );
    }

    /**
     * Inject context into carrier
     */
    injectContext(context, carrier) {
        this.propagator.inject(
            context,
            carrier,
            opentelemetry.defaultTextMapSetter
        );
    }

    /**
     * Create baggage
     */
    createBaggage(entries) {
        const baggage = opentelemetry.propagation.createBaggage(entries);
        return opentelemetry.propagation.setBaggage(opentelemetry.context.active(), baggage);
    }

    /**
     * Get baggage
     */
    getBaggage() {
        return opentelemetry.propagation.getBaggage(opentelemetry.context.active());
    }

    /**
     * Flush traces
     */
    async flush() {
        if (this.provider && this.provider.forceFlush) {
            await this.provider.forceFlush();
        }
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return {
            initialized: this.initialized,
            serviceName: this.config.serviceName,
            endpoint: this.config.endpoint,
            samplingRate: this.config.samplingRate
        };
    }

    /**
     * Shutdown tracing
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }

        try {
            console.info('Shutting down tracing...');
            
            // Flush any pending spans
            await this.flush();
            
            // Shutdown SDK
            if (this.sdk) {
                await this.sdk.shutdown();
            }
            
            this.initialized = false;
            this.tracer = null;
            this.provider = null;
            this.propagator = null;
            this.exporter = null;
            this.sdk = null;
            
            console.info('Tracing shutdown completed');
        } catch (error) {
            console.error('Error during tracing shutdown:', error);
        }
    }
}

module.exports = { TraceManager };