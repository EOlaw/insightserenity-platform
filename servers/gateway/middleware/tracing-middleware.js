/**
 * Tracing Middleware
 * Implements distributed tracing with OpenTelemetry
 */

const { v4: uuidv4 } = require('uuid');
const opentelemetry = require('@opentelemetry/api');

/**
 * Tracing Middleware Class
 */
class TracingMiddleware {
    constructor(traceManager, config) {
        this.traceManager = traceManager;
        this.config = config;
        this.tracer = null;
        this.propagator = null;
    }

    /**
     * Initialize tracing middleware
     */
    async initialize() {
        if (!this.config.enabled) {
            return;
        }

        // Get tracer from trace manager
        this.tracer = this.traceManager.getTracer();
        this.propagator = this.traceManager.getPropagator();
    }

    /**
     * Get middleware function
     */
    getMiddleware() {
        return (req, res, next) => {
            if (!this.config.enabled || !this.tracer) {
                // Generate basic trace ID even if tracing is disabled
                req.traceId = req.headers['x-trace-id'] || uuidv4();
                req.spanId = uuidv4().substring(0, 16);
                req.headers['x-trace-id'] = req.traceId;
                req.headers['x-span-id'] = req.spanId;
                return next();
            }

            // Extract context from incoming request
            const context = this.propagator.extract(
                opentelemetry.ROOT_CONTEXT,
                req.headers,
                opentelemetry.defaultTextMapGetter
            );

            // Start a new span for this request
            const span = this.tracer.startSpan(
                `${req.method} ${req.path}`,
                {
                    kind: opentelemetry.SpanKind.SERVER,
                    attributes: {
                        'http.method': req.method,
                        'http.url': req.url,
                        'http.target': req.path,
                        'http.host': req.hostname,
                        'http.scheme': req.protocol,
                        'http.user_agent': req.headers['user-agent'],
                        'http.request_content_length': req.headers['content-length'],
                        'net.host.name': req.hostname,
                        'net.peer.ip': this.getClientIp(req),
                        'gateway.request_id': req.id,
                        'gateway.route': req.route?.path || 'unknown',
                        'user.id': req.user?.id,
                        'tenant.id': req.tenant?.id,
                        'organization.id': req.user?.organizationId
                    }
                },
                context
            );

            // Set trace context
            const spanContext = span.spanContext();
            req.traceId = spanContext.traceId;
            req.spanId = spanContext.spanId;
            req.span = span;

            // Inject trace context into outgoing headers
            const carrier = {};
            this.propagator.inject(
                opentelemetry.trace.setSpan(context, span),
                carrier,
                opentelemetry.defaultTextMapSetter
            );

            // Add trace headers to request
            Object.keys(carrier).forEach(key => {
                req.headers[key] = carrier[key];
            });

            // Add custom trace headers
            req.headers['x-trace-id'] = req.traceId;
            req.headers['x-span-id'] = req.spanId;
            req.headers['x-parent-span-id'] = spanContext.traceFlags;

            // Set baggage
            this.setBaggage(req, span);

            // Track response
            const originalSend = res.send;
            const originalJson = res.json;
            const originalEnd = res.end;

            const endSpan = () => {
                if (span && !span.ended) {
                    // Set response attributes
                    span.setAttributes({
                        'http.status_code': res.statusCode,
                        'http.response_content_length': res.get('content-length'),
                        'http.response_content_type': res.get('content-type')
                    });

                    // Set span status based on HTTP status code
                    if (res.statusCode >= 400) {
                        span.setStatus({
                            code: opentelemetry.SpanStatusCode.ERROR,
                            message: `HTTP ${res.statusCode}`
                        });
                    } else {
                        span.setStatus({
                            code: opentelemetry.SpanStatusCode.OK
                        });
                    }

                    // Record any error
                    if (res.locals.error) {
                        span.recordException(res.locals.error);
                        span.setAttributes({
                            'error': true,
                            'error.message': res.locals.error.message,
                            'error.type': res.locals.error.name,
                            'error.stack': res.locals.error.stack
                        });
                    }

                    // End the span
                    span.end();
                }
            };

            res.send = function(...args) {
                endSpan();
                return originalSend.apply(res, args);
            };

            res.json = function(...args) {
                endSpan();
                return originalJson.apply(res, args);
            };

            res.end = function(...args) {
                endSpan();
                return originalEnd.apply(res, args);
            };

            // Add tracing headers to response
            res.setHeader('X-Trace-ID', req.traceId);
            res.setHeader('X-Span-ID', req.spanId);

            // Continue with context
            opentelemetry.context.with(
                opentelemetry.trace.setSpan(context, span),
                () => {
                    next();
                }
            );
        };
    }

    /**
     * Set baggage items
     */
    setBaggage(req, span) {
        const baggage = opentelemetry.propagation.getBaggage(opentelemetry.context.active());
        
        if (baggage) {
            // Add custom baggage items
            baggage.setEntry('user.id', { value: req.user?.id || 'anonymous' });
            baggage.setEntry('tenant.id', { value: req.tenant?.id || 'default' });
            baggage.setEntry('request.id', { value: req.id });
            baggage.setEntry('client.ip', { value: this.getClientIp(req) });
            
            // Add baggage to span attributes
            baggage.getAllEntries().forEach(([key, entry]) => {
                span.setAttribute(`baggage.${key}`, entry.value);
            });
        }
    }

    /**
     * Get client IP address
     */
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return req.connection.remoteAddress || req.ip;
    }

    /**
     * Create child span
     */
    createSpan(name, options = {}) {
        if (!this.tracer || !this.config.enabled) {
            return null;
        }

        return this.tracer.startSpan(name, {
            kind: options.kind || opentelemetry.SpanKind.INTERNAL,
            attributes: options.attributes || {}
        });
    }

    /**
     * Add event to current span
     */
    addEvent(name, attributes = {}) {
        const span = opentelemetry.trace.getActiveSpan();
        if (span) {
            span.addEvent(name, attributes);
        }
    }

    /**
     * Set attribute on current span
     */
    setAttribute(key, value) {
        const span = opentelemetry.trace.getActiveSpan();
        if (span) {
            span.setAttribute(key, value);
        }
    }

    /**
     * Record exception on current span
     */
    recordException(error) {
        const span = opentelemetry.trace.getActiveSpan();
        if (span) {
            span.recordException(error);
            span.setStatus({
                code: opentelemetry.SpanStatusCode.ERROR,
                message: error.message
            });
        }
    }

    /**
     * Get current trace ID
     */
    getCurrentTraceId() {
        const span = opentelemetry.trace.getActiveSpan();
        if (span) {
            return span.spanContext().traceId;
        }
        return null;
    }

    /**
     * Get current span ID
     */
    getCurrentSpanId() {
        const span = opentelemetry.trace.getActiveSpan();
        if (span) {
            return span.spanContext().spanId;
        }
        return null;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Cleanup handled by trace manager
    }
}

module.exports = { TracingMiddleware };