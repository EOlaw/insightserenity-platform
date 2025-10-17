/**
 * @fileoverview Gateway-specific Configuration
 * @module servers/gateway/config/gateway-config
 */

module.exports = {
    // API Gateway Settings
    api: {
        prefix: '/api',
        version: 'v1',
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
        maxRedirects: 5,
        compression: process.env.ENABLE_RESPONSE_COMPRESSION === 'true'
    },

    // Proxy Configuration
    proxy: {
        changeOrigin: true,
        preserveHeaderKeyCase: true,
        autoRewrite: true,
        protocolRewrite: 'http',
        cookieDomainRewrite: '',
        followRedirects: true,
        xfwd: true,
        ws: true,
        headers: {
            'X-Gateway-Version': '1.0.0',
            'X-Powered-By': 'InsightSerenity Gateway'
        }
    },

    // Request Transformation
    requestTransform: {
        enabled: true,
        removeHeaders: ['x-powered-by', 'server'],
        addHeaders: {
            'X-Gateway-Request': 'true',
            'X-Request-Start': () => Date.now().toString()
        },
        modifyBody: false,
        bodyParser: {
            json: { limit: '10mb' },
            urlencoded: { extended: true, limit: '10mb' },
            raw: { limit: '10mb' }
        }
    },

    // Response Transformation
    responseTransform: {
        enabled: true,
        removeHeaders: ['x-powered-by'],
        addHeaders: {
            'X-Gateway-Response': 'true',
            'X-Response-Time': (req, res) => `${Date.now() - req.startTime}ms`
        },
        modifyBody: false,
        compression: true
    },

    // Service Registry
    serviceRegistry: {
        refreshInterval: 60000,
        healthCheckInterval: 30000,
        services: new Map()
    },

    // API Documentation
    documentation: {
        enabled: true,
        path: '/docs',
        spec: '/openapi.json'
    },

    // Middleware Order
    middlewareOrder: [
        'requestId',
        'correlationId',
        'logging',
        'rateLimit',
        'authentication',
        'authorization',
        'validation',
        'cache',
        'proxy'
    ]
};
