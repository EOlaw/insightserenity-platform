'use strict';

/**
 * @fileoverview Routing Configuration - Route definitions and policies for the API Gateway
 * @module servers/gateway/config/routing-config
 */

/**
 * Routing configuration module provides route definitions, patterns,
 * and transformation rules for request routing.
 */
const routingConfig = {
    /**
     * Routing policies and rules
     */
    policies: {
        // Default routing strategy
        defaultStrategy: 'path-based', // 'path-based', 'header-based', 'weighted'
        
        // Route matching rules
        matching: {
            caseSensitive: false,
            strict: false,
            mergeParams: true
        },

        // Route priority (higher number = higher priority)
        priorities: {
            exact: 1000,
            prefix: 500,
            pattern: 100,
            fallback: 0
        },

        // Multi-tenant routing rules
        multiTenant: {
            enabled: true,
            strategy: 'subdomain', // 'subdomain', 'header', 'path'
            headerName: 'X-Tenant-ID',
            defaultTenant: 'default',
            isolation: {
                enabled: true,
                validateTenant: true,
                blockCrossTenant: true
            }
        },

        // Geographic routing
        geographic: {
            enabled: false,
            strategy: 'nearest', // 'nearest', 'regional', 'country'
            regions: {
                'us-east': ['us-east-1', 'us-east-2'],
                'us-west': ['us-west-1', 'us-west-2'],
                'eu': ['eu-west-1', 'eu-central-1'],
                'asia': ['ap-southeast-1', 'ap-northeast-1']
            },
            fallbackRegion: 'us-east'
        },

        // A/B testing and canary routing
        canary: {
            enabled: false,
            routes: [
                {
                    name: 'new-api-version',
                    path: '/api/v2/*',
                    percentage: 10,
                    criteria: {
                        headers: { 'X-Beta-User': 'true' }
                    }
                }
            ]
        },

        // Request routing rules
        rules: [
            // Admin routes
            {
                name: 'admin-routes',
                pattern: /^\/api\/admin\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin'],
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Route-Type': 'admin'
                    }
                }
            },
            // Customer service routes
            {
                name: 'customer-routes',
                pattern: /^\/api\/services\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin'],
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    stripPrefix: '/api/services',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'customer'
                    }
                }
            },
            // Public routes
            {
                name: 'public-auth',
                pattern: /^\/api\/auth\/(login|register|forgot-password|verify-email)/,
                target: 'customer-services',
                methods: ['POST'],
                authentication: 'none',
                rateLimit: {
                    windowMs: 900000, // 15 minutes
                    max: 5
                },
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Route-Type': 'public-auth'
                    }
                }
            },
            // WebSocket routes
            {
                name: 'websocket-routes',
                pattern: /^\/ws\/.*/,
                target: 'customer-services',
                methods: ['GET'],
                protocol: 'ws',
                authentication: 'required',
                transform: {
                    stripPrefix: '/ws',
                    addHeaders: {
                        'X-Route-Type': 'websocket'
                    }
                }
            },
            // Health check routes
            {
                name: 'health-routes',
                pattern: /^\/health.*/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                cache: false,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                }
            },
            // Metrics routes
            {
                name: 'metrics-routes',
                pattern: /^\/metrics/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'required',
                authorization: ['admin', 'monitoring'],
                cache: false
            },
            // API documentation routes
            {
                name: 'docs-routes',
                pattern: /^\/api-docs.*/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                cache: {
                    ttl: 3600
                }
            }
        ],

        // Fallback routes
        fallback: {
            enabled: true,
            routes: [
                {
                    pattern: /^\/api\/.*/,
                    response: {
                        status: 404,
                        body: {
                            error: 'Route not found',
                            message: 'The requested API endpoint does not exist'
                        }
                    }
                },
                {
                    pattern: /.*/,
                    response: {
                        status: 404,
                        body: {
                            error: 'Not found',
                            message: 'The requested resource was not found'
                        }
                    }
                }
            ]
        },

        // Route aggregation for composite requests
        aggregation: {
            enabled: true,
            endpoints: [
                {
                    path: '/api/aggregate/dashboard',
                    method: 'GET',
                    aggregate: [
                        {
                            service: 'admin-server',
                            endpoint: '/stats/overview',
                            key: 'stats'
                        },
                        {
                            service: 'customer-services',
                            endpoint: '/metrics/current',
                            key: 'metrics'
                        }
                    ],
                    timeout: 30000,
                    parallel: true
                }
            ]
        },

        // Route transformation rules
        transformation: {
            request: {
                // URL transformations
                urlRewrite: [
                    {
                        from: /^\/legacy\/(.*)$/,
                        to: '/api/v1/$1'
                    }
                ],
                // Query parameter transformations
                queryParams: {
                    rename: {
                        'limit': 'pageSize',
                        'offset': 'pageNumber'
                    },
                    defaults: {
                        'pageSize': '20',
                        'sortOrder': 'asc'
                    },
                    remove: ['debug', 'test']
                },
                // Header transformations
                headers: {
                    rename: {
                        'X-Token': 'Authorization'
                    },
                    format: {
                        'Authorization': (value) => {
                            if (!value.startsWith('Bearer ')) {
                                return `Bearer ${value}`;
                            }
                            return value;
                        }
                    }
                }
            },
            response: {
                // Response body transformations
                body: {
                    wrapResponse: true,
                    wrapper: {
                        success: true,
                        timestamp: () => new Date().toISOString(),
                        version: 'v1'
                    }
                },
                // Status code mapping
                statusCodes: {
                    204: 200, // Convert no content to OK with empty object
                }
            }
        }
    },

    /**
     * Apply routing transformations to configuration
     * @param {Object} config - Configuration object to transform
     */
    applyTransformations(config) {
        // Ensure routing configuration exists
        config.routing = config.routing || {};

        // Merge routing policies
        config.routing = {
            ...this.policies,
            ...config.routing
        };

        // Process and validate routes
        this.processRoutes(config);

        // Add dynamic routes based on services
        this.addDynamicRoutes(config);

        // Setup route caching strategies
        this.setupRouteCaching(config);
    },

    /**
     * Process and validate route configurations
     * @param {Object} config - Configuration object
     */
    processRoutes(config) {
        if (!config.routing.rules) {
            config.routing.rules = [];
        }

        // Sort routes by priority
        config.routing.rules.sort((a, b) => {
            const priorityA = this.getRoutePriority(a);
            const priorityB = this.getRoutePriority(b);
            return priorityB - priorityA;
        });

        // Validate each route
        config.routing.rules.forEach(route => {
            this.validateRoute(route);
            
            // Ensure route has required fields
            route.id = route.id || `${route.name}-${Date.now()}`;
            route.priority = route.priority || this.getRoutePriority(route);
            route.metrics = route.metrics !== false;
            route.logging = route.logging !== false;
            
            // Set default authentication if not specified
            if (route.authentication === undefined) {
                route.authentication = 'required';
            }
            
            // Set default methods if not specified
            if (!route.methods) {
                route.methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
            }
        });
    },

    /**
     * Get route priority based on pattern type
     * @param {Object} route - Route configuration
     * @returns {number} Priority value
     */
    getRoutePriority(route) {
        if (route.priority !== undefined) {
            return route.priority;
        }

        if (typeof route.pattern === 'string') {
            if (route.pattern.includes('*')) {
                return this.policies.priorities.pattern;
            }
            return this.policies.priorities.exact;
        }

        if (route.pattern instanceof RegExp) {
            return this.policies.priorities.pattern;
        }

        return this.policies.priorities.fallback;
    },

    /**
     * Validate route configuration
     * @param {Object} route - Route to validate
     * @throws {Error} If route is invalid
     */
    validateRoute(route) {
        if (!route.name) {
            throw new Error('Route must have a name');
        }

        if (!route.pattern) {
            throw new Error(`Route ${route.name} must have a pattern`);
        }

        if (!route.target) {
            throw new Error(`Route ${route.name} must have a target`);
        }

        if (route.methods) {
            const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
            route.methods.forEach(method => {
                if (!validMethods.includes(method.toUpperCase())) {
                    throw new Error(`Invalid method ${method} in route ${route.name}`);
                }
            });
        }

        if (route.rateLimit) {
            if (!route.rateLimit.windowMs || !route.rateLimit.max) {
                throw new Error(`Invalid rate limit configuration in route ${route.name}`);
            }
        }
    },

    /**
     * Add dynamic routes based on service registry
     * @param {Object} config - Configuration object
     */
    addDynamicRoutes(config) {
        if (!config.services || !config.services.registry) {
            return;
        }

        config.services.registry.forEach(service => {
            // Check if route already exists for this service
            const existingRoute = config.routing.rules.find(
                route => route.target === service.name
            );

            if (!existingRoute && service.autoRoute !== false) {
                // Create automatic route for service
                const dynamicRoute = {
                    name: `auto-${service.name}`,
                    pattern: new RegExp(`^${service.path}/.*`),
                    target: service.name,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                    authentication: service.requiresAuth ? 'required' : 'optional',
                    rateLimit: service.rateLimit,
                    priority: this.policies.priorities.prefix,
                    transform: {
                        stripPrefix: service.path,
                        addHeaders: {
                            'X-Service-Name': service.name,
                            'X-Route-Type': 'dynamic'
                        }
                    }
                };

                config.routing.rules.push(dynamicRoute);
            }
        });
    },

    /**
     * Setup route caching strategies
     * @param {Object} config - Configuration object
     */
    setupRouteCaching(config) {
        config.routing.rules.forEach(route => {
            // Skip if caching is explicitly disabled
            if (route.cache === false) {
                return;
            }

            // Setup default caching for GET requests
            if (route.methods && route.methods.includes('GET')) {
                route.cache = route.cache || {
                    enabled: true,
                    ttl: 300, // 5 minutes default
                    vary: ['Accept', 'Accept-Encoding', 'X-Tenant-ID'],
                    key: (req) => {
                        const tenant = req.headers['x-tenant-id'] || 'default';
                        return `${tenant}:${req.method}:${req.path}:${JSON.stringify(req.query)}`;
                    }
                };
            }

            // Disable caching for mutation methods
            if (route.methods && ['POST', 'PUT', 'DELETE', 'PATCH'].some(m => route.methods.includes(m))) {
                route.cache = route.cache || { enabled: false };
            }
        });
    },

    /**
     * Find matching route for request
     * @param {Object} req - Request object
     * @param {Array} routes - Array of route configurations
     * @returns {Object|null} Matching route or null
     */
    findMatchingRoute(req, routes) {
        const method = req.method.toUpperCase();
        const path = req.path;

        for (const route of routes) {
            // Check method
            if (route.methods && !route.methods.includes(method)) {
                continue;
            }

            // Check pattern
            if (typeof route.pattern === 'string') {
                if (route.pattern === path || 
                    (route.pattern.endsWith('*') && path.startsWith(route.pattern.slice(0, -1)))) {
                    return route;
                }
            } else if (route.pattern instanceof RegExp) {
                if (route.pattern.test(path)) {
                    return route;
                }
            }
        }

        return null;
    },

    /**
     * Apply route transformations to request
     * @param {Object} req - Request object
     * @param {Object} route - Route configuration
     */
    applyRouteTransformations(req, route) {
        if (!route.transform) {
            return;
        }

        const transform = route.transform;

        // Strip prefix from path
        if (transform.stripPrefix) {
            req.url = req.url.replace(transform.stripPrefix, '');
            req.path = req.path.replace(transform.stripPrefix, '');
        }

        // Add headers
        if (transform.addHeaders) {
            Object.entries(transform.addHeaders).forEach(([key, value]) => {
                req.headers[key.toLowerCase()] = typeof value === 'function' ? value(req) : value;
            });
        }

        // Remove headers
        if (transform.removeHeaders) {
            transform.removeHeaders.forEach(header => {
                delete req.headers[header.toLowerCase()];
            });
        }

        // Transform query parameters
        if (transform.queryParams) {
            if (transform.queryParams.rename) {
                Object.entries(transform.queryParams.rename).forEach(([from, to]) => {
                    if (req.query[from] !== undefined) {
                        req.query[to] = req.query[from];
                        delete req.query[from];
                    }
                });
            }

            if (transform.queryParams.defaults) {
                Object.entries(transform.queryParams.defaults).forEach(([key, value]) => {
                    if (req.query[key] === undefined) {
                        req.query[key] = value;
                    }
                });
            }
        }
    }
};

module.exports = routingConfig;