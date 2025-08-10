/**
 * Development Configuration for API Gateway
 * Settings specific to development environment
 */

module.exports = {
    server: {
        port: 3000,
        host: 'localhost'
    },

    services: {
        adminServer: {
            url: 'http://localhost:4001'
        },
        customerServices: {
            url: 'http://localhost:4002'
        }
    },

    security: {
        cors: {
            origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:8080']
        },
        ipWhitelist: {
            enabled: false
        }
    },

    authentication: {
        jwt: {
            secret: 'b78122d8977865a38989b9a46a8bc960e90573fba5e4634a8b64b054b690fa2a27ade7f60bfa0ff1455dfa7e930cf114702e1965f3a49af0f10c3f2d1818491a'
        }
    },

    rateLimit: {
        enabled: false
    },

    cache: {
        enabled: true,
        redis: {
            host: 'localhost',
            port: 6379
        }
    },

    circuitBreaker: {
        enabled: false
    },

    tracing: {
        enabled: false,
        samplingRate: 1
    },

    metrics: {
        enabled: true
    },

    logging: {
        level: 'debug',
        format: 'simple',
        file: {
            enabled: true,
            filename: 'logs/gateway-dev.log'
        }
    },

    documentation: {
        enabled: true,
        requireAuth: false
    },

    admin: {
        password: 'admin123'
    },

    errorHandling: {
        exposeErrors: true,
        includeStack: true
    }
};