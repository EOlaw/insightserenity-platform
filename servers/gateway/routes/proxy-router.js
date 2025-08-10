/**
 * Proxy Router
 * Handles all proxying logic for routing requests to backend services
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const CircuitBreaker = require('opossum');
const _ = require('lodash');

/**
 * Proxy Router Class
 */
class ProxyRouter {
    constructor(dependencies) {
        this.config = dependencies.config;
        this.serviceRegistry = dependencies.serviceRegistry;
        this.circuitBreaker = dependencies.circuitBreaker;
        this.cache = dependencies.cache;
        this.logger = dependencies.logger;
        this.metricsCollector = dependencies.metricsCollector;
        
        this.router = express.Router();
        this.proxies = new Map();
        this.breakers = new Map();
        this.loadBalancers = new Map();
    }

    /**
     * Initialize the proxy router
     */
    async initialize() {
        this.logger.info('Initializing Proxy Router');
        
        // Setup route handlers
        await this.setupRouteHandlers();
        
        // Setup default proxy
        this.setupDefaultProxy();
        
        // Start monitoring
        this.startMonitoring();
        
        this.logger.info('Proxy Router initialized');
    }

    /**
     * Setup route handlers based on configuration
     */
    async setupRouteHandlers() {
        const routes = this.config.get('routing.rules', []);
        
        for (const route of routes) {
            await this.setupRoute(route);
        }
    }

    /**
     * Setup individual route
     */
    async setupRoute(route) {
        this.logger.debug(`Setting up route: ${route.name}`, route);
        
        // Get target service configuration
        const targetService = await this.getTargetService(route.target);
        if (!targetService) {
            this.logger.error(`Target service not found: ${route.target}`);
            return;
        }
        
        // Create circuit breaker for this route
        const breaker = this.createCircuitBreaker(route);
        this.breakers.set(route.name, breaker);
        
        // Create load balancer for this route
        const loadBalancer = this.createLoadBalancer(route, targetService);
        this.loadBalancers.set(route.name, loadBalancer);
        
        // Create proxy middleware
        const proxyMiddleware = this.createProxyMiddleware(route, targetService, breaker, loadBalancer);
        this.proxies.set(route.name, proxyMiddleware);
        
        // Setup route handler
        const methods = route.methods || ['*'];
        const routePath = route.path;
        
        if (methods.includes('*')) {
            this.router.all(routePath, this.createRouteHandler(route, proxyMiddleware));
        } else {
            for (const method of methods) {
                this.router[method.toLowerCase()](routePath, this.createRouteHandler(route, proxyMiddleware));
            }
        }
        
        this.logger.info(`Route configured: ${route.name} [${methods.join(',')}] ${routePath} -> ${route.target}`);
    }

    /**
     * Get target service configuration
     */
    async getTargetService(serviceName) {
        const service = await this.serviceRegistry.getService(serviceName);
        if (!service) {
            // Fallback to static configuration
            const serviceConfig = this.config.get(`services.${this.normalizeServiceName(serviceName)}`);
            if (serviceConfig) {
                return {
                    instances: [{
                        url: serviceConfig.url,
                        weight: serviceConfig.weight || 1,
                        healthy: true
                    }],
                    ...serviceConfig
                };
            }
        }
        return service;
    }

    /**
     * Normalize service name for configuration lookup
     */
    normalizeServiceName(serviceName) {
        return serviceName.replace(/-/g, '').replace('server', 'Server').replace('services', 'Services');
    }

