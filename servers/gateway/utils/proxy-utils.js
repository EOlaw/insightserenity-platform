'use strict';

/**
 * @fileoverview Proxy Utils - Advanced proxy helper functions for API Gateway
 * @module servers/gateway/utils/proxy-utils
 * @requires http-proxy
 * @requires url
 * @requires querystring
 * @requires stream
 * @requires zlib
 * @requires crypto
 */

const httpProxy = require('http-proxy');
const url = require('url');
const querystring = require('querystring');
const { Transform, pipeline } = require('stream');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

/**
 * ProxyUtils class provides comprehensive proxy functionality for the API Gateway.
 * It handles request/response transformation, streaming, WebSocket upgrades,
 * header manipulation, body processing, and protocol translation.
 */
class ProxyUtils {
    /**
     * Creates an instance of ProxyUtils
     * @constructor
     * @param {Object} config - Proxy configuration
     * @param {Object} logger - Logger instance
     */
    constructor(config = {}, logger = console) {
        this.config = this.mergeConfig(config);
        this.logger = logger;
        
        // Proxy instances pool
        this.proxyPool = new Map();
        this.proxyPoolSize = config.poolSize || 10;
        this.currentPoolIndex = 0;
        
        // Request/Response transformers
        this.requestTransformers = new Map();
        this.responseTransformers = new Map();
        
        // Header rules
        this.headerRules = {
            request: new Map(),
            response: new Map()
        };
        
        // Body processors
        this.bodyProcessors = new Map();
        this.streamProcessors = new Map();
        
        // Protocol handlers
        this.protocolHandlers = new Map();
        this.initializeProtocolHandlers();
        
        // WebSocket handling
        this.wsConnections = new Map();
        this.wsMessageHandlers = new Map();
        
        // Request correlation
        this.requestCorrelation = new Map();
        this.requestMetrics = new Map();
        
        // Retry configuration
        this.retryConfig = {
            maxRetries: config.retry?.maxRetries || 3,
            retryDelay: config.retry?.retryDelay || 1000,
            retryOn: config.retry?.retryOn || [502, 503, 504],
            exponentialBackoff: config.retry?.exponentialBackoff !== false
        };
        
        // Circuit breaker integration
        this.circuitBreakers = new Map();
        
        // Request/Response interceptors
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        
        // Content type handlers
        this.contentTypeHandlers = new Map();
        this.initializeContentTypeHandlers();
        
        // Compression handlers
        this.compressionHandlers = {
            gzip: zlib.createGzip,
            deflate: zlib.createDeflate,
            br: zlib.createBrotliCompress
        };
        
        this.decompressionHandlers = {
            gzip: zlib.createGunzip,
            deflate: zlib.createInflate,
            br: zlib.createBrotliDecompress
        };
        
        // Security filters
        this.securityFilters = new Map();
        this.initializeSecurityFilters();
        
        // Performance tracking
        this.performanceMetrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            p95Latency: 0,
            p99Latency: 0,
            throughput: 0
        };
        
        // Latency tracking
        this.latencyBuffer = [];
        this.latencyBufferSize = 1000;
        
