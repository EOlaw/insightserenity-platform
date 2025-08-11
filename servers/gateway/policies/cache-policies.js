'use strict';

/**
 * @fileoverview Cache Policies - Advanced cache strategy enforcement for API Gateway
 * @module servers/gateway/policies/cache-policies
 * @requires events
 * @requires crypto
 * @requires zlib
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * CachePolicies class implements comprehensive cache management policies for the API Gateway.
 * It provides cache strategy enforcement, invalidation rules, TTL management, compression,
 * edge caching, cache warming, tenant isolation, and distributed cache coordination.
 */
class CachePolicies extends EventEmitter {
    /**
     * Creates an instance of CachePolicies
     * @constructor
     * @param {Object} config - Cache configuration
     * @param {Object} cacheManager - Cache manager instance
     * @param {Object} logger - Logger instance
     */
    constructor(config, cacheManager, logger) {
        super();
        this.config = config || {};
        this.cacheManager = cacheManager;
        this.logger = logger;
        
        // Cache policies
        this.policies = new Map();
        this.policyRules = new Map();
        this.policyActions = new Map();
        
        // Cache strategies
        this.strategies = {
            'no-cache': this.noCacheStrategy.bind(this),
            'cache-first': this.cacheFirstStrategy.bind(this),
            'network-first': this.networkFirstStrategy.bind(this),
            'stale-while-revalidate': this.staleWhileRevalidateStrategy.bind(this),
            'cache-only': this.cacheOnlyStrategy.bind(this),
            'network-only': this.networkOnlyStrategy.bind(this),
            'cache-and-network': this.cacheAndNetworkStrategy.bind(this),
            'predictive': this.predictiveCacheStrategy.bind(this),
            'adaptive': this.adaptiveCacheStrategy.bind(this)
        };
        
        // Cache key generators
        this.keyGenerators = new Map();
        this.defaultKeyGenerator = this.generateDefaultCacheKey.bind(this);
        
        // TTL configurations
        this.ttlConfigs = new Map();
        this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
        this.maxTTL = config.maxTTL || 86400000; // 24 hours
        
        // Cache invalidation rules
        this.invalidationRules = new Map();
        this.invalidationPatterns = new Map();
        this.invalidationQueue = [];
        
        // Cache warming configuration
        this.warmingConfig = {
            enabled: config.warming?.enabled || false,
            interval: config.warming?.interval || 300000, // 5 minutes
            concurrent: config.warming?.concurrent || 5,
            endpoints: config.warming?.endpoints || [],
            priority: config.warming?.priority || 'low'
        };
        
        // Edge caching configuration
        this.edgeCacheConfig = {
            enabled: config.edgeCache?.enabled || false,
            regions: config.edgeCache?.regions || ['us-east-1'],
            syncInterval: config.edgeCache?.syncInterval || 60000,
            maxSize: config.edgeCache?.maxSize || 100 * 1024 * 1024 // 100MB
        };
        
        // Compression configuration
        this.compressionConfig = {
            enabled: config.compression?.enabled !== false,
            threshold: config.compression?.threshold || 1024, // 1KB
            level: config.compression?.level || 6,
            types: config.compression?.types || ['text/html', 'application/json', 'text/plain']
        };
        
        // Tenant isolation configuration
        this.tenantIsolation = {
            enabled: config.tenantIsolation?.enabled !== false,
            sharedCache: config.tenantIsolation?.sharedCache || false,
            maxTenantCacheSize: config.tenantIsolation?.maxSize || 10 * 1024 * 1024 // 10MB
        };
        
        // Cache headers configuration
        this.cacheHeaders = {
            respectCacheControl: config.headers?.respectCacheControl !== false,
            respectExpires: config.headers?.respectExpires !== false,
            addETag: config.headers?.addETag !== false,
            addLastModified: config.headers?.addLastModified !== false,
            addVary: config.headers?.addVary !== false
        };
        
        // Cache bypass configuration
        this.bypassConfig = {
            headers: config.bypass?.headers || ['x-cache-bypass', 'x-no-cache'],
            cookies: config.bypass?.cookies || ['no-cache'],
            queryParams: config.bypass?.queryParams || ['nocache', 'bypass-cache'],
            userAgents: config.bypass?.userAgents || []
        };
        
        // Cache metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            bypasses: 0,
            errors: 0,
            compressionSaved: 0,
            hitRate: 0,
            avgResponseTime: 0,
            cacheSize: 0,
            tenantMetrics: new Map()
        };
        
        // Response time tracking
        this.responseTimeBuffer = [];
        this.responseTimeBufferSize = 100;
        
        // Cache entry metadata
        this.entryMetadata = new Map();
        
