/**
 * Base Configuration for API Gateway
 * Common settings across all environments
 */

module.exports = {
    server: {
        port: 3000,
        host: '0.0.0.0',
        timeout: 120000,
        keepAliveTimeout: 65000,
        headersTimeout: 66000,
        bodyLimit: '10mb',
        trustProxy: true
    },

    services: {
        adminServer: {
            url: process.env.ADMIN_SERVER_URL || 'http://admin-server:4001',
            healthPath: '/health',
            timeout: 30000,
            retries: 3,
            weight: 1
        },
        customerServices: {
            url: process.env.CUSTOMER_SERVICES_URL || 'http://customer-services:4002',
            healthPath: '/health',
            timeout: 30000,
            retries: 3,
            weight: 1
        },
        discovery: {
            enabled: false,
            type: 'static',
            refreshInterval: 30000
        }
    },

    routing: {
        rules: [
            {
                name: 'admin-auth',
                path: '/api/admin/auth',
                target: 'admin-server',
                methods: ['POST'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-platform',
                path: '/api/admin/platform',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-users',
                path: '/api/admin/users',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-organizations',
                path: '/api/admin/organizations',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-security',
                path: '/api/admin/security',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-billing',
                path: '/api/admin/billing',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-monitoring',
                path: '/api/admin/monitoring',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-support',
                path: '/api/admin/support',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'admin-reports',
                path: '/api/admin/reports',
                target: 'admin-server',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-auth',
                path: '/api/auth',
                target: 'customer-services',
                methods: ['POST'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-clients',
                path: '/api/clients',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-projects',
                path: '/api/projects',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-consultants',
                path: '/api/consultants',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-engagements',
                path: '/api/engagements',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-organizations',
                path: '/api/organizations',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-tenants',
                path: '/api/tenants',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-subscriptions',
                path: '/api/subscriptions',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-jobs',
                path: '/api/jobs',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-candidates',
                path: '/api/candidates',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-applications',
                path: '/api/applications',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-partners',
                path: '/api/partners',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'customer-analytics',
                path: '/api/analytics',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            },
            {
                name: 'default-route',
                path: '/api',
                target: 'customer-services',
                methods: ['*'],
                stripPath: false,
                preserveHostHeader: true,
                loadBalancing: 'round-robin'
            }
        ],
        defaultTarget: 'customer-services'
    },

    security: {
        helmet: {
            contentSecurityPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        },
        cors: {
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
            exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
            maxAge: 86400
        },
        ipWhitelist: {
            enabled: false,
            ips: [],
            checkHeader: 'X-Forwarded-For'
        },
        cookieSecret: process.env.COOKIE_SECRET || 'change-this-secret-in-production'
    },

    authentication: {
        enabled: true,
        jwt: {
            secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
            publicKey: process.env.JWT_PUBLIC_KEY,
            algorithm: 'HS256',
            expiresIn: '1h',
            refreshExpiresIn: '7d',
            issuer: 'insightserenity',
            audience: 'api-gateway'
        },
        excludePaths: [
            '/health',
            '/metrics',
            '/docs',
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/forgot-password',
            '/api/admin/auth/login'
        ],
        sessionStore: {
            type: 'redis',
            prefix: 'sess:',
            ttl: 3600
        }
    },

    rateLimit: {
        enabled: true,
        global: {
            windowMs: 60000,
            max: 100,
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false
        },
        endpoints: [
            {
                path: '/api/auth/login',
                windowMs: 900000,
                max: 5
            },
            {
                path: '/api/auth/register',
                windowMs: 3600000,
                max: 3
            },
            {
                path: '/api/admin/auth/login',
                windowMs: 900000,
                max: 3
            }
        ],
        store: {
            type: 'redis',
            prefix: 'rl:'
        }
    },

    cache: {
        enabled: true,
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD,
            db: 0,
            keyPrefix: 'gateway:'
        },
        ttl: {
            default: 300,
            api: 60,
            static: 3600
        },
        endpoints: [
            {
                path: '/api/analytics',
                ttl: 300
            },
            {
                path: '/api/reports',
                ttl: 600
            }
        ]
    },

    circuitBreaker: {
        enabled: true,
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 10000,
        rollingCountBuckets: 10,
        volumeThreshold: 20,
        halfOpenRequests: 3
    },

    multiTenant: {
        enabled: true,
        strategy: 'subdomain',
        headerName: 'X-Tenant-ID',
        defaultTenant: 'default',
        validation: {
            enabled: true,
            cache: true,
            cacheTtl: 300
        }
    },

    tracing: {
        enabled: true,
        serviceName: 'api-gateway',
        endpoint: process.env.TRACING_ENDPOINT || 'http://localhost:4318/v1/traces',
        samplingRate: 1,
        propagators: ['tracecontext', 'baggage'],
        exportIntervalMillis: 5000,
        exportTimeoutMillis: 10000
    },

    metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics',
        defaultLabels: {},
        buckets: [0.003, 0.03, 0.1, 0.3, 1.5, 10]
    },

    logging: {
        level: 'info',
        format: 'json',
        console: true,
        file: {
            enabled: false,
            filename: 'gateway.log',
            maxSize: '20m',
            maxFiles: 5,
            compress: true
        },
        excludePaths: ['/health', '/metrics']
    },

    websocket: {
        enabled: true,
        path: '/ws',
        perMessageDeflate: true,
        clientTracking: true,
        maxPayload: 100 * 1024 * 1024
    },

    documentation: {
        enabled: true,
        path: '/docs',
        requireAuth: false,
        swagger: {
            title: 'InsightSerenity API Gateway',
            version: '1.0.0',
            description: 'Enterprise API Gateway for InsightSerenity Platform',
            basePath: '/',
            schemes: ['https', 'http']
        }
    },

    admin: {
        enabled: true,
        path: '/admin',
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'changeme'
    },

    healthCheck: {
        interval: 30000,
        timeout: 5000,
        unhealthyThreshold: 2,
        healthyThreshold: 3
    },

    compression: {
        enabled: true,
        level: 6,
        threshold: '1kb'
    },

    transformation: {
        request: {
            enabled: true,
            headers: {
                add: {
                    'X-Gateway-Version': '1.0.0',
                    'X-Forwarded-Proto': 'https'
                },
                remove: ['X-Powered-By'],
                modify: {}
            },
            body: {
                enabled: false,
                transformations: []
            }
        },
        response: {
            enabled: true,
            headers: {
                add: {
                    'X-Gateway-Response': 'true'
                },
                remove: ['Server'],
                modify: {}
            },
            body: {
                enabled: false,
                transformations: []
            }
        }
    },

    validation: {
        enabled: true,
        request: {
            headers: true,
            body: true,
            query: true,
            params: true
        },
        schemas: {}
    },

    errorHandling: {
        exposeErrors: false,
        includeStack: false,
        customHandlers: {}
    }
};