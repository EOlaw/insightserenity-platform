'use strict';

/**
 * @fileoverview Proxy Routes - Dynamic request proxying and service routing
 * @module servers/gateway/routes/proxy-routes
 * @requires express
 * @requires http-proxy-middleware
 * @requires url
 * @requires querystring
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { URL } = require('url');
const querystring = require('querystring');
const router = express.Router();

/**
 * ProxyRoutes class handles dynamic request proxying to backend services.
 * It implements intelligent routing, request/response transformation, protocol
 * translation, WebSocket support, streaming, and comprehensive error handling.
 * The proxy supports multi-tenant isolation, service discovery, load balancing,
 * and circuit breaking.
 */
class ProxyRoutes {
    /**
     * Creates an instance of ProxyRoutes
     * @constructor
     * @param {Object} serviceRegistry - Service registry for service discovery
     * @param {Object} routingMiddleware - Request routing middleware
     * @param {Object} authMiddleware - Authentication middleware
     * @param {Object} rateLimitMiddleware - Rate limiting middleware
     * @param {Object} tenantMiddleware - Tenant isolation middleware
     * @param {Object} tracingMiddleware - Distributed tracing middleware
     * @param {Object} cacheManager - Cache manager
     * @param {Object} circuitBreakerManager - Circuit breaker manager
     * @param {Object} metricsCollector - Metrics collector
     * @param {Object} logger - Logger instance
     */
    constructor(
        serviceRegistry,
        routingMiddleware,
        authMiddleware,
        rateLimitMiddleware,
        tenantMiddleware,
        tracingMiddleware,
        cacheManager,
        circuitBreakerManager,
        metricsCollector,
        logger
    ) {
        this.serviceRegistry = serviceRegistry;
        this.routingMiddleware = routingMiddleware;
        this.authMiddleware = authMiddleware;
        this.rateLimitMiddleware = rateLimitMiddleware;
        this.tenantMiddleware = tenantMiddleware;
        this.tracingMiddleware = tracingMiddleware;
        this.cacheManager = cacheManager;
        this.circuitBreakerManager = circuitBreakerManager;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
        
        // Proxy configurations per service
        this.proxyConfigs = new Map();
        
        // Active proxy instances
        this.proxyInstances = new Map();
        
        // WebSocket connections
        this.wsConnections = new Map();
        
        // Request transformers
        this.requestTransformers = new Map();
        this.responseTransformers = new Map();
        
        // Protocol handlers
        this.protocolHandlers = {
            'http': this.handleHttpProxy.bind(this),
            'https': this.handleHttpProxy.bind(this),
            'ws': this.handleWebSocketProxy.bind(this),
            'wss': this.handleWebSocketProxy.bind(this),
            'grpc': this.handleGrpcProxy.bind(this),
            'graphql': this.handleGraphQLProxy.bind(this)
        };
        
        // Default proxy configuration
        this.defaultConfig = {
            changeOrigin: true,
            followRedirects: true,
            preserveHeaderKeyCase: true,
            xfwd: true,
            secure: false,
            timeout: 30000,
            proxyTimeout: 30000,
            ws: true,
            logLevel: 'warn',
            cookieDomainRewrite: '',
            cookiePathRewrite: '',
            headers: {
                'X-Forwarded-By': 'API-Gateway'
            }
        };
        
        // Retry configuration
        this.retryConfig = {
            retries: 3,
            retryDelay: 1000,
            retryCondition: (error) => {
                return error.code === 'ECONNRESET' || 
                       error.code === 'ETIMEDOUT' ||
                       error.code === 'ECONNREFUSED';
            }
        };
        
        // Statistics
        this.statistics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            timedOutRequests: 0,
            byService: {},
            byProtocol: {},
            averageLatency: 0,
            activeConnections: 0,
            websocketConnections: 0
        };
        
