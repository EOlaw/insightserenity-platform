/**
 * @fileoverview Routing Configuration
 * @module servers/gateway/config/routing-config
 */

module.exports = {
    // Route Definitions
    routes: [
        // Admin Service Routes
        {
            path: '/api/admin/*',
            target: process.env.ADMIN_SERVICE_URL || 'http://localhost:3000',
            service: 'admin',
            rewrite: {
                '^/api/admin': '/api'
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            rateLimit: {
                windowMs: 60000,
                max: 1000
            },
            authentication: true,
            authorization: {
                roles: ['super_admin', 'admin', 'manager']
            },
            cache: {
                enabled: false
            },
            circuitBreaker: {
                enabled: true,
                threshold: 10
            }
        },

        // Customer Service Routes
        {
            path: '/api/customers/*',
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            service: 'customer',
            rewrite: {
                '^/api/customers': '/api'
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            rateLimit: {
                windowMs: 60000,
                max: 100
            },
            authentication: true,
            authorization: {
                roles: ['user', 'admin']
            },
            cache: {
                enabled: true,
                ttl: 300,
                methods: ['GET']
            },
            headers: {
                'X-Tenant-ID': (req) => req.headers['x-tenant-id'] || req.user?.tenantId
            }
        },

        // Authentication Routes (Public)
        {
            path: '/api/auth/*',
            target: process.env.ADMIN_SERVICE_URL || 'http://localhost:3000',
            service: 'admin',
            rewrite: {
                '^/api/auth': '/api/auth'
            },
            methods: ['POST'],
            rateLimit: {
                windowMs: 60000,
                max: 5
            },
            authentication: false,
            cache: {
                enabled: false
            }
        },

        // Health Check Routes (Public)
        {
            path: '/health',
            target: null,
            handler: 'health',
            methods: ['GET'],
            authentication: false,
            rateLimit: {
                windowMs: 60000,
                max: 100
            }
        },

        // Metrics Routes (Internal)
        {
            path: '/metrics',
            target: null,
            handler: 'metrics',
            methods: ['GET'],
            authentication: true,
            authorization: {
                roles: ['admin']
            }
        },

        // WebSocket Routes
        {
            path: '/ws/*',
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            service: 'customer',
            ws: true,
            authentication: true
        },

        // Static Files
        {
            path: '/static/*',
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            service: 'customer',
            cache: {
                enabled: true,
                ttl: 86400
            },
            authentication: false
        },

        // GraphQL Route (if enabled)
        {
            path: '/graphql',
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            service: 'customer',
            methods: ['POST', 'GET'],
            authentication: true,
            graphql: true
        },

        // Default/Fallback Route
        {
            path: '/*',
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            service: 'customer',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            fallback: true,
            authentication: false
        }
    ],

    // Route Matching Configuration
    matching: {
        caseSensitive: false,
        strict: false,
        mergeParams: true
    },

    // Load Balancing Policies per Route
    loadBalancing: {
        '/api/admin/*': {
            algorithm: 'round-robin',
            sticky: false
        },
        '/api/customers/*': {
            algorithm: 'least-connections',
            sticky: true,
            cookieName: 'gateway.lb'
        }
    },

    // Route-specific Timeouts
    timeouts: {
        '/api/admin/reports/*': 120000, // 2 minutes for reports
        '/api/customers/import/*': 300000, // 5 minutes for imports
        '/api/auth/*': 10000, // 10 seconds for auth
        default: 30000 // 30 seconds default
    },

    // Route Versioning
    versioning: {
        enabled: true,
        header: 'X-API-Version',
        queryParam: 'api_version',
        default: 'v1',
        versions: {
            v1: {
                deprecated: false,
                sunset: null
            },
            v2: {
                deprecated: false,
                sunset: null,
                beta: true
            }
        }
    },

    // Route Transformation Rules
    transformations: {
        request: {
            '/api/admin/*': {
                headers: {
                    'X-Admin-Request': 'true'
                }
            },
            '/api/customers/*': {
                headers: {
                    'X-Customer-Request': 'true'
                }
            }
        },
        response: {
            '/api/*': {
                headers: {
                    'Cache-Control': 'no-cache',
                    'X-Content-Type-Options': 'nosniff'
                }
            }
        }
    },

    // Retry Policies per Route
    retryPolicies: {
        '/api/admin/*': {
            attempts: 3,
            delay: 1000,
            conditions: ['ECONNREFUSED', 'ETIMEDOUT']
        },
        '/api/customers/*': {
            attempts: 5,
            delay: 2000,
            conditions: ['ECONNREFUSED', 'ETIMEDOUT', '503']
        }
    },

    // Circuit Breaker Policies per Route
    circuitBreakerPolicies: {
        '/api/admin/*': {
            threshold: 5,
            timeout: 60000,
            resetTimeout: 30000
        },
        '/api/customers/*': {
            threshold: 10,
            timeout: 30000,
            resetTimeout: 15000
        }
    }
};