        // Distributed cache coordination
        this.distributedConfig = {
            enabled: config.distributed?.enabled || false,
            nodes: config.distributed?.nodes || [],
            syncStrategy: config.distributed?.syncStrategy || 'eventual',
            consistencyLevel: config.distributed?.consistencyLevel || 'eventual'
        };
        
        // Cache preloading
        this.preloadQueue = [];
        this.preloadInProgress = false;
        
        // Initialize policies
        this.initializePolicies();
        
        // Start background tasks
        this.startBackgroundTasks();
    }

    /**
     * Initializes cache policies
     * @private
     */
    initializePolicies() {
        // Response caching policy
        this.registerPolicy('response-caching', {
            priority: 100,
            enabled: true,
            description: 'Caches API responses based on method and content type',
            condition: (req, res) => {
                return this.shouldCacheResponse(req, res);
            },
            action: 'cache-response',
            config: {
                methods: ['GET', 'HEAD', 'OPTIONS'],
                statusCodes: [200, 203, 204, 206, 300, 301, 304],
                contentTypes: ['application/json', 'text/html', 'text/plain', 'application/xml']
            }
        });

        // Static asset caching policy
        this.registerPolicy('static-assets', {
            priority: 95,
            enabled: true,
            description: 'Long-term caching for static assets',
            condition: (req) => {
                return this.isStaticAsset(req.path);
            },
            action: 'cache-static',
            config: {
                ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
                immutable: true,
                extensions: ['.js', '.css', '.jpg', '.png', '.gif', '.svg', '.woff', '.woff2']
            }
        });

        // API versioning cache policy
        this.registerPolicy('api-versioning', {
            priority: 90,
            enabled: true,
            description: 'Version-based cache management',
            condition: (req) => {
                return req.headers['x-api-version'] || this.extractVersionFromPath(req.path);
            },
            action: 'version-cache',
            config: {
                versionHeader: 'x-api-version',
                separateVersions: true,
                ttlMultiplier: { v1: 1, v2: 1.5, v3: 2 }
            }
        });

        // Personalized content policy
        this.registerPolicy('personalized-content', {
            priority: 85,
            enabled: true,
            description: 'User-specific cache management',
            condition: (req) => {
                return req.user || req.headers.authorization;
            },
            action: 'user-cache',
            config: {
                includeUserId: true,
                excludePaths: ['/api/public'],
                ttl: 60000 // 1 minute
            }
        });

        // Tenant isolation policy
        this.registerPolicy('tenant-isolation', {
            priority: 80,
            enabled: true,
            description: 'Tenant-specific cache isolation',
            condition: (req) => {
                return req.tenant && this.tenantIsolation.enabled;
            },
            action: 'tenant-cache',
            config: {
                isolationLevel: 'strict',
                sharedResources: ['/api/common'],
                tenantHeader: 'x-tenant-id'
            }
        });

        // Dynamic content policy
        this.registerPolicy('dynamic-content', {
            priority: 75,
            enabled: true,
            description: 'Smart caching for dynamic content',
            condition: (req) => {
                return req.query && Object.keys(req.query).length > 0;
            },
            action: 'dynamic-cache',
            config: {
                includeQuery: true,
                excludeParams: ['timestamp', '_'],
                ttl: 30000 // 30 seconds
            }
        });

        // Compression policy
        this.registerPolicy('compression', {
            priority: 70,
            enabled: true,
            description: 'Compress cached responses',
            condition: (req, res) => {
                return this.shouldCompress(req, res);
            },
            action: 'compress-cache',
            config: {
                minSize: 1024,
                algorithms: ['gzip', 'deflate', 'br']
            }
        });

        // Edge caching policy
        this.registerPolicy('edge-caching', {
            priority: 65,
            enabled: true,
            description: 'Distribute cache to edge locations',
            condition: (req) => {
                return this.edgeCacheConfig.enabled && this.isEdgeCacheable(req);
            },
            action: 'edge-cache',
            config: {
                regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
                syncStrategy: 'push'
            }
        });

        // Predictive caching policy
        this.registerPolicy('predictive-caching', {
            priority: 60,
            enabled: false,
            description: 'Pre-cache based on usage patterns',
            condition: (req) => {
                return this.config.predictive?.enabled;
            },
            action: 'predictive-cache',
            config: {
                algorithm: 'ml-based',
                confidence: 0.8,
                maxPredictions: 10
            }
        });

        // Cache warming policy
        this.registerPolicy('cache-warming', {
            priority: 55,
            enabled: true,
            description: 'Proactively warm cache',
            condition: (req) => {
                return this.warmingConfig.enabled && this.isWarmingCandidate(req.path);
            },
            action: 'warm-cache',
            config: {
                schedule: 'interval',
                priority: 'background'
            }
        });

        // Register policy actions
        this.registerPolicyActions();
        
        this.log('info', 'Cache policies initialized');
    }

    /**
     * Registers policy actions
     * @private
     */
    registerPolicyActions() {
        // Cache response action
        this.policyActions.set('cache-response', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            const entry = {
                data: res.body,
                headers: this.extractCacheableHeaders(res.headers),
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    size: Buffer.byteLength(JSON.stringify(res.body)),
                    contentType: res.headers['content-type'],
                    encoding: res.headers['content-encoding'],
                    etag: this.generateETag(res.body),
                    tenant: req.tenant?.id,
                    user: req.user?.id
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            this.metrics.writes++;
            
            this.emit('cache:write', { key, ttl, size: entry.metadata.size });
            
            return { cached: true, key, ttl };
        });

        // Static asset caching action
        this.policyActions.set('cache-static', async (req, res, context) => {
            const key = this.generateStaticKey(req);
            const policy = context.policy;
            const ttl = policy.config.ttl;
            
            const entry = {
                data: res.body,
                headers: {
                    ...res.headers,
                    'cache-control': policy.config.immutable ? 
                        `public, max-age=${ttl / 1000}, immutable` : 
                        `public, max-age=${ttl / 1000}`
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    type: 'static',
                    immutable: policy.config.immutable
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, type: 'static' };
        });

        // Version-based caching action
        this.policyActions.set('version-cache', async (req, res, context) => {
            const version = req.headers['x-api-version'] || this.extractVersionFromPath(req.path);
            const policy = context.policy;
            
            const baseKey = this.generateCacheKey(req, context);
            const key = policy.config.separateVersions ? `${version}:${baseKey}` : baseKey;
            
            const ttlMultiplier = policy.config.ttlMultiplier[version] || 1;
            const ttl = this.calculateTTL(req, res, context) * ttlMultiplier;
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    version,
                    endpoint: req.path
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, version };
        });

        // User-specific caching action
        this.policyActions.set('user-cache', async (req, res, context) => {
            const policy = context.policy;
            
            if (policy.config.excludePaths.some(path => req.path.startsWith(path))) {
                return { cached: false, reason: 'excluded-path' };
            }
            
            const userId = req.user?.id || 'anonymous';
            const baseKey = this.generateCacheKey(req, context);
            const key = policy.config.includeUserId ? `user:${userId}:${baseKey}` : baseKey;
            
            const ttl = policy.config.ttl;
            
            const entry = {
                data: res.body,
                headers: this.filterPersonalHeaders(res.headers),
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    userId,
                    personalized: true
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, personalized: true };
        });

        // Tenant-specific caching action
        this.policyActions.set('tenant-cache', async (req, res, context) => {
            const tenantId = req.tenant.id;
            const policy = context.policy;
            
            // Check if resource is shared
            const isShared = policy.config.sharedResources.some(path => 
                req.path.startsWith(path)
            );
            
            const baseKey = this.generateCacheKey(req, context);
            const key = isShared ? baseKey : `tenant:${tenantId}:${baseKey}`;
            
            // Check tenant cache size limit
            const tenantMetrics = this.metrics.tenantMetrics.get(tenantId) || 
                                 { size: 0, entries: 0 };
            
            if (tenantMetrics.size >= this.tenantIsolation.maxTenantCacheSize) {
                await this.evictTenantCache(tenantId);
            }
            
            const ttl = this.calculateTTL(req, res, context);
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    tenantId,
                    isolated: !isShared,
                    size: Buffer.byteLength(JSON.stringify(res.body))
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            // Update tenant metrics
            tenantMetrics.size += entry.metadata.size;
            tenantMetrics.entries++;
            this.metrics.tenantMetrics.set(tenantId, tenantMetrics);
            
            return { cached: true, key, ttl, tenantId, isolated: !isShared };
        });

        // Dynamic content caching action
        this.policyActions.set('dynamic-cache', async (req, res, context) => {
            const policy = context.policy;
            
            // Filter query parameters
            const filteredQuery = {};
            for (const [key, value] of Object.entries(req.query)) {
                if (!policy.config.excludeParams.includes(key)) {
                    filteredQuery[key] = value;
                }
            }
            
            const key = this.generateDynamicKey(req, filteredQuery);
            const ttl = policy.config.ttl;
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    dynamic: true,
                    queryParams: filteredQuery
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, dynamic: true };
        });

        // Compression caching action
        this.policyActions.set('compress-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            // Compress response data
            const originalSize = Buffer.byteLength(JSON.stringify(res.body));
            const compressed = await this.compressData(res.body);
            const compressedSize = compressed.length;
            
            const entry = {
                data: compressed,
                headers: {
                    ...res.headers,
                    'content-encoding': 'gzip',
                    'x-original-size': originalSize
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    compressed: true,
                    originalSize,
                    compressedSize,
                    compressionRatio: (1 - compressedSize / originalSize) * 100
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            this.metrics.compressionSaved += (originalSize - compressedSize);
            
            return { 
                cached: true, 
                key, 
                ttl, 
                compressed: true,
                saved: originalSize - compressedSize
            };
        });

        // Edge caching action
        this.policyActions.set('edge-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    edge: true,
                    regions: this.edgeCacheConfig.regions
                }
            };
            
            // Cache locally
            await this.cacheManager.set(key, entry, ttl);
            
            // Distribute to edge locations
            if (this.edgeCacheConfig.enabled) {
                this.distributeToEdge(key, entry);
            }
            
            return { 
                cached: true, 
                key, 
                ttl, 
                edge: true,
                regions: this.edgeCacheConfig.regions
            };
        });

        // Predictive caching action
        this.policyActions.set('predictive-cache', async (req, res, context) => {
            const predictions = await this.predictNextRequests(req);
            
            for (const prediction of predictions) {
                if (prediction.confidence >= context.policy.config.confidence) {
                    this.preloadQueue.push({
                        path: prediction.path,
                        method: prediction.method,
                        priority: prediction.confidence
                    });
                }
            }
            
            // Cache current response
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    predictive: true,
                    predictions: predictions.length
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            // Start preloading
            this.processPreloadQueue();
            
            return { 
                cached: true, 
                key, 
                ttl, 
                predictive: true,
                predictions: predictions.length
            };
        });

        // Cache warming action
        this.policyActions.set('warm-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            // Add to warming queue
            this.addToWarmingQueue({
                key,
                path: req.path,
                method: req.method,
                headers: req.headers,
                priority: this.warmingConfig.priority
            });
            
            // Cache current response
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    warmed: true,
                    lastWarmed: Date.now()
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, warmed: true };
        });
    }

    /**
     * Cache strategies implementation
     */
    
    async noCacheStrategy(req, res, next) {
        // Bypass cache completely
        this.metrics.bypasses++;
        return next();
    }
    
    async cacheFirstStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.cacheManager.get(key);
        
        if (cached && !this.isStale(cached)) {
            this.metrics.hits++;
            return this.sendCachedResponse(res, cached);
        }
        
        this.metrics.misses++;
        return next();
    }
    
    async networkFirstStrategy(req, res, next) {
        try {
            // Try network first
            const response = await next();
            
            // Cache the response
            if (this.shouldCache(req, response)) {
                const key = this.generateCacheKey(req);
                await this.cacheResponse(key, response);
            }
            
            return response;
        } catch (error) {
            // Fall back to cache on network error
            const key = this.generateCacheKey(req);
            const cached = await this.cacheManager.get(key);
            
            if (cached) {
                this.metrics.hits++;
                this.log('info', 'Network failed, serving from cache', { key });
                return this.sendCachedResponse(res, cached);
            }
            
            throw error;
        }
    }
    
    async staleWhileRevalidateStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.cacheManager.get(key);
        
        if (cached) {
            this.metrics.hits++;
            
            // Serve stale content immediately
            this.sendCachedResponse(res, cached);
            
            // Revalidate in background if stale
            if (this.isStale(cached)) {
                this.revalidateInBackground(req, key);
            }
            
            return;
        }
        
        this.metrics.misses++;
        return next();
    }
    
    async cacheOnlyStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.cacheManager.get(key);
        
        if (cached) {
            this.metrics.hits++;
            return this.sendCachedResponse(res, cached);
        }
        
        this.metrics.misses++;
        res.status(504).json({
            error: 'Cache miss - network requests disabled',
            code: 'CACHE_ONLY_MISS'
        });
    }
    
    async networkOnlyStrategy(req, res, next) {
        // Always use network, never cache
        return next();
    }
    
    async cacheAndNetworkStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        
        // Send cached response immediately if available
        const cached = await this.cacheManager.get(key);
        if (cached) {
            this.metrics.hits++;
            this.sendCachedResponse(res, cached);
        }
        
        // Also fetch from network and update cache
        try {
            const response = await next();
            
            if (this.shouldCache(req, response)) {
                await this.cacheResponse(key, response);
                
                // Send update to client if supported
                if (res.push) {
                    res.push(response);
                }
            }
        } catch (error) {
            if (!cached) {
                throw error;
            }
            // Error already logged, cached response was sent
        }
    }
    
    async predictiveCacheStrategy(req, res, next) {
        // Use ML/analytics to predict and pre-cache
        const predictions = await this.predictNextRequests(req);
        
        // Pre-fetch predicted requests
        for (const prediction of predictions) {
            if (prediction.confidence > 0.7) {
                this.prefetchRequest(prediction);
            }
        }
        
        // Handle current request with cache-first
        return this.cacheFirstStrategy(req, res, next);
    }
    
    async adaptiveCacheStrategy(req, res, next) {
        // Adapt strategy based on metrics and conditions
        const metrics = this.getRecentMetrics();
        const load = this.getCurrentLoad();
        
        let strategy;
        
        if (metrics.hitRate > 0.8 && load < 0.5) {
            strategy = this.cacheFirstStrategy;
        } else if (metrics.errorRate > 0.1) {
            strategy = this.networkFirstStrategy;
        } else if (load > 0.8) {
            strategy = this.staleWhileRevalidateStrategy;
        } else {
            strategy = this.cacheFirstStrategy;
        }
        
        return strategy.call(this, req, res, next);
    }

    /**
     * Cache management methods
     */
    
    async get(key) {
        const entry = await this.cacheManager.get(key);
        
        if (!entry) {
            this.metrics.misses++;
            return null;
        }
        
        if (this.isExpired(entry)) {
            await this.cacheManager.delete(key);
            this.metrics.misses++;
            return null;
        }
        
        this.metrics.hits++;
        
        // Decompress if needed
        if (entry.metadata?.compressed) {
            entry.data = await this.decompressData(entry.data);
        }
        
        return entry;
    }
    
    async set(key, value, ttl) {
        const finalTTL = Math.min(ttl || this.defaultTTL, this.maxTTL);
        
        // Apply compression if beneficial
        let data = value.data;
        let compressed = false;
        
        if (this.shouldCompress(null, value)) {
            const compressed = await this.compressData(data);
            if (compressed.length < Buffer.byteLength(JSON.stringify(data))) {
                data = compressed;
                compressed = true;
            }
        }
        
        const entry = {
            ...value,
            data,
            metadata: {
                ...value.metadata,
                compressed,
                stored: Date.now(),
                ttl: finalTTL
            }
        };
        
        await this.cacheManager.set(key, entry, finalTTL);
        this.metrics.writes++;
        
        // Update size tracking
        this.updateCacheSize(key, entry);
        
        this.emit('cache:set', { key, ttl: finalTTL });
    }
    
    async delete(key) {
        const deleted = await this.cacheManager.delete(key);
        
        if (deleted) {
            this.metrics.deletes++;
            this.emit('cache:delete', { key });
        }
        
        return deleted;
    }
    
    async invalidate(pattern) {
        const keys = await this.cacheManager.keys(pattern);
        let count = 0;
        
        for (const key of keys) {
            if (await this.delete(key)) {
                count++;
            }
        }
        
        this.emit('cache:invalidate', { pattern, count });
        
        return count;
    }
    
    async clear() {
        const cleared = await this.cacheManager.clear();
        
        this.metrics = {
            ...this.metrics,
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            cacheSize: 0
        };
        
        this.emit('cache:clear');
        
        return cleared;
    }

    /**
     * Distributed cache coordination
     */
    
    async distributeToEdge(key, entry) {
        if (!this.distributedConfig.enabled) return;
        
        const promises = this.edgeCacheConfig.regions.map(region => 
            this.pushToRegion(region, key, entry)
        );
        
        try {
            await Promise.all(promises);
            this.log('debug', `Distributed cache to ${this.edgeCacheConfig.regions.length} regions`);
        } catch (error) {
            this.log('error', 'Failed to distribute cache', error);
        }
    }
    
    async pushToRegion(region, key, entry) {
        // Implementation would push to actual edge nodes
        // This is a placeholder for the actual implementation
        return new Promise((resolve) => {
            setTimeout(() => {
                this.log('debug', `Pushed to region: ${region}`);
                resolve();
            }, 100);
        });
    }
    
    async syncDistributedCache() {
        if (!this.distributedConfig.enabled) return;
        
        for (const node of this.distributedConfig.nodes) {
            try {
                await this.syncWithNode(node);
            } catch (error) {
                this.log('error', `Failed to sync with node ${node}`, error);
            }
        }
    }
    
    async syncWithNode(node) {
        // Implementation would sync with actual nodes
        // This is a placeholder
        return Promise.resolve();
    }

    /**
     * Cache warming and preloading
     */
    
    startCacheWarming() {
        if (!this.warmingConfig.enabled) return;
        
        setInterval(() => {
            this.warmCache();
        }, this.warmingConfig.interval);
        
        // Initial warming
        this.warmCache();
    }
    
    async warmCache() {
        const endpoints = this.warmingConfig.endpoints;
        const concurrent = this.warmingConfig.concurrent;
        
        for (let i = 0; i < endpoints.length; i += concurrent) {
            const batch = endpoints.slice(i, i + concurrent);
            
            await Promise.all(
                batch.map(endpoint => this.warmEndpoint(endpoint))
            );
        }
        
        this.emit('cache:warmed', { count: endpoints.length });
    }
    
    async warmEndpoint(endpoint) {
        try {
            const mockReq = {
                method: endpoint.method || 'GET',
                path: endpoint.path,
                headers: endpoint.headers || {},
                query: endpoint.query || {}
            };
            
            const key = this.generateCacheKey(mockReq);
            
            // Check if already cached
            const cached = await this.get(key);
            if (cached && !this.isStale(cached)) {
                return;
            }
            
            // Fetch and cache
            // This would make actual request in production
            const response = await this.fetchEndpoint(endpoint);
            await this.set(key, response, endpoint.ttl || this.defaultTTL);
            
        } catch (error) {
            this.log('error', `Failed to warm endpoint ${endpoint.path}`, error);
        }
    }
    
    async fetchEndpoint(endpoint) {
        // Placeholder for actual fetch implementation
        return {
            data: { warmed: true },
            headers: { 'content-type': 'application/json' },
            statusCode: 200
        };
    }
    
    addToWarmingQueue(item) {
        this.warmingQueue.push(item);
        
        if (!this.warmingInProgress) {
            this.processWarmingQueue();
        }
    }
    
    async processWarmingQueue() {
        if (this.warmingQueue.length === 0) {
            this.warmingInProgress = false;
            return;
        }
        
        this.warmingInProgress = true;
        const item = this.warmingQueue.shift();
        
        try {
            await this.warmEndpoint(item);
        } catch (error) {
            this.log('error', 'Warming queue processing failed', error);
        }
        
        // Continue processing
        setImmediate(() => this.processWarmingQueue());
    }

    /**
     * Helper methods
     */
    
    shouldCacheResponse(req, res) {
        // Check method
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return false;
        }
        
        // Check status code
        const cacheableStatus = [200, 203, 204, 206, 300, 301, 304];
        if (!cacheableStatus.includes(res.statusCode)) {
            return false;
        }
        
        // Check cache control headers
        const cacheControl = res.headers['cache-control'];
        if (cacheControl) {
            if (cacheControl.includes('no-store') || 
                cacheControl.includes('private')) {
                return false;
            }
        }
        
        // Check bypass conditions
        if (this.shouldBypass(req)) {
            return false;
        }
        
        return true;
    }
    
    shouldBypass(req) {
        // Check headers
        for (const header of this.bypassConfig.headers) {
            if (req.headers[header]) {
                return true;
            }
        }
        
        // Check cookies
        if (req.cookies) {
            for (const cookie of this.bypassConfig.cookies) {
                if (req.cookies[cookie]) {
                    return true;
                }
            }
        }
        
        // Check query params
        for (const param of this.bypassConfig.queryParams) {
            if (req.query?.[param]) {
                return true;
            }
        }
        
        // Check user agent
        const userAgent = req.headers['user-agent'];
        if (userAgent) {
            for (const pattern of this.bypassConfig.userAgents) {
                if (userAgent.includes(pattern)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    shouldCompress(req, res) {
        if (!this.compressionConfig.enabled) {
            return false;
        }
        
        const contentType = res?.headers?.['content-type'] || '';
        const size = res?.metadata?.size || 0;
        
        // Check content type
        const compressible = this.compressionConfig.types.some(type => 
            contentType.includes(type)
        );
        
        if (!compressible) {
            return false;
        }
        
        // Check size threshold
        if (size < this.compressionConfig.threshold) {
            return false;
        }
        
        return true;
    }
    
    async compressData(data) {
        const stringData = typeof data === 'string' ? data : JSON.stringify(data);
        return gzipAsync(stringData, { level: this.compressionConfig.level });
    }
    
    async decompressData(data) {
        const decompressed = await gunzipAsync(data);
        
        try {
            return JSON.parse(decompressed.toString());
        } catch {
            return decompressed.toString();
        }
    }
    
    generateCacheKey(req, context) {
        const generator = this.keyGenerators.get(req.path) || this.defaultKeyGenerator;
        return generator(req, context);
    }
    
    generateDefaultCacheKey(req, context) {
        const parts = [
            req.method,
            req.hostname,
            req.path,
            req.headers['x-api-version'] || 'v1'
        ];
        
        // Add query parameters if present
        if (req.query && Object.keys(req.query).length > 0) {
            const sortedQuery = Object.keys(req.query)
                .sort()
                .map(key => `${key}=${req.query[key]}`)
                .join('&');
            parts.push(sortedQuery);
        }
        
        // Add tenant if present
        if (req.tenant?.id) {
            parts.push(`tenant:${req.tenant.id}`);
        }
        
        // Add user if personalized
        if (context?.personalized && req.user?.id) {
            parts.push(`user:${req.user.id}`);
        }
        
        return crypto.createHash('sha256')
            .update(parts.join(':'))
            .digest('hex')
            .substring(0, 32);
    }
    
    generateStaticKey(req) {
        return `static:${req.path}`;
    }
    
    generateDynamicKey(req, query) {
        const queryString = Object.keys(query)
            .sort()
            .map(key => `${key}=${query[key]}`)
            .join('&');
        
        return `dynamic:${req.path}:${queryString}`;
    }
    
    generateETag(data) {
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
    }
    
    calculateTTL(req, res, context) {
        // Check for explicit cache control
        const cacheControl = res.headers?.['cache-control'];
        if (cacheControl) {
            const maxAge = this.extractMaxAge(cacheControl);
            if (maxAge) {
                return Math.min(maxAge * 1000, this.maxTTL);
            }
        }
        
        // Check for expires header
        const expires = res.headers?.expires;
        if (expires) {
            const expiresTime = new Date(expires).getTime();
            const ttl = expiresTime - Date.now();
            if (ttl > 0) {
                return Math.min(ttl, this.maxTTL);
            }
        }
        
        // Check policy-specific TTL
        if (context?.policy?.config?.ttl) {
            return context.policy.config.ttl;
        }
        
        // Check endpoint-specific TTL
        const endpointTTL = this.ttlConfigs.get(req.path);
        if (endpointTTL) {
            return endpointTTL;
        }
        
        return this.defaultTTL;
    }
    
    extractMaxAge(cacheControl) {
        const match = cacheControl.match(/max-age=(\d+)/);
        return match ? parseInt(match[1]) : null;
    }
    
    extractCacheableHeaders(headers) {
        const cacheable = [
            'content-type',
            'content-encoding',
            'content-language',
            'cache-control',
            'etag',
            'last-modified',
            'vary'
        ];
        
        const result = {};
        for (const header of cacheable) {
            if (headers[header]) {
                result[header] = headers[header];
            }
        }
        
        return result;
    }
    
    filterPersonalHeaders(headers) {
        const personal = ['set-cookie', 'authorization', 'x-user-id'];
        const filtered = { ...headers };
        
        for (const header of personal) {
            delete filtered[header];
        }
        
        return filtered;
    }
    
    isStaticAsset(path) {
        const staticExtensions = ['.js', '.css', '.jpg', '.png', '.gif', '.svg'];
        return staticExtensions.some(ext => path.endsWith(ext));
    }
    
    isEdgeCacheable(req) {
        // Check if request is suitable for edge caching
        if (req.method !== 'GET') return false;
        if (req.headers.authorization) return false;
        if (req.path.includes('/api/private')) return false;
        
        return true;
    }
    
    isWarmingCandidate(path) {
        return this.warmingConfig.endpoints.some(endpoint => 
            endpoint.path === path
        );
    }
    
    extractVersionFromPath(path) {
        const match = path.match(/\/v(\d+)\//);
        return match ? `v${match[1]}` : null;
    }
    
    isExpired(entry) {
        if (!entry.timestamp || !entry.ttl) return false;
        return Date.now() > entry.timestamp + entry.ttl;
    }
    
    isStale(entry) {
        // Check if entry is stale (past 75% of TTL)
        if (!entry.timestamp || !entry.ttl) return false;
        const age = Date.now() - entry.timestamp;
        return age > entry.ttl * 0.75;
    }
    
    async sendCachedResponse(res, cached) {
        // Set cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cached.key);
        res.set('Age', Math.floor((Date.now() - cached.timestamp) / 1000));
        
        if (cached.headers) {
            for (const [key, value] of Object.entries(cached.headers)) {
                res.set(key, value);
            }
        }
        
        if (cached.metadata?.etag) {
            res.set('ETag', cached.metadata.etag);
        }
        
        res.status(cached.statusCode || 200);
        res.send(cached.data);
    }
    
    async revalidateInBackground(req, key) {
        // Fetch fresh data in background
        setImmediate(async () => {
            try {
                // This would make actual request in production
                const fresh = await this.fetchEndpoint(req);
                await this.set(key, fresh, this.calculateTTL(req, fresh));
                
                this.emit('cache:revalidated', { key });
            } catch (error) {
                this.log('error', 'Background revalidation failed', { key, error });
            }
        });
    }
    
    async predictNextRequests(req) {
        // Simplified prediction logic
        // In production, this would use ML models or analytics
        
        const predictions = [];
        
        // Predict based on common patterns
        if (req.path.includes('/api/users/')) {
            predictions.push({
                path: req.path + '/profile',
                method: 'GET',
                confidence: 0.8
            });
            predictions.push({
                path: req.path + '/settings',
                method: 'GET',
                confidence: 0.6
            });
        }
        
        return predictions;
    }
    
    async prefetchRequest(prediction) {
        try {
            const mockReq = {
                method: prediction.method,
                path: prediction.path,
                headers: {}
            };
            
            const key = this.generateCacheKey(mockReq);
            
            // Check if already cached
            const cached = await this.get(key);
            if (cached && !this.isStale(cached)) {
                return;
            }
            
            // Fetch and cache
            const response = await this.fetchEndpoint(prediction);
            await this.set(key, response, this.defaultTTL);
            
        } catch (error) {
            this.log('error', 'Prefetch failed', { prediction, error });
        }
    }
    
    async evictTenantCache(tenantId) {
        const pattern = `tenant:${tenantId}:*`;
        const count = await this.invalidate(pattern);
        
        // Reset tenant metrics
        this.metrics.tenantMetrics.set(tenantId, { size: 0, entries: 0 });
        
        this.log('info', `Evicted ${count} cache entries for tenant ${tenantId}`);
    }
    
    updateCacheSize(key, entry) {
        const size = Buffer.byteLength(JSON.stringify(entry));
        this.metrics.cacheSize += size;
        
        // Track per-key metadata
        this.entryMetadata.set(key, {
            size,
            created: Date.now(),
            accessed: Date.now(),
            hits: 0
        });
    }
    
    async processPreloadQueue() {
        if (this.preloadInProgress || this.preloadQueue.length === 0) {
            return;
        }
        
        this.preloadInProgress = true;
        
        // Sort by priority
        this.preloadQueue.sort((a, b) => b.priority - a.priority);
        
        // Process top items
        const batch = this.preloadQueue.splice(0, 5);
        
        await Promise.all(
            batch.map(item => this.warmEndpoint(item))
        );
        
        this.preloadInProgress = false;
        
        // Continue if more items
        if (this.preloadQueue.length > 0) {
            setImmediate(() => this.processPreloadQueue());
        }
    }
    
    getRecentMetrics() {
        const recentHits = this.metrics.hits;
        const recentTotal = this.metrics.hits + this.metrics.misses;
        
        return {
            hitRate: recentTotal > 0 ? recentHits / recentTotal : 0,
            errorRate: this.metrics.errors / Math.max(recentTotal, 1),
            avgResponseTime: this.calculateAverageResponseTime()
        };
    }
    
    calculateAverageResponseTime() {
        if (this.responseTimeBuffer.length === 0) return 0;
        
        const sum = this.responseTimeBuffer.reduce((a, b) => a + b, 0);
        return sum / this.responseTimeBuffer.length;
    }
    
    recordResponseTime(time) {
        this.responseTimeBuffer.push(time);
        
        if (this.responseTimeBuffer.length > this.responseTimeBufferSize) {
            this.responseTimeBuffer.shift();
        }
        
        this.metrics.avgResponseTime = this.calculateAverageResponseTime();
    }
    
    getCurrentLoad() {
        // Simplified load calculation
        // In production, would use actual system metrics
        return Math.random();
    }
    
    startBackgroundTasks() {
        // Start cache warming
        this.startCacheWarming();
        
        // Start metrics calculation
        setInterval(() => {
            this.calculateMetrics();
        }, 10000);
        
        // Start distributed sync
        if (this.distributedConfig.enabled) {
            setInterval(() => {
                this.syncDistributedCache();
            }, this.edgeCacheConfig.syncInterval);
        }
        
        // Start cache cleanup
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 60000);
    }
    
    calculateMetrics() {
        const total = this.metrics.hits + this.metrics.misses;
        this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
    }
    
    async cleanupExpiredEntries() {
        const keys = await this.cacheManager.keys('*');
        let cleaned = 0;
        
        for (const key of keys) {
            const entry = await this.cacheManager.get(key);
            
            if (entry && this.isExpired(entry)) {
                await this.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.log('info', `Cleaned up ${cleaned} expired cache entries`);
        }
    }

    /**
     * Policy management
     */
    
    registerPolicy(name, policy) {
        policy.name = name;
        this.policies.set(name, policy);
    }
    
    enablePolicy(name) {
        const policy = this.policies.get(name);
        if (policy) {
            policy.enabled = true;
        }
    }
    
    disablePolicy(name) {
        const policy = this.policies.get(name);
        if (policy) {
            policy.enabled = false;
        }
    }
    
    updatePolicy(name, updates) {
        const policy = this.policies.get(name);
        if (policy) {
            Object.assign(policy, updates);
        }
    }

    /**
     * Gets cache metrics
     * @returns {Object} Cache metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            policies: {
                total: this.policies.size,
                enabled: Array.from(this.policies.values()).filter(p => p.enabled).length
            },
            strategies: Object.keys(this.strategies),
            warming: {
                enabled: this.warmingConfig.enabled,
                queueSize: this.warmingQueue?.length || 0
            },
            edge: {
                enabled: this.edgeCacheConfig.enabled,
                regions: this.edgeCacheConfig.regions
            }
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
}

module.exports = CachePolicies;