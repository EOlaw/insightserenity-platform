/**
 * @fileoverview Request Transformer Implementation
 * @module servers/gateway/utils/request-transformer
 */

const { getLogger } = require('../../../shared/lib/utils/logger');

/**
 * Request Transformer Class
 * @class RequestTransformer
 */
class RequestTransformer {
    constructor(options = {}) {
        this.logger = getLogger({ serviceName: 'request-transformer' });
        this.removeRequestHeaders = options.removeRequestHeaders || [];
        this.removeResponseHeaders = options.removeResponseHeaders || ['x-powered-by'];
        this.addRequestHeaders = options.addRequestHeaders || {};
        this.addResponseHeaders = options.addResponseHeaders || {};
    }

    /**
     * Transform request
     */
    transformRequest(req, config = {}) {
        // Remove specified headers
        const headersToRemove = [...this.removeRequestHeaders, ...(config.removeHeaders || [])];
        headersToRemove.forEach(header => {
            delete req.headers[header.toLowerCase()];
        });

        // Add specified headers
        const headersToAdd = { ...this.addRequestHeaders, ...(config.addHeaders || {}) };
        Object.entries(headersToAdd).forEach(([key, value]) => {
            const headerValue = typeof value === 'function' ? value(req) : value;
            if (headerValue !== undefined && headerValue !== null) {
                req.headers[key.toLowerCase()] = headerValue;
            }
        });

        // Transform body if needed
        if (config.transformBody && typeof config.transformBody === 'function') {
            req.body = config.transformBody(req.body, req);
        }

        // Transform query parameters
        if (config.transformQuery && typeof config.transformQuery === 'function') {
            req.query = config.transformQuery(req.query, req);
        }

        // Transform path
        if (config.transformPath && typeof config.transformPath === 'function') {
            req.path = config.transformPath(req.path, req);
            req.url = req.path + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
        }

        return req;
    }

    /**
     * Transform response
     */
    transformResponse(res, body, config = {}) {
        // Remove specified headers
        const headersToRemove = [...this.removeResponseHeaders, ...(config.removeHeaders || [])];
        headersToRemove.forEach(header => {
            res.removeHeader(header);
        });

        // Add specified headers
        const headersToAdd = { ...this.addResponseHeaders, ...(config.addHeaders || {}) };
        Object.entries(headersToAdd).forEach(([key, value]) => {
            const headerValue = typeof value === 'function' ? value(res) : value;
            if (headerValue !== undefined && headerValue !== null) {
                res.setHeader(key, headerValue);
            }
        });

        // Transform body if needed
        if (config.transformBody && typeof config.transformBody === 'function') {
            body = config.transformBody(body, res);
        }

        return body;
    }

    /**
     * Inject data into request
     */
    injectRequestData(req, data) {
        req.gatewayData = {
            ...req.gatewayData,
            ...data,
            injectedAt: Date.now()
        };

        return req;
    }

    /**
     * Extract data from request
     */
    extractRequestData(req) {
        return {
            method: req.method,
            path: req.path,
            query: req.query,
            headers: req.headers,
            body: req.body,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            gatewayData: req.gatewayData
        };
    }

    /**
     * Rewrite URL path
     */
    rewritePath(path, rules = {}) {
        let rewrittenPath = path;

        Object.entries(rules).forEach(([pattern, replacement]) => {
            const regex = new RegExp(pattern);
            rewrittenPath = rewrittenPath.replace(regex, replacement);
        });

        return rewrittenPath;
    }

    /**
     * Add correlation headers
     */
    addCorrelationHeaders(req, res) {
        const correlationId = req.correlationId || req.headers['x-correlation-id'] || this.generateCorrelationId();
        const requestId = req.id || req.headers['x-request-id'] || this.generateRequestId();

        req.correlationId = correlationId;
        req.id = requestId;

        req.headers['x-correlation-id'] = correlationId;
        req.headers['x-request-id'] = requestId;

        res.setHeader('X-Correlation-ID', correlationId);
        res.setHeader('X-Request-ID', requestId);

        return { correlationId, requestId };
    }

    /**
     * Generate correlation ID
     */
    generateCorrelationId() {
        return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Generate request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Sanitize headers
     */
    sanitizeHeaders(headers, whitelist = []) {
        const sanitized = {};
        const allowedHeaders = [
            'content-type',
            'content-length',
            'authorization',
            'accept',
            'accept-encoding',
            'user-agent',
            'host',
            ...whitelist.map(h => h.toLowerCase())
        ];

        Object.entries(headers).forEach(([key, value]) => {
            if (allowedHeaders.includes(key.toLowerCase())) {
                sanitized[key] = value;
            }
        });

        return sanitized;
    }

    /**
     * Merge headers
     */
    mergeHeaders(target = {}, source = {}, overwrite = true) {
        const merged = { ...target };

        Object.entries(source).forEach(([key, value]) => {
            const lowerKey = key.toLowerCase();
            if (overwrite || !merged[lowerKey]) {
                merged[lowerKey] = value;
            }
        });

        return merged;
    }
}

module.exports = { RequestTransformer };