        // Initialize proxy pool
        this.initializeProxyPool();
    }

    /**
     * Merges configuration with defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(config) {
        return {
            target: config.target || 'http://localhost:3000',
            changeOrigin: config.changeOrigin !== false,
            ws: config.ws !== false,
            xfwd: config.xfwd !== false,
            secure: config.secure !== false,
            toProxy: config.toProxy || false,
            prependPath: config.prependPath !== false,
            ignorePath: config.ignorePath || false,
            localAddress: config.localAddress,
            preserveHeaderKeyCase: config.preserveHeaderKeyCase || false,
            
            timeout: {
                proxy: config.timeout?.proxy || 120000,
                socket: config.timeout?.socket || 120000,
                proxyRequest: config.timeout?.proxyRequest || 120000
            },
            
            buffer: {
                request: config.buffer?.request !== false,
                response: config.buffer?.response !== false,
                maxSize: config.buffer?.maxSize || 10 * 1024 * 1024 // 10MB
            },
            
            headers: {
                removeRequest: config.headers?.removeRequest || [],
                removeResponse: config.headers?.removeResponse || [],
                addRequest: config.headers?.addRequest || {},
                addResponse: config.headers?.addResponse || {},
                forwardedHeaders: config.headers?.forwardedHeaders !== false
            },
            
            rewrite: {
                enabled: config.rewrite?.enabled || false,
                rules: config.rewrite?.rules || []
            },
            
            followRedirects: config.followRedirects || false,
            autoRewrite: config.autoRewrite !== false,
            protocolRewrite: config.protocolRewrite,
            cookieDomainRewrite: config.cookieDomainRewrite || false,
            cookiePathRewrite: config.cookiePathRewrite || false,
            
            ssl: {
                key: config.ssl?.key,
                cert: config.ssl?.cert,
                ca: config.ssl?.ca,
                ciphers: config.ssl?.ciphers,
                secureProtocol: config.ssl?.secureProtocol
            },
            
            ...config
        };
    }

    /**
     * Initializes proxy pool
     * @private
     */
    initializeProxyPool() {
        for (let i = 0; i < this.proxyPoolSize; i++) {
            const proxy = httpProxy.createProxyServer({
                target: this.config.target,
                changeOrigin: this.config.changeOrigin,
                ws: this.config.ws,
                xfwd: this.config.xfwd,
                secure: this.config.secure,
                toProxy: this.config.toProxy,
                prependPath: this.config.prependPath,
                ignorePath: this.config.ignorePath,
                localAddress: this.config.localAddress,
                preserveHeaderKeyCase: this.config.preserveHeaderKeyCase,
                timeout: this.config.timeout.proxy,
                proxyTimeout: this.config.timeout.proxyRequest,
                followRedirects: this.config.followRedirects,
                autoRewrite: this.config.autoRewrite,
                protocolRewrite: this.config.protocolRewrite,
                cookieDomainRewrite: this.config.cookieDomainRewrite,
                cookiePathRewrite: this.config.cookiePathRewrite,
                ssl: this.config.ssl
            });
            
            // Setup error handling
            this.setupProxyErrorHandling(proxy, i);
            
            // Setup event handlers
            this.setupProxyEventHandlers(proxy, i);
            
            this.proxyPool.set(i, proxy);
        }
        
        this.logger.info(`Initialized proxy pool with ${this.proxyPoolSize} instances`);
    }

    /**
     * Main proxy method
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} options - Proxy options
     * @returns {Promise<void>}
     */
    async proxy(req, res, options = {}) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        
        // Store correlation
        this.requestCorrelation.set(requestId, {
            req,
            res,
            startTime,
            options
        });
        
        try {
            // Update metrics
            this.performanceMetrics.totalRequests++;
            
            // Apply request interceptors
            await this.applyRequestInterceptors(req, res, options);
            
            // Check circuit breaker
            if (await this.checkCircuitBreaker(options.target || this.config.target)) {
                throw new Error('Circuit breaker open');
            }
            
            // Transform request
            await this.transformRequest(req, res, options);
            
            // Get proxy instance from pool
            const proxy = this.getProxyFromPool();
            
            // Setup dynamic target if provided
            const target = this.resolveTarget(req, options);
            
            // Create proxy options
            const proxyOptions = this.createProxyOptions(req, options, target);
            
            // Execute proxy with retry
            await this.executeProxyWithRetry(proxy, req, res, proxyOptions, requestId);
            
            // Update success metrics
            this.performanceMetrics.successfulRequests++;
            
            // Record latency
            const latency = Date.now() - startTime;
            this.recordLatency(latency);
            
        } catch (error) {
            // Update failure metrics
            this.performanceMetrics.failedRequests++;
            
            // Handle proxy error
            await this.handleProxyError(error, req, res, requestId);
            
        } finally {
            // Cleanup
            this.requestCorrelation.delete(requestId);
        }
    }

    /**
     * Proxies WebSocket connections
     * @param {Object} req - Request object
     * @param {Object} socket - Socket object
     * @param {Object} head - Head buffer
     * @param {Object} options - Proxy options
     * @returns {Promise<void>}
     */
    async proxyWebSocket(req, socket, head, options = {}) {
        const wsId = this.generateWebSocketId();
        
        try {
            // Store WebSocket connection
            this.wsConnections.set(wsId, {
                socket,
                req,
                startTime: Date.now(),
                options
            });
            
            // Get proxy instance
            const proxy = this.getProxyFromPool();
            
            // Resolve target
            const target = this.resolveTarget(req, options);
            
            // Setup WebSocket handlers
            this.setupWebSocketHandlers(socket, wsId);
            
            // Proxy WebSocket
            proxy.ws(req, socket, head, {
                target,
                ws: true,
                changeOrigin: this.config.changeOrigin
            });
            
            this.logger.debug(`WebSocket proxied: ${wsId}`);
            
        } catch (error) {
            this.logger.error(`WebSocket proxy error: ${wsId}`, error);
            socket.destroy();
        }
    }

    /**
     * Executes proxy with retry logic
     * @private
     * @param {Object} proxy - Proxy instance
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} options - Proxy options
     * @param {string} requestId - Request ID
     * @returns {Promise<void>}
     */
    async executeProxyWithRetry(proxy, req, res, options, requestId) {
        let lastError;
        let attempt = 0;
        
        while (attempt < this.retryConfig.maxRetries) {
            try {
                await this.executeProxy(proxy, req, res, options);
                return; // Success
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                // Check if we've exhausted retries
                if (attempt >= this.retryConfig.maxRetries) {
                    break;
                }
                
                // Calculate delay
                const delay = this.calculateRetryDelay(attempt);
                
                this.logger.debug(`Retrying request ${requestId}, attempt ${attempt} after ${delay}ms`);
                
                // Wait before retry
                await this.delay(delay);
                
                // Reset request stream if needed
                if (req.readable) {
                    req.pipe(req);
                }
            }
        }
        
        // All retries exhausted
        throw lastError;
    }

    /**
     * Executes the actual proxy
     * @private
     * @param {Object} proxy - Proxy instance
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} options - Proxy options
     * @returns {Promise<void>}
     */
    executeProxy(proxy, req, res, options) {
        return new Promise((resolve, reject) => {
            // Setup one-time listeners
            const onProxyRes = (proxyRes, req, res) => {
                this.handleProxyResponse(proxyRes, req, res, options)
                    .then(resolve)
                    .catch(reject);
            };
            
            const onError = (error) => {
                proxy.removeListener('proxyRes', onProxyRes);
                reject(error);
            };
            
            proxy.once('proxyRes', onProxyRes);
            proxy.once('error', onError);
            
            // Execute proxy
            proxy.web(req, res, options);
        });
    }

    /**
     * Handles proxy response
     * @private
     * @param {Object} proxyRes - Proxy response
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Object} options - Options
     * @returns {Promise<void>}
     */
    async handleProxyResponse(proxyRes, req, res, options) {
        try {
            // Apply response interceptors
            await this.applyResponseInterceptors(proxyRes, req, res, options);
            
            // Transform response headers
            this.transformResponseHeaders(proxyRes, req, res, options);
            
            // Set status code
            res.statusCode = proxyRes.statusCode;
            res.statusMessage = proxyRes.statusMessage;
            
            // Handle response body
            if (this.shouldTransformResponseBody(proxyRes, options)) {
                await this.transformResponseBody(proxyRes, req, res, options);
            } else {
                // Stream response directly
                await this.streamResponse(proxyRes, res, options);
            }
            
        } catch (error) {
            this.logger.error('Error handling proxy response:', error);
            throw error;
        }
    }

    /**
     * Request transformation
     */
    
    async transformRequest(req, res, options) {
        // Apply URL rewriting
        if (this.config.rewrite.enabled) {
            this.rewriteUrl(req, options);
        }
        
        // Transform headers
        this.transformRequestHeaders(req, options);
        
        // Apply request transformers
        const transformer = this.requestTransformers.get(req.path);
        if (transformer) {
            await transformer(req, res, options);
        }
        
        // Apply security filters
        await this.applySecurityFilters(req, res, options);
        
        // Transform body if needed
        if (this.shouldTransformRequestBody(req, options)) {
            await this.transformRequestBody(req, res, options);
        }
    }
    
    transformRequestHeaders(req, options) {
        // Remove specified headers
        for (const header of this.config.headers.removeRequest) {
            delete req.headers[header.toLowerCase()];
        }
        
        // Add specified headers
        for (const [key, value] of Object.entries(this.config.headers.addRequest)) {
            req.headers[key.toLowerCase()] = value;
        }
        
        // Add forwarded headers
        if (this.config.headers.forwardedHeaders) {
            this.addForwardedHeaders(req);
        }
        
        // Apply header rules
        for (const [pattern, rule] of this.headerRules.request) {
            if (this.matchesPattern(req.path, pattern)) {
                rule(req.headers);
            }
        }
        
        // Handle host header
        if (this.config.changeOrigin) {
            const target = url.parse(options.target || this.config.target);
            req.headers.host = target.host;
        }
    }
    
    async transformRequestBody(req, res, options) {
        const contentType = req.headers['content-type'];
        const handler = this.contentTypeHandlers.get(contentType);
        
        if (handler) {
            const body = await this.bufferRequestBody(req);
            const transformed = await handler.request(body, req, options);
            
            // Replace request body
            req.body = transformed;
            
            // Update content-length
            if (Buffer.isBuffer(transformed)) {
                req.headers['content-length'] = transformed.length;
            } else if (typeof transformed === 'string') {
                req.headers['content-length'] = Buffer.byteLength(transformed);
            }
        }
    }

    /**
     * Response transformation
     */
    
    transformResponseHeaders(proxyRes, req, res, options) {
        // Copy status
        res.statusCode = proxyRes.statusCode;
        res.statusMessage = proxyRes.statusMessage;
        
        // Remove specified headers
        for (const header of this.config.headers.removeResponse) {
            delete proxyRes.headers[header.toLowerCase()];
        }
        
        // Add specified headers
        for (const [key, value] of Object.entries(this.config.headers.addResponse)) {
            proxyRes.headers[key.toLowerCase()] = value;
        }
        
        // Apply header rules
        for (const [pattern, rule] of this.headerRules.response) {
            if (this.matchesPattern(req.path, pattern)) {
                rule(proxyRes.headers);
            }
        }
        
        // Rewrite location header for redirects
        if (this.config.autoRewrite && proxyRes.headers.location) {
            proxyRes.headers.location = this.rewriteLocation(proxyRes.headers.location, req);
        }
        
        // Rewrite cookie domain/path
        if (proxyRes.headers['set-cookie']) {
            proxyRes.headers['set-cookie'] = this.rewriteCookies(proxyRes.headers['set-cookie']);
        }
        
        // Copy headers to response
        Object.keys(proxyRes.headers).forEach(key => {
            res.setHeader(key, proxyRes.headers[key]);
        });
    }
    
    async transformResponseBody(proxyRes, req, res, options) {
        const contentType = proxyRes.headers['content-type'];
        const handler = this.contentTypeHandlers.get(contentType);
        
        if (handler) {
            const body = await this.bufferResponseBody(proxyRes);
            const transformed = await handler.response(body, proxyRes, req, options);
            
            // Send transformed response
            if (Buffer.isBuffer(transformed)) {
                res.setHeader('content-length', transformed.length);
                res.end(transformed);
            } else if (typeof transformed === 'string') {
                res.setHeader('content-length', Buffer.byteLength(transformed));
                res.end(transformed);
            } else if (transformed && typeof transformed.pipe === 'function') {
                transformed.pipe(res);
            } else {
                res.end(JSON.stringify(transformed));
            }
        } else {
            // Stream without transformation
            await this.streamResponse(proxyRes, res, options);
        }
    }

    /**
     * Streaming methods
     */
    
    async streamResponse(proxyRes, res, options) {
        // Handle compression
        const encoding = proxyRes.headers['content-encoding'];
        
        if (encoding && options.decompress) {
            const decompressor = this.decompressionHandlers[encoding];
            if (decompressor) {
                await pipelineAsync(
                    proxyRes,
                    decompressor(),
                    res
                );
                return;
            }
        }
        
        // Apply stream processors
        const processors = this.getStreamProcessors(proxyRes.headers['content-type']);
        
        if (processors.length > 0) {
            const streams = [proxyRes, ...processors, res];
            await pipelineAsync(...streams);
        } else {
            // Direct streaming
            proxyRes.pipe(res);
        }
    }
    
    getStreamProcessors(contentType) {
        const processors = [];
        
        for (const [pattern, processor] of this.streamProcessors) {
            if (this.matchesContentType(contentType, pattern)) {
                processors.push(processor());
            }
        }
        
        return processors;
    }
    
    createTransformStream(transformFn) {
        return new Transform({
            transform(chunk, encoding, callback) {
                try {
                    const transformed = transformFn(chunk, encoding);
                    callback(null, transformed);
                } catch (error) {
                    callback(error);
                }
            }
        });
    }

    /**
     * Protocol handlers
     */
    
    initializeProtocolHandlers() {
        // HTTP/HTTPS handler
        this.protocolHandlers.set('http:', this.handleHttpProtocol.bind(this));
        this.protocolHandlers.set('https:', this.handleHttpsProtocol.bind(this));
        
        // WebSocket handler
        this.protocolHandlers.set('ws:', this.handleWsProtocol.bind(this));
        this.protocolHandlers.set('wss:', this.handleWssProtocol.bind(this));
        
        // Custom protocol handlers can be added
    }
    
    async handleHttpProtocol(req, res, options) {
        // Standard HTTP proxy
        return this.executeProxy(this.getProxyFromPool(), req, res, options);
    }
    
    async handleHttpsProtocol(req, res, options) {
        // HTTPS with SSL options
        const sslOptions = {
            ...options,
            ssl: this.config.ssl,
            secure: this.config.secure
        };
        
        return this.executeProxy(this.getProxyFromPool(), req, res, sslOptions);
    }
    
    async handleWsProtocol(req, socket, head, options) {
        // WebSocket proxy
        return this.proxyWebSocket(req, socket, head, options);
    }
    
    async handleWssProtocol(req, socket, head, options) {
        // Secure WebSocket proxy
        const sslOptions = {
            ...options,
            ssl: this.config.ssl,
            secure: true
        };
        
        return this.proxyWebSocket(req, socket, head, sslOptions);
    }

    /**
     * Content type handlers
     */
    
    initializeContentTypeHandlers() {
        // JSON handler
        this.contentTypeHandlers.set('application/json', {
            request: async (body, req, options) => {
                if (options.transformRequest?.json) {
                    const json = JSON.parse(body.toString());
                    const transformed = await options.transformRequest.json(json, req);
                    return JSON.stringify(transformed);
                }
                return body;
            },
            response: async (body, res, req, options) => {
                if (options.transformResponse?.json) {
                    const json = JSON.parse(body.toString());
                    const transformed = await options.transformResponse.json(json, res, req);
                    return JSON.stringify(transformed);
                }
                return body;
            }
        });
        
        // XML handler
        this.contentTypeHandlers.set('application/xml', {
            request: async (body, req, options) => {
                if (options.transformRequest?.xml) {
                    return options.transformRequest.xml(body.toString(), req);
                }
                return body;
            },
            response: async (body, res, req, options) => {
                if (options.transformResponse?.xml) {
                    return options.transformResponse.xml(body.toString(), res, req);
                }
                return body;
            }
        });
        
        // Form data handler
        this.contentTypeHandlers.set('application/x-www-form-urlencoded', {
            request: async (body, req, options) => {
                if (options.transformRequest?.form) {
                    const form = querystring.parse(body.toString());
                    const transformed = await options.transformRequest.form(form, req);
                    return querystring.stringify(transformed);
                }
                return body;
            },
            response: async (body, res, req, options) => {
                return body;
            }
        });
    }

    /**
     * Security filters
     */
    
    initializeSecurityFilters() {
        // XSS filter
        this.securityFilters.set('xss', async (req, res, options) => {
            if (req.body) {
                req.body = this.sanitizeXss(req.body);
            }
            if (req.query) {
                req.query = this.sanitizeXss(req.query);
            }
        });
        
        // SQL injection filter
        this.securityFilters.set('sql', async (req, res, options) => {
            const suspicious = this.detectSqlInjection(req);
            if (suspicious) {
                throw new Error('Potential SQL injection detected');
            }
        });
        
        // Path traversal filter
        this.securityFilters.set('path', async (req, res, options) => {
            if (req.url.includes('../') || req.url.includes('..\\')) {
                throw new Error('Path traversal attempt detected');
            }
        });
    }
    
    async applySecurityFilters(req, res, options) {
        for (const [name, filter] of this.securityFilters) {
            if (options.security?.[name] !== false) {
                await filter(req, res, options);
            }
        }
    }
    
    sanitizeXss(data) {
        if (typeof data === 'string') {
            return data
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
        }
        
        if (typeof data === 'object' && data !== null) {
            const sanitized = Array.isArray(data) ? [] : {};
            
            for (const key in data) {
                sanitized[key] = this.sanitizeXss(data[key]);
            }
            
            return sanitized;
        }
        
        return data;
    }
    
    detectSqlInjection(req) {
        const patterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/gi,
            /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,
            /(--|#|\/\*|\*\/)/g
        ];
        
        const checkStr = JSON.stringify({
            body: req.body,
            query: req.query,
            params: req.params
        });
        
        return patterns.some(pattern => pattern.test(checkStr));
    }

    /**
     * WebSocket handling
     */
    
    setupWebSocketHandlers(socket, wsId) {
        // Handle messages
        socket.on('message', (data) => {
            const handlers = this.wsMessageHandlers.get(wsId) || [];
            
            for (const handler of handlers) {
                try {
                    handler(data, socket);
                } catch (error) {
                    this.logger.error(`WebSocket message handler error: ${wsId}`, error);
                }
            }
        });
        
        // Handle close
        socket.on('close', () => {
            this.wsConnections.delete(wsId);
            this.wsMessageHandlers.delete(wsId);
            this.logger.debug(`WebSocket closed: ${wsId}`);
        });
        
        // Handle error
        socket.on('error', (error) => {
            this.logger.error(`WebSocket error: ${wsId}`, error);
            this.wsConnections.delete(wsId);
            this.wsMessageHandlers.delete(wsId);
        });
    }
    
    addWebSocketMessageHandler(wsId, handler) {
        const handlers = this.wsMessageHandlers.get(wsId) || [];
        handlers.push(handler);
        this.wsMessageHandlers.set(wsId, handlers);
    }

    /**
     * Interceptors
     */
    
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }
    
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }
    
    async applyRequestInterceptors(req, res, options) {
        for (const interceptor of this.requestInterceptors) {
            await interceptor(req, res, options);
        }
    }
    
    async applyResponseInterceptors(proxyRes, req, res, options) {
        for (const interceptor of this.responseInterceptors) {
            await interceptor(proxyRes, req, res, options);
        }
    }

    /**
     * Helper methods
     */
    
    getProxyFromPool() {
        const proxy = this.proxyPool.get(this.currentPoolIndex);
        this.currentPoolIndex = (this.currentPoolIndex + 1) % this.proxyPoolSize;
        return proxy;
    }
    
    resolveTarget(req, options) {
        if (options.target) {
            return options.target;
        }
        
        if (options.router) {
            const route = options.router(req);
            if (route) {
                return route;
            }
        }
        
        return this.config.target;
    }
    
    createProxyOptions(req, options, target) {
        return {
            target,
            changeOrigin: options.changeOrigin ?? this.config.changeOrigin,
            ws: options.ws ?? this.config.ws,
            xfwd: options.xfwd ?? this.config.xfwd,
            secure: options.secure ?? this.config.secure,
            toProxy: options.toProxy ?? this.config.toProxy,
            prependPath: options.prependPath ?? this.config.prependPath,
            ignorePath: options.ignorePath ?? this.config.ignorePath,
            localAddress: options.localAddress ?? this.config.localAddress,
            preserveHeaderKeyCase: options.preserveHeaderKeyCase ?? this.config.preserveHeaderKeyCase,
            buffer: options.buffer ?? this.config.buffer,
            ...options.proxy
        };
    }
    
    rewriteUrl(req, options) {
        for (const rule of this.config.rewrite.rules) {
            if (rule.match.test(req.url)) {
                req.url = req.url.replace(rule.match, rule.rewrite);
                this.logger.debug(`URL rewritten: ${req.url}`);
                break;
            }
        }
    }
    
    rewriteLocation(location, req) {
        const parsed = url.parse(location);
        const target = url.parse(this.config.target);
        
        if (parsed.hostname === target.hostname) {
            parsed.protocol = req.protocol;
            parsed.host = req.headers.host;
            return url.format(parsed);
        }
        
        return location;
    }
    
    rewriteCookies(cookies) {
        if (!Array.isArray(cookies)) {
            cookies = [cookies];
        }
        
        return cookies.map(cookie => {
            if (this.config.cookieDomainRewrite) {
                cookie = cookie.replace(/Domain=[^;]+/gi, `Domain=${this.config.cookieDomainRewrite}`);
            }
            
            if (this.config.cookiePathRewrite) {
                cookie = cookie.replace(/Path=[^;]+/gi, `Path=${this.config.cookiePathRewrite}`);
            }
            
            return cookie;
        });
    }
    
    addForwardedHeaders(req) {
        const forwarded = [];
        
        // X-Forwarded-For
        const existingFor = req.headers['x-forwarded-for'];
        const clientIp = req.connection.remoteAddress;
        req.headers['x-forwarded-for'] = existingFor ? 
            `${existingFor}, ${clientIp}` : clientIp;
        
        // X-Forwarded-Proto
        req.headers['x-forwarded-proto'] = req.protocol || 'http';
        
        // X-Forwarded-Host
        req.headers['x-forwarded-host'] = req.headers.host;
        
        // X-Forwarded-Port
        const port = req.connection.localPort;
        req.headers['x-forwarded-port'] = port;
        
        // Forwarded header (RFC 7239)
        forwarded.push(`for=${clientIp}`);
        forwarded.push(`proto=${req.protocol || 'http'}`);
        forwarded.push(`host=${req.headers.host}`);
        
        req.headers.forwarded = forwarded.join('; ');
    }
    
    shouldTransformRequestBody(req, options) {
        if (!this.config.buffer.request) {
            return false;
        }
        
        const contentType = req.headers['content-type'];
        
        return (
            options.transformRequest ||
            this.bodyProcessors.has(contentType) ||
            this.contentTypeHandlers.has(contentType)
        );
    }
    
    shouldTransformResponseBody(proxyRes, options) {
        if (!this.config.buffer.response) {
            return false;
        }
        
        const contentType = proxyRes.headers['content-type'];
        
        return (
            options.transformResponse ||
            this.bodyProcessors.has(contentType) ||
            this.contentTypeHandlers.has(contentType)
        );
    }
    
    async bufferRequestBody(req) {
        const chunks = [];
        let size = 0;
        
        return new Promise((resolve, reject) => {
            req.on('data', (chunk) => {
                size += chunk.length;
                
                if (size > this.config.buffer.maxSize) {
                    reject(new Error('Request body too large'));
                    return;
                }
                
                chunks.push(chunk);
            });
            
            req.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            
            req.on('error', reject);
        });
    }
    
    async bufferResponseBody(proxyRes) {
        const chunks = [];
        let size = 0;
        
        return new Promise((resolve, reject) => {
            proxyRes.on('data', (chunk) => {
                size += chunk.length;
                
                if (size > this.config.buffer.maxSize) {
                    reject(new Error('Response body too large'));
                    return;
                }
                
                chunks.push(chunk);
            });
            
            proxyRes.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            
            proxyRes.on('error', reject);
        });
    }
    
    matchesPattern(path, pattern) {
        if (pattern instanceof RegExp) {
            return pattern.test(path);
        }
        
        if (typeof pattern === 'string') {
            return path.startsWith(pattern);
        }
        
        return false;
    }
    
    matchesContentType(contentType, pattern) {
        if (!contentType) return false;
        
        if (pattern instanceof RegExp) {
            return pattern.test(contentType);
        }
        
        if (typeof pattern === 'string') {
            return contentType.includes(pattern);
        }
        
        return false;
    }
    
    isRetryableError(error) {
        if (!error) return false;
        
        // Check status codes
        if (error.statusCode && this.retryConfig.retryOn.includes(error.statusCode)) {
            return true;
        }
        
        // Check error codes
        const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'];
        if (error.code && retryableCodes.includes(error.code)) {
            return true;
        }
        
        return false;
    }
    
    calculateRetryDelay(attempt) {
        if (this.retryConfig.exponentialBackoff) {
            return Math.min(
                this.retryConfig.retryDelay * Math.pow(2, attempt - 1),
                30000 // Max 30 seconds
            );
        }
        
        return this.retryConfig.retryDelay;
    }
    
    async checkCircuitBreaker(target) {
        const breaker = this.circuitBreakers.get(target);
        
        if (breaker && breaker.isOpen()) {
            return true;
        }
        
        return false;
    }
    
    async handleProxyError(error, req, res, requestId) {
        this.logger.error(`Proxy error for request ${requestId}:`, error);
        
        // Send error response if not already sent
        if (!res.headersSent) {
            res.statusCode = error.statusCode || 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                error: 'Proxy Error',
                message: error.message,
                requestId
            }));
        }
    }
    
    setupProxyErrorHandling(proxy, index) {
        proxy.on('error', (err, req, res) => {
            this.logger.error(`Proxy ${index} error:`, err);
            
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Bad Gateway',
                    message: err.message
                }));
            }
        });
        
        proxy.on('proxyReq', (proxyReq, req, res, options) => {
            // Handle request events
            this.emit('proxy:request', { proxyReq, req, res, options });
        });
        
        proxy.on('proxyRes', (proxyRes, req, res) => {
            // Handle response events
            this.emit('proxy:response', { proxyRes, req, res });
        });
    }
    
    setupProxyEventHandlers(proxy, index) {
        proxy.on('open', (proxySocket) => {
            this.logger.debug(`Proxy ${index} socket opened`);
            
            proxySocket.on('data', (data) => {
                this.emit('proxy:data', { proxy: index, data });
            });
        });
        
        proxy.on('close', (res, socket, head) => {
            this.logger.debug(`Proxy ${index} connection closed`);
        });
        
        proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            this.logger.debug(`WebSocket request proxied via proxy ${index}`);
        });
    }
    
    recordLatency(latency) {
        this.latencyBuffer.push(latency);
        
        if (this.latencyBuffer.length > this.latencyBufferSize) {
            this.latencyBuffer.shift();
        }
        
        // Update metrics
        this.updateLatencyMetrics();
    }
    
    updateLatencyMetrics() {
        if (this.latencyBuffer.length === 0) return;
        
        const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
        const len = sorted.length;
        
        this.performanceMetrics.averageLatency = 
            sorted.reduce((a, b) => a + b, 0) / len;
        
        this.performanceMetrics.p95Latency = 
            sorted[Math.floor(len * 0.95)];
        
        this.performanceMetrics.p99Latency = 
            sorted[Math.floor(len * 0.99)];
        
        this.performanceMetrics.throughput = 
            this.performanceMetrics.totalRequests / (Date.now() / 1000);
    }
    
    generateRequestId() {
        return `req-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    }
    
    generateWebSocketId() {
        return `ws-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Gets proxy metrics
     * @returns {Object} Proxy metrics
     */
    getMetrics() {
        return {
            ...this.performanceMetrics,
            poolSize: this.proxyPoolSize,
            activeConnections: this.requestCorrelation.size,
            activeWebSockets: this.wsConnections.size,
            requestInterceptors: this.requestInterceptors.length,
            responseInterceptors: this.responseInterceptors.length
        };
    }

    /**
     * Cleanup method
     */
    cleanup() {
        // Close all proxy instances
        for (const [index, proxy] of this.proxyPool) {
            proxy.close();
        }
        
        // Clear connections
        this.wsConnections.clear();
        this.requestCorrelation.clear();
        
        this.logger.info('ProxyUtils cleaned up');
    }
}

module.exports = ProxyUtils;