    /**
     * Create circuit breaker for route
     */
    createCircuitBreaker(route) {
        const options = {
            timeout: route.timeout || this.config.get('circuitBreaker.timeout'),
            errorThresholdPercentage: this.config.get('circuitBreaker.errorThresholdPercentage'),
            resetTimeout: this.config.get('circuitBreaker.resetTimeout'),
            rollingCountTimeout: this.config.get('circuitBreaker.rollingCountTimeout'),
            rollingCountBuckets: this.config.get('circuitBreaker.rollingCountBuckets'),
            volumeThreshold: this.config.get('circuitBreaker.volumeThreshold'),
            halfOpen: this.config.get('circuitBreaker.halfOpenRequests'),
            name: route.name
        };
        
        const breaker = new CircuitBreaker(this.proxyRequest.bind(this), options);
        
        // Setup circuit breaker events
        breaker.on('open', () => {
            this.logger.warn(`Circuit breaker opened for route: ${route.name}`);
            this.metricsCollector.incrementCounter('circuit_breaker_open', { route: route.name });
        });
        
        breaker.on('halfOpen', () => {
            this.logger.info(`Circuit breaker half-open for route: ${route.name}`);
        });
        
        breaker.on('close', () => {
            this.logger.info(`Circuit breaker closed for route: ${route.name}`);
            this.metricsCollector.incrementCounter('circuit_breaker_close', { route: route.name });
        });
        
        breaker.on('timeout', () => {
            this.metricsCollector.incrementCounter('circuit_breaker_timeout', { route: route.name });
        });
        
        breaker.on('reject', () => {
            this.metricsCollector.incrementCounter('circuit_breaker_reject', { route: route.name });
        });
        
        breaker.on('success', (elapsed) => {
            this.metricsCollector.observeHistogram('circuit_breaker_success_duration', elapsed, { route: route.name });
        });
        
        breaker.on('failure', () => {
            this.metricsCollector.incrementCounter('circuit_breaker_failure', { route: route.name });
        });
        
        return breaker;
    }

    /**
     * Create load balancer for route
     */
    createLoadBalancer(route, targetService) {
        const strategy = route.loadBalancing || 'round-robin';
        
        return new LoadBalancer(strategy, targetService.instances);
    }

    /**
     * Create proxy middleware for route
     */
    createProxyMiddleware(route, targetService, breaker, loadBalancer) {
        const options = {
            target: targetService.instances[0].url,
            changeOrigin: true,
            ws: route.websocket || false,
            pathRewrite: route.stripPath ? { [`^${route.path}`]: '' } : undefined,
            preserveHeaderKeyCase: true,
            xfwd: true,
            secure: process.env.NODE_ENV === 'production',
            logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
            timeout: route.timeout || targetService.timeout || 30000,
            proxyTimeout: route.timeout || targetService.timeout || 30000,
            
            // Custom router function for load balancing
            router: (req) => {
                const instance = loadBalancer.getNextInstance();
                if (!instance) {
                    throw new Error('No healthy instances available');
                }
                return instance.url;
            },
            
            // Request interceptor
            onProxyReq: (proxyReq, req, res) => {
                // Add custom headers
                proxyReq.setHeader('X-Forwarded-Host', req.hostname);
                proxyReq.setHeader('X-Original-URI', req.originalUrl);
                proxyReq.setHeader('X-Request-ID', req.id);
                proxyReq.setHeader('X-Gateway-Route', route.name);
                
                // Add tenant header if available
                if (req.tenant) {
                    proxyReq.setHeader('X-Tenant-ID', req.tenant.id);
                    proxyReq.setHeader('X-Tenant-Domain', req.tenant.domain);
                }
                
                // Add trace headers
                if (req.traceId) {
                    proxyReq.setHeader('X-Trace-ID', req.traceId);
                    proxyReq.setHeader('X-Span-ID', req.spanId);
                }
                
                // Log the proxy request
                this.logger.debug('Proxying request', {
                    requestId: req.id,
                    route: route.name,
                    method: req.method,
                    path: req.path,
                    target: proxyReq.getHeader('host')
                });
                
                // Metrics
                this.metricsCollector.incrementCounter('proxy_requests_total', {
                    route: route.name,
                    method: req.method,
                    target: route.target
                });
            },
            
            // Response interceptor
            onProxyRes: (proxyRes, req, res) => {
                // Add response headers
                proxyRes.headers['X-Proxy-Route'] = route.name;
                proxyRes.headers['X-Request-ID'] = req.id;
                
                // Log the proxy response
                this.logger.debug('Proxy response received', {
                    requestId: req.id,
                    route: route.name,
                    statusCode: proxyRes.statusCode
                });
                
                // Metrics
                this.metricsCollector.incrementCounter('proxy_responses_total', {
                    route: route.name,
                    method: req.method,
                    status: proxyRes.statusCode,
                    target: route.target
                });
            },
            
            // Error handler
            onError: (err, req, res) => {
                this.logger.error('Proxy error', {
                    requestId: req.id,
                    route: route.name,
                    error: err.message,
                    stack: err.stack
                });
                
                // Metrics
                this.metricsCollector.incrementCounter('proxy_errors_total', {
                    route: route.name,
                    method: req.method,
                    error: err.code || 'unknown'
                });
                
                // Send error response if not already sent
                if (!res.headersSent) {
                    res.status(502).json({
                        error: 'Bad Gateway',
                        message: 'Error communicating with upstream service',
                        requestId: req.id,
                        route: route.name
                    });
                }
            }
        };
        
        return createProxyMiddleware(options);
    }

