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
            secret: 'dev-secret-key-not-for-production'
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