        // Initialize routes
        this.initializeRoutes();
    }

    /**
     * Initializes proxy routes
     * @private
     */
    initializeRoutes() {
        // Setup catch-all proxy route
        this.setupCatchAllProxy();
        
        // Setup service-specific routes
        this.setupServiceProxies();
        
        // Setup WebSocket routes
        this.setupWebSocketProxies();
        
        // Setup GraphQL routes
        this.setupGraphQLProxy();
        
        // Setup gRPC-Web routes
        this.setupGrpcWebProxy();
        
        // Setup static file proxying
        this.setupStaticFileProxy();
        
        // Setup API versioning routes
        this.setupVersionedProxies();
    }

    /**
     * Sets up catch-all proxy route
     * @private
     */
    setupCatchAllProxy() {
        /**
         * ALL /*
         * Catch-all proxy route for dynamic service routing
         */
        router.all('/*', 
            // Apply middleware chain
            this.applyMiddlewareChain(),
            
            // Main proxy handler
            async (req, res, next) => {
                const startTime = Date.now();
                this.statistics.totalRequests++;
                this.statistics.activeConnections++;
                
                try {
                    // Determine target service
                    const routingDecision = await this.routingMiddleware.route(req);
                    
                    if (!routingDecision || !routingDecision.instance) {
                        throw new Error('No service available for this request');
                    }
                    
                    // Check circuit breaker
                    const breaker = this.circuitBreakerManager.getBreaker(routingDecision.service);
                    if (breaker && breaker.opened) {
                        return this.handleCircuitBreakerOpen(req, res, routingDecision.service);
                    }
                    
                    // Check cache for GET requests
                    if (req.method === 'GET' && this.shouldCache(req)) {
                        const cached = await this.getCachedResponse(req);
                        if (cached) {
                            this.statistics.successfulRequests++;
                            return res.status(cached.status).json(cached.body);
                        }
                    }
                    
                    // Create proxy configuration
                    const proxyConfig = this.createProxyConfig(routingDecision, req);
                    
                    // Get or create proxy instance
                    const proxy = this.getOrCreateProxy(routingDecision.service, proxyConfig);
                    
                    // Apply request transformations
                    await this.applyRequestTransformations(req, routingDecision);
                    
                    // Set up response handling
                    this.setupResponseHandling(req, res, routingDecision, startTime);
                    
                    // Execute proxy
                    proxy(req, res, next);
                    
                } catch (error) {
                    this.statistics.failedRequests++;
                    this.statistics.activeConnections--;
                    
                    this.handleProxyError(error, req, res, startTime);
                }
            }
        );
    }

    /**
     * Sets up service-specific proxy routes
     * @private
     */
    setupServiceProxies() {
        // Get all registered services
        const services = this.serviceRegistry.getAllServices();
        
        services.forEach(service => {
            if (service.path) {
                const proxyConfig = this.createServiceProxyConfig(service);
                const proxy = createProxyMiddleware(service.path, proxyConfig);
                
                // Store proxy instance
                this.proxyInstances.set(service.name, proxy);
                
                // Apply route
                router.use(service.path, 
                    this.applyMiddlewareChain(),
                    proxy
                );
                
                this.log('info', `Proxy route created for service: ${service.name} at ${service.path}`);
            }
        });
    }

    /**
     * Sets up WebSocket proxy routes
     * @private
     */
    setupWebSocketProxies() {
        /**
         * WebSocket upgrade handler
         */
        router.ws('/*', 
            async (ws, req) => {
                const connectionId = this.generateConnectionId();
                this.statistics.websocketConnections++;
                
                try {
                    // Determine target service
                    const routingDecision = await this.routingMiddleware.route(req);
                    
                    if (!routingDecision || !routingDecision.instance) {
                        ws.close(1001, 'No service available');
                        return;
                    }
                    
                    // Create WebSocket proxy
                    const targetUrl = new URL(routingDecision.instance.url);
                    targetUrl.protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
                    targetUrl.pathname = req.url;
                    
                    // Connect to target
                    const WebSocket = require('ws');
                    const targetWs = new WebSocket(targetUrl.toString(), {
                        headers: this.createProxyHeaders(req)
                    });
                    
                    // Store connection
                    this.wsConnections.set(connectionId, {
                        client: ws,
                        target: targetWs,
                        service: routingDecision.service,
                        startTime: Date.now()
                    });
                    
                    // Setup bidirectional message forwarding
                    this.setupWebSocketProxy(ws, targetWs, connectionId);
                    
                } catch (error) {
                    this.log('error', 'WebSocket proxy error', error);
                    ws.close(1001, 'Proxy error');
                    this.statistics.websocketConnections--;
                }
            }
        );
    }

    /**
     * Sets up GraphQL proxy
     * @private
     */
    setupGraphQLProxy() {
        /**
         * POST /graphql
         * GraphQL endpoint with intelligent query routing
         */
        router.post('/graphql',
            this.applyMiddlewareChain(),
            async (req, res, next) => {
                try {
                    const { query, variables, operationName } = req.body;
                    
                    // Parse GraphQL query to determine required services
                    const requiredServices = this.parseGraphQLQuery(query);
                    
                    // Check if query requires federation
                    if (requiredServices.length > 1) {
                        return this.handleFederatedGraphQL(req, res, requiredServices);
                    }
                    
                    // Single service GraphQL query
                    const service = requiredServices[0] || 'graphql-service';
                    const routingDecision = await this.routingMiddleware.route(req, {
                        targetService: service
                    });
                    
                    // Create proxy configuration
                    const proxyConfig = {
                        ...this.defaultConfig,
                        target: routingDecision.instance.url,
                        pathRewrite: { '^/graphql': routingDecision.instance.graphqlPath || '/graphql' }
                    };
                    
                    // Execute proxy
                    const proxy = createProxyMiddleware(proxyConfig);
                    proxy(req, res, next);
                    
                } catch (error) {
                    this.handleProxyError(error, req, res);
                }
            }
        );
    }

    /**
     * Sets up gRPC-Web proxy
     * @private
     */
    setupGrpcWebProxy() {
        /**
         * POST /grpc/*
         * gRPC-Web to gRPC proxy
         */
        router.all('/grpc/*',
            this.applyMiddlewareChain(),
            async (req, res, next) => {
                try {
                    // Extract service and method from path
                    const [, , serviceName, methodName] = req.path.split('/');
                    
                    // Route to appropriate gRPC service
                    const routingDecision = await this.routingMiddleware.route(req, {
                        targetService: `grpc-${serviceName}`
                    });
                    
                    // Handle gRPC-Web to gRPC translation
                    await this.handleGrpcWebRequest(req, res, routingDecision);
                    
                } catch (error) {
                    this.handleProxyError(error, req, res);
                }
            }
        );
    }

    /**
     * Sets up static file proxy
     * @private
     */
    setupStaticFileProxy() {
        /**
         * GET /static/*
         * Static file serving with CDN support
         */
        router.get('/static/*',
            async (req, res, next) => {
                try {
                    // Determine CDN or origin
                    const cdnEnabled = this.shouldUseCDN(req);
                    const target = cdnEnabled ? 
                        process.env.CDN_URL : 
                        process.env.STATIC_ORIGIN_URL;
                    
                    const proxyConfig = {
                        ...this.defaultConfig,
                        target,
                        changeOrigin: true,
                        onProxyRes: (proxyRes, req, res) => {
                            // Add cache headers
                            proxyRes.headers['cache-control'] = 'public, max-age=31536000';
                            proxyRes.headers['x-cache'] = cdnEnabled ? 'CDN' : 'ORIGIN';
                        }
                    };
                    
                    const proxy = createProxyMiddleware(proxyConfig);
                    proxy(req, res, next);
                    
                } catch (error) {
                    this.handleProxyError(error, req, res);
                }
            }
        );
    }

    /**
     * Sets up versioned API proxies
     * @private
     */
    setupVersionedProxies() {
        const versions = ['v1', 'v2', 'v3'];
        
        versions.forEach(version => {
            router.all(`/api/${version}/*`,
                this.applyMiddlewareChain(),
                async (req, res, next) => {
                    try {
                        // Route based on version
                        const routingDecision = await this.routingMiddleware.route(req, {
                            apiVersion: version
                        });
                        
                        // Version-specific transformations
                        if (version === 'v1') {
                            req = this.applyV1Transformations(req);
                        }
                        
                        // Create proxy
                        const proxyConfig = this.createProxyConfig(routingDecision, req);
                        const proxy = createProxyMiddleware(proxyConfig);
                        
                        proxy(req, res, next);
                        
                    } catch (error) {
                        this.handleProxyError(error, req, res);
                    }
                }
            );
        });
    }

    /**
     * Creates proxy configuration for a routing decision
     * @private
     * @param {Object} routingDecision - Routing decision
     * @param {Object} req - Request object
     * @returns {Object} Proxy configuration
     */
    createProxyConfig(routingDecision, req) {
        const target = routingDecision.instance.url;
        
        return {
            ...this.defaultConfig,
            target,
            
            // Path rewriting
            pathRewrite: (path, req) => {
                return this.rewritePath(path, routingDecision, req);
            },
            
            // Request transformation
            onProxyReq: (proxyReq, req, res) => {
                this.onProxyRequest(proxyReq, req, res, routingDecision);
            },
            
            // Response transformation
            onProxyRes: async (proxyRes, req, res) => {
                await this.onProxyResponse(proxyRes, req, res, routingDecision);
            },
            
            // Error handling
            onError: (err, req, res) => {
                this.onProxyError(err, req, res, routingDecision);
            },
            
            // WebSocket upgrade
            onProxyReqWs: (proxyReq, req, socket, head) => {
                this.onProxyWebSocketRequest(proxyReq, req, socket, head, routingDecision);
            }
        };
    }

    /**
     * Creates service-specific proxy configuration
     * @private
     * @param {Object} service - Service configuration
     * @returns {Object} Proxy configuration
     */
    createServiceProxyConfig(service) {
        return {
            ...this.defaultConfig,
            target: service.url,
            changeOrigin: true,
            pathRewrite: service.pathRewrite || {},
            headers: {
                ...this.defaultConfig.headers,
                'X-Service-Name': service.name,
                'X-Service-Version': service.version || '1.0.0'
            },
            
            // Load balancing
            router: async (req) => {
                const instance = await this.selectServiceInstance(service);
                return instance.url;
            },
            
            // Circuit breaker integration
            onError: (err, req, res) => {
                this.circuitBreakerManager.recordError(service.name);
                this.onProxyError(err, req, res, { service: service.name });
            },
            
            onProxyRes: (proxyRes, req, res) => {
                if (proxyRes.statusCode >= 500) {
                    this.circuitBreakerManager.recordError(service.name);
                } else {
                    this.circuitBreakerManager.recordSuccess(service.name);
                }
            }
        };
    }

    /**
     * Handles HTTP/HTTPS proxy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async handleHttpProxy(req, res, routingDecision) {
        const proxyConfig = this.createProxyConfig(routingDecision, req);
        const proxy = createProxyMiddleware(proxyConfig);
        
        return new Promise((resolve, reject) => {
            proxy(req, res, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    /**
     * Handles WebSocket proxy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async handleWebSocketProxy(req, res, routingDecision) {
        // WebSocket handling is done in setupWebSocketProxies
        // This is a placeholder for protocol handler consistency
    }

    /**
     * Handles gRPC proxy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async handleGrpcProxy(req, res, routingDecision) {
        // Implement gRPC proxying logic
        // This would typically use grpc-node or @grpc/grpc-js
        
        const grpcClient = this.getGrpcClient(routingDecision.service);
        
        // Forward gRPC call
        const method = this.extractGrpcMethod(req);
        const message = req.body;
        
        try {
            const response = await grpcClient[method](message);
            res.json(response);
        } catch (error) {
            this.handleGrpcError(error, res);
        }
    }

    /**
     * Handles GraphQL proxy with federation support
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async handleGraphQLProxy(req, res, routingDecision) {
        // GraphQL-specific handling is in setupGraphQLProxy
        // This is for the protocol handler pattern
    }

    /**
     * Handles federated GraphQL queries
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Array} services - Required services
     */
    async handleFederatedGraphQL(req, res, services) {
        const { query, variables } = req.body;
        
        try {
            // Split query by service
            const subQueries = this.splitGraphQLQuery(query, services);
            
            // Execute sub-queries in parallel
            const promises = subQueries.map(async ({ service, subQuery }) => {
                const routingDecision = await this.routingMiddleware.route(req, {
                    targetService: service
                });
                
                const response = await this.executeGraphQLQuery(
                    routingDecision.instance.url,
                    subQuery,
                    variables
                );
                
                return { service, response };
            });
            
            const results = await Promise.all(promises);
            
            // Merge results
            const mergedResponse = this.mergeGraphQLResponses(results);
            
            res.json(mergedResponse);
            
        } catch (error) {
            res.status(500).json({
                errors: [{
                    message: 'Federation error',
                    extensions: { code: 'FEDERATION_ERROR' }
                }]
            });
        }
    }

    /**
     * Handles gRPC-Web requests
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async handleGrpcWebRequest(req, res, routingDecision) {
        // Convert gRPC-Web to gRPC
        const grpcMessage = this.grpcWebToGrpc(req.body);
        
        // Forward to gRPC service
        const grpcResponse = await this.forwardToGrpcService(
            routingDecision.instance.url,
            req.path,
            grpcMessage
        );
        
        // Convert response back to gRPC-Web
        const grpcWebResponse = this.grpcToGrpcWeb(grpcResponse);
        
        // Set appropriate headers
        res.set({
            'Content-Type': 'application/grpc-web+proto',
            'X-Grpc-Web': '1'
        });
        
        res.send(grpcWebResponse);
    }

    /**
     * Proxy request handler
     * @private
     * @param {Object} proxyReq - Proxy request
     * @param {Object} req - Original request
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    onProxyRequest(proxyReq, req, res, routingDecision) {
        // Add tracing headers
        if (req.traceContext) {
            proxyReq.setHeader('X-Trace-Id', req.traceContext.traceId);
            proxyReq.setHeader('X-Span-Id', req.traceContext.spanId);
            proxyReq.setHeader('X-Parent-Span-Id', req.traceContext.parentSpanId);
        }
        
        // Add tenant context
        if (req.tenant) {
            proxyReq.setHeader('X-Tenant-Id', req.tenant.id);
            proxyReq.setHeader('X-Tenant-Realm', req.tenant.realm || 'default');
        }
        
        // Add routing metadata
        proxyReq.setHeader('X-Forwarded-Service', routingDecision.service);
        proxyReq.setHeader('X-Forwarded-Instance', routingDecision.instance.id);
        proxyReq.setHeader('X-Gateway-Time', Date.now().toString());
        
        // Fix body for POST/PUT/PATCH requests
        if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }
        
        // Apply request transformations
        const transformer = this.requestTransformers.get(routingDecision.service);
        if (transformer) {
            transformer(proxyReq, req);
        }
    }

    /**
     * Proxy response handler
     * @private
     * @async
     * @param {Object} proxyRes - Proxy response
     * @param {Object} req - Original request
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    async onProxyResponse(proxyRes, req, res, routingDecision) {
        // Add response headers
        proxyRes.headers['X-Served-By'] = routingDecision.instance.id;
        proxyRes.headers['X-Response-Time'] = `${Date.now() - req.startTime}ms`;
        
        // Record metrics
        this.recordProxyMetrics(req, proxyRes, routingDecision);
        
        // Cache successful GET responses
        if (req.method === 'GET' && 
            proxyRes.statusCode === 200 && 
            this.shouldCache(req)) {
            await this.cacheResponse(req, proxyRes);
        }
        
        // Apply response transformations
        const transformer = this.responseTransformers.get(routingDecision.service);
        if (transformer) {
            await transformer(proxyRes, req, res);
        }
        
        // Handle circuit breaker
        if (proxyRes.statusCode >= 500) {
            this.circuitBreakerManager.recordError(routingDecision.service);
        } else {
            this.circuitBreakerManager.recordSuccess(routingDecision.service);
        }
        
        this.statistics.successfulRequests++;
        this.statistics.activeConnections--;
    }

    /**
     * Proxy error handler
     * @private
     * @param {Error} err - Error object
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} routingDecision - Routing decision
     */
    onProxyError(err, req, res, routingDecision) {
        this.statistics.failedRequests++;
        this.statistics.activeConnections--;
        
        this.log('error', 'Proxy error', {
            error: err.message,
            service: routingDecision?.service,
            path: req.path,
            method: req.method
        });
        
        // Record circuit breaker error
        if (routingDecision?.service) {
            this.circuitBreakerManager.recordError(routingDecision.service);
        }
        
        // Check if we should retry
        if (this.shouldRetry(err, req)) {
            return this.retryRequest(req, res, routingDecision);
        }
        
        // Return error response
        if (!res.headersSent) {
            res.status(err.statusCode || 502).json({
                error: 'Proxy Error',
                message: err.message,
                service: routingDecision?.service,
                timestamp: Date.now()
            });
        }
    }

    /**
     * WebSocket proxy request handler
     * @private
     * @param {Object} proxyReq - Proxy request
     * @param {Object} req - Original request
     * @param {Object} socket - Socket
     * @param {Object} head - Head
     * @param {Object} routingDecision - Routing decision
     */
    onProxyWebSocketRequest(proxyReq, req, socket, head, routingDecision) {
        // Add WebSocket headers
        proxyReq.setHeader('X-Forwarded-Service', routingDecision.service);
        
        if (req.tenant) {
            proxyReq.setHeader('X-Tenant-Id', req.tenant.id);
        }
    }

    /**
     * Sets up WebSocket proxy between client and target
     * @private
     * @param {Object} clientWs - Client WebSocket
     * @param {Object} targetWs - Target WebSocket
     * @param {string} connectionId - Connection ID
     */
    setupWebSocketProxy(clientWs, targetWs, connectionId) {
        // Client to target
        clientWs.on('message', (data) => {
            if (targetWs.readyState === 1) { // OPEN
                targetWs.send(data);
            }
        });
        
        // Target to client
        targetWs.on('message', (data) => {
            if (clientWs.readyState === 1) { // OPEN
                clientWs.send(data);
            }
        });
        
        // Handle client disconnect
        clientWs.on('close', () => {
            targetWs.close();
            this.wsConnections.delete(connectionId);
            this.statistics.websocketConnections--;
        });
        
        // Handle target disconnect
        targetWs.on('close', () => {
            clientWs.close();
            this.wsConnections.delete(connectionId);
            this.statistics.websocketConnections--;
        });
        
        // Handle errors
        const errorHandler = (error) => {
            this.log('error', 'WebSocket error', { connectionId, error: error.message });
            clientWs.close(1001);
            targetWs.close();
            this.wsConnections.delete(connectionId);
            this.statistics.websocketConnections--;
        };
        
        clientWs.on('error', errorHandler);
        targetWs.on('error', errorHandler);
    }

    /**
     * Applies middleware chain
     * @private
     * @returns {Array} Middleware chain
     */
    applyMiddlewareChain() {
        const chain = [];
        
        // Add tracing
        if (this.tracingMiddleware) {
            chain.push(this.tracingMiddleware.trace());
        }
        
        // Add tenant identification
        if (this.tenantMiddleware) {
            chain.push(this.tenantMiddleware.identify());
            chain.push(this.tenantMiddleware.isolate());
        }
        
        // Add authentication if required
        if (this.authMiddleware) {
            chain.push((req, res, next) => {
                if (this.requiresAuth(req)) {
                    return this.authMiddleware.authenticate()(req, res, next);
                }
                next();
            });
        }
        
        // Add rate limiting
        if (this.rateLimitMiddleware) {
            chain.push(this.rateLimitMiddleware.apply());
        }
        
        return chain;
    }

    /**
     * Helper methods
     */
    
    getOrCreateProxy(service, config) {
        if (!this.proxyInstances.has(service)) {
            const proxy = createProxyMiddleware(config);
            this.proxyInstances.set(service, proxy);
        }
        return this.proxyInstances.get(service);
    }
    
    createProxyHeaders(req) {
        return {
            ...req.headers,
            'X-Forwarded-For': req.ip,
            'X-Forwarded-Proto': req.protocol,
            'X-Forwarded-Host': req.get('host')
        };
    }
    
    rewritePath(path, routingDecision, req) {
        // Apply path rewriting rules
        const rules = routingDecision.instance.pathRewrite || {};
        
        for (const [pattern, replacement] of Object.entries(rules)) {
            const regex = new RegExp(pattern);
            if (regex.test(path)) {
                return path.replace(regex, replacement);
            }
        }
        
        return path;
    }
    
    async selectServiceInstance(service) {
        // This would integrate with the routing middleware
        // For now, return the first instance
        const instances = await this.serviceRegistry.getServiceInstances(service.name);
        return instances[0];
    }
    
    shouldCache(req) {
        // Determine if response should be cached
        const noCacheHeaders = ['cache-control', 'pragma'].some(header => 
            req.headers[header]?.includes('no-cache')
        );
        
        return !noCacheHeaders && !req.headers.authorization;
    }
    
    async getCachedResponse(req) {
        const cacheKey = this.generateCacheKey(req);
        return await this.cacheManager.get(cacheKey);
    }
    
    async cacheResponse(req, proxyRes) {
        const cacheKey = this.generateCacheKey(req);
        const ttl = this.extractCacheTTL(proxyRes.headers);
        
        const response = {
            status: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: await this.extractResponseBody(proxyRes)
        };
        
        await this.cacheManager.set(cacheKey, response, ttl);
    }
    
    generateCacheKey(req) {
        return `proxy:${req.method}:${req.path}:${JSON.stringify(req.query)}`;
    }
    
    extractCacheTTL(headers) {
        const cacheControl = headers['cache-control'];
        if (cacheControl) {
            const match = cacheControl.match(/max-age=(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        return 300; // Default 5 minutes
    }
    
    async extractResponseBody(proxyRes) {
        return new Promise((resolve) => {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => resolve(body));
        });
    }
    
    shouldRetry(error, req) {
        return this.retryConfig.retryCondition(error) && 
               (req.retryCount || 0) < this.retryConfig.retries;
    }
    
    async retryRequest(req, res, routingDecision) {
        req.retryCount = (req.retryCount || 0) + 1;
        this.statistics.retriedRequests++;
        
        // Wait before retry
        await new Promise(resolve => 
            setTimeout(resolve, this.retryConfig.retryDelay * req.retryCount)
        );
        
        // Get new routing decision (may select different instance)
        const newRoutingDecision = await this.routingMiddleware.route(req);
        
        // Retry the request
        const proxyConfig = this.createProxyConfig(newRoutingDecision, req);
        const proxy = createProxyMiddleware(proxyConfig);
        
        proxy(req, res);
    }
    
    requiresAuth(req) {
        // Determine if request requires authentication
        const publicPaths = ['/health', '/metrics', '/static'];
        return !publicPaths.some(path => req.path.startsWith(path));
    }
    
    shouldUseCDN(req) {
        // Determine if CDN should be used
        return process.env.CDN_ENABLED === 'true' && 
               !req.headers['cache-control']?.includes('no-cache');
    }
    
    parseGraphQLQuery(query) {
        // Simple GraphQL query parser to determine required services
        // In production, use a proper GraphQL parser
        const services = [];
        
        if (query.includes('user')) services.push('user-service');
        if (query.includes('product')) services.push('product-service');
        if (query.includes('order')) services.push('order-service');
        
        return services;
    }
    
    splitGraphQLQuery(query, services) {
        // Split GraphQL query by service
        // This is a simplified implementation
        return services.map(service => ({
            service,
            subQuery: query // In reality, would extract service-specific parts
        }));
    }
    
    async executeGraphQLQuery(url, query, variables) {
        // Execute GraphQL query against a service
        // This would use fetch or axios in production
        return { data: {} };
    }
    
    mergeGraphQLResponses(results) {
        // Merge multiple GraphQL responses
        const merged = { data: {} };
        
        results.forEach(({ service, response }) => {
            Object.assign(merged.data, response.data);
        });
        
        return merged;
    }
    
    applyV1Transformations(req) {
        // Apply version-specific transformations
        // For backward compatibility
        return req;
    }
    
    extractGrpcMethod(req) {
        // Extract gRPC method from request
        return req.path.split('/').pop();
    }
    
    getGrpcClient(service) {
        // Get or create gRPC client for service
        // This would use @grpc/grpc-js in production
        return {};
    }
    
    handleGrpcError(error, res) {
        res.status(500).json({
            error: 'gRPC Error',
            message: error.message
        });
    }
    
    grpcWebToGrpc(body) {
        // Convert gRPC-Web to gRPC format
        return body;
    }
    
    async forwardToGrpcService(url, path, message) {
        // Forward to gRPC service
        return {};
    }
    
    grpcToGrpcWeb(response) {
        // Convert gRPC to gRPC-Web format
        return response;
    }
    
    generateConnectionId() {
        return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    handleCircuitBreakerOpen(req, res, service) {
        this.statistics.failedRequests++;
        
        res.status(503).json({
            error: 'Service Unavailable',
            message: `Circuit breaker is open for service: ${service}`,
            retryAfter: 30
        });
    }
    
    handleProxyError(error, req, res, startTime) {
        const duration = startTime ? Date.now() - startTime : 0;
        
        this.log('error', 'Proxy error', {
            error: error.message,
            path: req.path,
            method: req.method,
            duration
        });
        
        if (!res.headersSent) {
            res.status(error.statusCode || 500).json({
                error: 'Proxy Error',
                message: process.env.NODE_ENV === 'development' ? 
                    error.message : 'Internal server error',
                timestamp: Date.now()
            });
        }
    }
    
    async applyRequestTransformations(req, routingDecision) {
        const transformer = this.requestTransformers.get(routingDecision.service);
        if (transformer) {
            await transformer(req);
        }
    }
    
    setupResponseHandling(req, res, routingDecision, startTime) {
        req.startTime = startTime;
        
        // Override response methods to capture metrics
        const originalSend = res.send;
        res.send = function(data) {
            const duration = Date.now() - startTime;
            this.recordProxyMetrics(req, res, routingDecision, duration);
            return originalSend.call(this, data);
        }.bind(this);
    }
    
    recordProxyMetrics(req, res, routingDecision, duration) {
        // Update statistics
        this.statistics.byService[routingDecision.service] = 
            (this.statistics.byService[routingDecision.service] || 0) + 1;
        
        this.statistics.byProtocol[req.protocol] = 
            (this.statistics.byProtocol[req.protocol] || 0) + 1;
        
        // Update average latency
        const totalRequests = this.statistics.successfulRequests + this.statistics.failedRequests;
        this.statistics.averageLatency = 
            (this.statistics.averageLatency * (totalRequests - 1) + duration) / totalRequests;
        
        // Record in metrics collector
        if (this.metricsCollector) {
            this.metricsCollector.recordHttpRequest(
                req.method,
                req.path,
                res.statusCode,
                duration,
                routingDecision.service
            );
        }
    }

    /**
     * Registers request transformer
     * @param {string} service - Service name
     * @param {Function} transformer - Transformer function
     */
    registerRequestTransformer(service, transformer) {
        this.requestTransformers.set(service, transformer);
    }

    /**
     * Registers response transformer
     * @param {string} service - Service name
     * @param {Function} transformer - Transformer function
     */
    registerResponseTransformer(service, transformer) {
        this.responseTransformers.set(service, transformer);
    }

    /**
     * Gets proxy statistics
     * @returns {Object} Proxy statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            uptime: process.uptime(),
            proxies: this.proxyInstances.size,
            activeWebSockets: this.wsConnections.size
        };
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Returns the router
     * @returns {Object} Express router
     */
    getRouter() {
        return router;
    }
}

module.exports = ProxyRoutes;