    /**
     * Create route handler with circuit breaker
     */
    createRouteHandler(route, proxyMiddleware) {
        return async (req, res, next) => {
            const breaker = this.breakers.get(route.name);
            
            // Check circuit breaker state
            if (breaker && breaker.opened) {
                this.logger.warn('Circuit breaker is open', {
                    requestId: req.id,
                    route: route.name
                });
                
                return res.status(503).json({
                    error: 'Service Unavailable',
                    message: 'Service temporarily unavailable, please try again later',
                    requestId: req.id,
                    route: route.name
                });
            }
            
            // Check cache if applicable
            if (this.shouldCache(req, route)) {
                const cachedResponse = await this.getCachedResponse(req, route);
                if (cachedResponse) {
                    this.logger.debug('Serving cached response', {
                        requestId: req.id,
                        route: route.name
                    });
                    
                    this.metricsCollector.incrementCounter('cache_hits_total', {
                        route: route.name
                    });
                    
                    return res.json(cachedResponse);
                }
            }
            
            // Execute with circuit breaker
            if (breaker) {
                try {
                    await breaker.fire(req, res, next, proxyMiddleware);
                } catch (error) {
                    if (error.message === 'Breaker is open') {
                        return res.status(503).json({
                            error: 'Service Unavailable',
                            message: 'Service circuit breaker is open',
                            requestId: req.id,
                            route: route.name
                        });
                    }
                    throw error;
                }
            } else {
                // Direct proxy without circuit breaker
                proxyMiddleware(req, res, next);
            }
        };
    }

    /**
     * Proxy request function for circuit breaker
     */
    proxyRequest(req, res, next, proxyMiddleware) {
        return new Promise((resolve, reject) => {
            const originalEnd = res.end;
            const originalWrite = res.write;
            
            // Override response methods to capture completion
            res.end = function(...args) {
                originalEnd.apply(res, args);
                if (res.statusCode >= 200 && res.statusCode < 500) {
                    resolve();
                } else {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                }
            };
            
            res.write = function(...args) {
                return originalWrite.apply(res, args);
            };
            
            // Execute proxy
            proxyMiddleware(req, res, (error) => {
                if (error) {
                    reject(error);
                } else {
                    next();
                }
            });
        });
    }

    /**
     * Check if request should be cached
     */
    shouldCache(req, route) {
        if (!this.config.get('cache.enabled')) {
            return false;
        }
        
        if (req.method !== 'GET') {
            return false;
        }
        
        const cacheEndpoints = this.config.get('cache.endpoints', []);
        return cacheEndpoints.some(endpoint => req.path.startsWith(endpoint.path));
    }

    /**
     * Get cached response
     */
    async getCachedResponse(req, route) {
        const cacheKey = this.generateCacheKey(req, route);
        return await this.cache.get(cacheKey);
    }

