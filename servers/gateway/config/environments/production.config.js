/**
 * Production Configuration for API Gateway
 * Settings specific to production environment
 */

module.exports = {
    server: {
        port: parseInt(process.env.GATEWAY_PORT) || 443,
        host: '0.0.0.0',
        timeout: 180000,
        keepAliveTimeout: 120000,
        headersTimeout: 125000
    },

    services: {
        adminServer: {
            url: process.env.ADMIN_SERVER_URL || 'http://admin-server-service:4001',
            timeout: 60000,
            retries: 5
        },
        customerServices: {
            url: process.env.CUSTOMER_SERVICES_URL || 'http://customer-services-service:4002',
            timeout: 60000,
            retries: 5
        },
        discovery: {
            enabled: true,
            type: 'consul',
            refreshInterval: 15000,
            consul: {
                host: process.env.CONSUL_HOST || 'consul-service',
                port: parseInt(process.env.CONSUL_PORT) || 8500,
                secure: true
            }
        }
    },

    security: {
        helmet: {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            }
        },
        cors: {
            origin: process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : 
                ['https://app.insightserenity.com', 'https://admin.insightserenity.com'],
            credentials: true
        },
        ipWhitelist: {
            enabled: process.env.ENABLE_IP_WHITELIST === 'true',
            ips: process.env.WHITELISTED_IPS ? 
                process.env.WHITELISTED_IPS.split(',') : [],
            checkHeader: 'X-Real-IP'
        }
    },

    authentication: {
        jwt: {
            secret: process.env.JWT_SECRET,
            publicKey: process.env.JWT_PUBLIC_KEY,
            algorithm: 'RS256',
            expiresIn: '15m',
            refreshExpiresIn: '7d'
        }
    },

    rateLimit: {
        enabled: true,
        global: {
            windowMs: 60000,
            max: 1000
        },
        endpoints: [
            {
                path: '/api/auth/login',
                windowMs: 900000,
                max: 3
            },
            {
                path: '/api/auth/register',
                windowMs: 3600000,
                max: 2
            },
            {
                path: '/api/admin/auth/login',
                windowMs: 900000,
                max: 3
            }
        ]
    },

    cache: {
        enabled: true,
        redis: {
            host: process.env.REDIS_HOST || 'redis-cluster',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD,
            db: 0,
            keyPrefix: 'prod:gateway:',
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        },
        ttl: {
            default: 600,
            api: 120,
            static: 7200
        }
    },

    circuitBreaker: {
        enabled: true,
        timeout: 60000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        rollingCountTimeout: 20000,
        rollingCountBuckets: 20,
        volumeThreshold: 50,
        halfOpenRequests: 5
    },

    multiTenant: {
        enabled: true,
        strategy: 'subdomain',
        validation: {
            enabled: true,
            cache: true,
            cacheTtl: 600
        }
    },

    tracing: {
        enabled: true,
        serviceName: 'api-gateway-prod',
        endpoint: process.env.TRACING_ENDPOINT || 'http://jaeger-collector:4318/v1/traces',
        samplingRate: 0.1,
        exportIntervalMillis: 10000,
        exportTimeoutMillis: 30000
    },

    metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics'
    },

    logging: {
        level: process.env.LOG_LEVEL || 'warn',
        format: 'json',
        console: true,
        file: {
            enabled: true,
            filename: '/var/log/gateway/gateway.log',
            maxSize: '100m',
            maxFiles: 10,
            compress: true
        }
    },

    websocket: {
        enabled: true,
        maxPayload: 50 * 1024 * 1024
    },

    documentation: {
        enabled: false,
        requireAuth: true
    },

    admin: {
        enabled: true,
        password: process.env.ADMIN_PASSWORD
    },

    healthCheck: {
        interval: 10000,
        timeout: 3000,
        unhealthyThreshold: 3,
        healthyThreshold: 2
    },

    compression: {
        enabled: true,
        level: 9,
        threshold: '1kb'
    },

    errorHandling: {
        exposeErrors: false,
        includeStack: false
    }
};