    /**
     * Generate cache key
     */
    generateCacheKey(req, route) {
        const tenant = req.tenant ? req.tenant.id : 'default';
        const query = JSON.stringify(req.query);
        return `proxy:${route.name}:${tenant}:${req.path}:${query}`;
    }

    /**
     * Setup default proxy for unmatched routes
     */
    setupDefaultProxy() {
        const defaultTarget = this.config.get('routing.defaultTarget');
        if (!defaultTarget) {
            return;
        }
        
        this.router.use('*', async (req, res, next) => {
            const targetService = await this.getTargetService(defaultTarget);
            if (!targetService) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Route not configured',
                    requestId: req.id
                });
            }
            
            const proxyMiddleware = createProxyMiddleware({
                target: targetService.instances[0].url,
                changeOrigin: true,
                logLevel: 'warn'
            });
            
            proxyMiddleware(req, res, next);
        });
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        setInterval(() => {
            this.reportMetrics();
        }, 30000);
    }

    /**
     * Report metrics
     */
    reportMetrics() {
        for (const [name, breaker] of this.breakers) {
            const stats = breaker.stats;
            this.metricsCollector.registerGauge(`circuit_breaker_state`, 
                breaker.opened ? 1 : 0, 
                { route: name }
            );
        }
    }

    /**
     * Get router instance
     */
    getRouter() {
        return this.router;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.logger.info('Cleaning up Proxy Router');
        
        // Close all circuit breakers
        for (const [name, breaker] of this.breakers) {
            breaker.shutdown();
        }
        
        this.breakers.clear();
        this.proxies.clear();
        this.loadBalancers.clear();
    }
}

/**
 * Load Balancer Class
 */
class LoadBalancer {
    constructor(strategy, instances) {
        this.strategy = strategy;
        this.instances = instances;
        this.currentIndex = 0;
        this.connections = new Map();
    }

    /**
     * Get next instance based on strategy
     */
    getNextInstance() {
        const healthyInstances = this.instances.filter(i => i.healthy !== false);
        
        if (healthyInstances.length === 0) {
            return null;
        }
        
        switch (this.strategy) {
            case 'round-robin':
                return this.roundRobin(healthyInstances);
            case 'least-connections':
                return this.leastConnections(healthyInstances);
            case 'random':
                return this.random(healthyInstances);
            case 'weighted':
                return this.weighted(healthyInstances);
            default:
                return healthyInstances[0];
        }
    }

    /**
     * Round-robin load balancing
     */
    roundRobin(instances) {
        const instance = instances[this.currentIndex % instances.length];
        this.currentIndex++;
        return instance;
    }

    /**
     * Least connections load balancing
     */
    leastConnections(instances) {
        let minConnections = Infinity;
        let selectedInstance = instances[0];
        
        for (const instance of instances) {
            const connections = this.connections.get(instance.url) || 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }

    /**
     * Random load balancing
     */
    random(instances) {
        const index = Math.floor(Math.random() * instances.length);
        return instances[index];
    }

    /**
     * Weighted load balancing
     */
    weighted(instances) {
        const totalWeight = instances.reduce((sum, i) => sum + (i.weight || 1), 0);
        let random = Math.random() * totalWeight;
        
        for (const instance of instances) {
            random -= (instance.weight || 1);
            if (random <= 0) {
                return instance;
            }
        }
        
        return instances[instances.length - 1];
    }

    /**
     * Track connection
     */
    trackConnection(instanceUrl) {
        const current = this.connections.get(instanceUrl) || 0;
        this.connections.set(instanceUrl, current + 1);
    }

    /**
     * Release connection
     */
    releaseConnection(instanceUrl) {
        const current = this.connections.get(instanceUrl) || 0;
        this.connections.set(instanceUrl, Math.max(0, current - 1));
    }
}

module.exports = { ProxyRouter, LoadBalancer };