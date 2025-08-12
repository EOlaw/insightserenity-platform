'use strict';

/**
 * @fileoverview Cache Policy Engine - Advanced cache strategy enforcement for API Gateway
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
 * CachePolicyEngine class implements comprehensive cache management policies for the API Gateway.
 * It provides cache strategy enforcement, invalidation rules, TTL management, compression,
 * edge caching, cache warming, tenant isolation, and distributed cache coordination.
 */
class CachePolicyEngine extends EventEmitter {
    /**
     * Creates an instance of CachePolicyEngine
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
        this.minTTL = config.minTTL || 1000; // 1 second
        
        // Cache invalidation rules
        this.invalidationRules = new Map();
        this.invalidationPatterns = new Map();
        this.invalidationQueue = [];
        this.invalidationWorkers = config.invalidationWorkers || 3;
        
        // Cache warming configuration
        this.warmingConfig = {
            enabled: config.warming?.enabled || false,
            interval: config.warming?.interval || 300000, // 5 minutes
            concurrent: config.warming?.concurrent || 5,
            endpoints: config.warming?.endpoints || [],
            priority: config.warming?.priority || 'low',
            preloadDepth: config.warming?.preloadDepth || 1
        };
        
        // Cache warming queue
        this.warmingQueue = [];
        this.warmingInProgress = false;
        
        // Edge caching configuration
        this.edgeCacheConfig = {
            enabled: config.edgeCache?.enabled || false,
            regions: config.edgeCache?.regions || ['us-east-1'],
            syncInterval: config.edgeCache?.syncInterval || 60000,
            maxSize: config.edgeCache?.maxSize || 100 * 1024 * 1024, // 100MB
            replicationStrategy: config.edgeCache?.replicationStrategy || 'async'
        };
        
        // Compression configuration
        this.compressionConfig = {
            enabled: config.compression?.enabled !== false,
            threshold: config.compression?.threshold || 1024, // 1KB
            level: config.compression?.level || 6,
            types: config.compression?.types || ['text/html', 'application/json', 'text/plain', 'application/xml'],
            algorithms: config.compression?.algorithms || ['gzip', 'deflate']
        };
        
        // Tenant isolation configuration
        this.tenantIsolation = {
            enabled: config.tenantIsolation?.enabled !== false,
            sharedCache: config.tenantIsolation?.sharedCache || false,
            maxTenantCacheSize: config.tenantIsolation?.maxSize || 10 * 1024 * 1024, // 10MB
            isolation: config.tenantIsolation?.isolation || 'strict'
        };
        
        // Cache headers configuration
        this.cacheHeaders = {
            respectCacheControl: config.headers?.respectCacheControl !== false,
            respectExpires: config.headers?.respectExpires !== false,
            addETag: config.headers?.addETag !== false,
            addLastModified: config.headers?.addLastModified !== false,
            addVary: config.headers?.addVary !== false,
            maxAge: config.headers?.maxAge || 3600
        };
        
        // Cache bypass configuration
        this.bypassConfig = {
            headers: config.bypass?.headers || ['x-cache-bypass', 'x-no-cache'],
            cookies: config.bypass?.cookies || ['no-cache'],
            queryParams: config.bypass?.queryParams || ['nocache', 'bypass-cache'],
            userAgents: config.bypass?.userAgents || [],
            methods: config.bypass?.methods || []
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
            tenantMetrics: new Map(),
            strategyMetrics: new Map(),
            invalidations: 0,
            warmingRequests: 0
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
            consistencyLevel: config.distributed?.consistencyLevel || 'eventual',
            conflictResolution: config.distributed?.conflictResolution || 'timestamp'
        };
        
        // Cache preloading
        this.preloadQueue = [];
        this.preloadInProgress = false;
        
        // Cache versioning
        this.versioningConfig = {
            enabled: config.versioning?.enabled || false,
            strategy: config.versioning?.strategy || 'timestamp',
            maxVersions: config.versioning?.maxVersions || 5
        };
        
        // Smart cache configuration
        this.smartCache = {
            enabled: config.smartCache?.enabled || false,
            learningRate: config.smartCache?.learningRate || 0.1,
            adaptiveTTL: config.smartCache?.adaptiveTTL || false,
            predictiveInvalidation: config.smartCache?.predictiveInvalidation || false
        };
        
        // Background tasks
        this.backgroundTasks = new Map();
        
        // Cache patterns
        this.cachePatterns = new Map();
        
        // Access patterns tracking
        this.accessPatterns = new Map();
        
        // Cache topology
        this.cacheTopology = {
            l1: new Map(), // Memory cache
            l2: new Map(), // Local SSD cache
            l3: new Map()  // Distributed cache
        };
        
        // Initialization state
        this.isInitialized = false;
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Initializes the cache policy engine
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('warn', 'Cache policy engine already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing cache policy engine');

            // Initialize policies
            await this.initializePolicies();
            
            // Initialize cache strategies
            await this.initializeCacheStrategies();
            
            // Initialize cache warming
            if (this.warmingConfig.enabled) {
                await this.initializeCacheWarming();
            }
            
            // Initialize distributed cache
            if (this.distributedConfig.enabled) {
                await this.initializeDistributedCache();
            }
            
            // Initialize smart cache features
            if (this.smartCache.enabled) {
                await this.initializeSmartCache();
            }
            
            // Start background tasks
            await this.startBackgroundTasks();
            
            this.isInitialized = true;
            this.log('info', 'Cache policy engine initialized successfully');
            
        } catch (error) {
            this.log('error', 'Failed to initialize cache policy engine', error);
            throw error;
        }
    }

    /**
     * Sets up event handlers
     * @private
     */
    setupEventHandlers() {
        // Cache manager events
        if (this.cacheManager) {
            this.cacheManager.on('cache:hit', (data) => {
                this.onCacheHit(data);
            });
            
            this.cacheManager.on('cache:miss', (data) => {
                this.onCacheMiss(data);
            });
            
            this.cacheManager.on('cache:error', (error) => {
                this.onCacheError(error);
            });
        }
        
        // Policy engine events
        this.on('cache:set', (data) => {
            this.updateCacheMetrics('write', data);
        });
        
        this.on('cache:delete', (data) => {
            this.updateCacheMetrics('delete', data);
        });
        
        this.on('cache:invalidate', (data) => {
            this.updateCacheMetrics('invalidate', data);
        });
    }

    /**
     * Initializes cache policies
     * @private
     * @async
     */
    async initializePolicies() {
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
                contentTypes: ['application/json', 'text/html', 'text/plain', 'application/xml'],
                excludePaths: ['/api/auth', '/api/private'],
                includeHeaders: ['content-type', 'etag', 'last-modified']
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
                extensions: ['.js', '.css', '.jpg', '.png', '.gif', '.svg', '.woff', '.woff2', '.ico'],
                versionedAssets: true,
                fingerprinting: true
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
                ttlMultiplier: { v1: 1, v2: 1.5, v3: 2 },
                backwardCompatibility: true,
                deprecationWarnings: true
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
                ttl: 60000, // 1 minute
                sessionBased: true,
                roleBased: true
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
                isolationLevel: this.tenantIsolation.isolation,
                sharedResources: ['/api/common'],
                tenantHeader: 'x-tenant-id',
                quotaManagement: true,
                crossTenantPrevention: true
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
                excludeParams: ['timestamp', '_', 'nocache'],
                ttl: 30000, // 30 seconds
                normalization: true,
                parameterHashing: true
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
                minSize: this.compressionConfig.threshold,
                algorithms: this.compressionConfig.algorithms,
                contentTypes: this.compressionConfig.types,
                adaptive: true
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
                regions: this.edgeCacheConfig.regions,
                syncStrategy: this.edgeCacheConfig.replicationStrategy,
                priorityContent: ['static', 'api'],
                geoOptimization: true
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
                maxPredictions: 10,
                learningWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
                patternRecognition: true
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
                priority: 'background',
                dependencies: true,
                healthCheck: true
            }
        });

        // Conditional caching policy
        this.registerPolicy('conditional-caching', {
            priority: 75,
            enabled: true,
            description: 'ETags and conditional requests',
            condition: (req) => {
                return req.headers['if-none-match'] || req.headers['if-modified-since'];
            },
            action: 'conditional-cache',
            config: {
                etagSupport: true,
                lastModifiedSupport: true,
                weakValidation: true,
                strongValidation: false
            }
        });

        // Multi-tier caching policy
        this.registerPolicy('multi-tier-caching', {
            priority: 85,
            enabled: true,
            description: 'Multi-level cache hierarchy',
            condition: (req) => {
                return this.config.multiTier?.enabled;
            },
            action: 'multi-tier-cache',
            config: {
                l1Config: { ttl: 60000, maxSize: 50 * 1024 * 1024 }, // 50MB
                l2Config: { ttl: 300000, maxSize: 500 * 1024 * 1024 }, // 500MB
                l3Config: { ttl: 3600000, maxSize: 5 * 1024 * 1024 * 1024 }, // 5GB
                promotionStrategy: 'lru'
            }
        });

        // Register policy actions
        await this.registerPolicyActions();
        
        this.log('info', 'Cache policies initialized');
    }

    /**
     * Registers policy actions
     * @private
     * @async
     */
    async registerPolicyActions() {
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
                    user: req.user?.id,
                    version: this.extractVersion(req),
                    accessCount: 0
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            this.metrics.writes++;
            
            this.emit('cache:set', { key, ttl, size: entry.metadata.size });
            
            return { cached: true, key, ttl, strategy: 'response-cache' };
        });

        // Static asset caching action
        this.policyActions.set('cache-static', async (req, res, context) => {
            const key = this.generateStaticKey(req);
            const policy = context.policy;
            const ttl = policy.config.ttl;
            
            // Check if asset is versioned/fingerprinted
            const isVersioned = policy.config.versionedAssets && 
                               (req.path.includes('-') || req.query.v);
            
            const entry = {
                data: res.body,
                headers: {
                    ...res.headers,
                    'cache-control': policy.config.immutable && isVersioned ? 
                        `public, max-age=${ttl / 1000}, immutable` : 
                        `public, max-age=${ttl / 1000}`,
                    'x-cache-type': 'static'
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    type: 'static',
                    immutable: policy.config.immutable && isVersioned,
                    fingerprinted: isVersioned,
                    extension: this.getFileExtension(req.path)
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, type: 'static', immutable: entry.metadata.immutable };
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
                headers: {
                    ...res.headers,
                    'x-api-version': version,
                    'x-cache-version': version
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    version,
                    endpoint: req.path,
                    backwardCompatible: policy.config.backwardCompatibility
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            // Add deprecation warning if needed
            if (policy.config.deprecationWarnings && this.isDeprecatedVersion(version)) {
                entry.headers['x-api-deprecation-warning'] = `Version ${version} is deprecated`;
            }
            
            return { cached: true, key, ttl, version, strategy: 'version-cache' };
        });

        // User-specific caching action
        this.policyActions.set('user-cache', async (req, res, context) => {
            const policy = context.policy;
            
            if (policy.config.excludePaths.some(path => req.path.startsWith(path))) {
                return { cached: false, reason: 'excluded-path' };
            }
            
            const userId = req.user?.id || 'anonymous';
            const userRole = req.user?.role || 'guest';
            
            const baseKey = this.generateCacheKey(req, context);
            let key = baseKey;
            
            if (policy.config.includeUserId) {
                key = `user:${userId}:${baseKey}`;
            }
            
            if (policy.config.roleBased) {
                key = `role:${userRole}:${key}`;
            }
            
            const ttl = policy.config.ttl;
            
            const entry = {
                data: res.body,
                headers: this.filterPersonalHeaders(res.headers),
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    userId,
                    userRole,
                    personalized: true,
                    sessionBased: policy.config.sessionBased
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, personalized: true, userId, userRole };
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
            
            // Check tenant cache quota
            if (policy.config.quotaManagement) {
                const tenantMetrics = this.metrics.tenantMetrics.get(tenantId) || 
                                     { size: 0, entries: 0 };
                
                if (tenantMetrics.size >= this.tenantIsolation.maxTenantCacheSize) {
                    await this.evictTenantCache(tenantId);
                }
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
                    size: Buffer.byteLength(JSON.stringify(res.body)),
                    isolationLevel: policy.config.isolationLevel
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            // Update tenant metrics
            this.updateTenantMetrics(tenantId, entry.metadata.size, 1);
            
            return { cached: true, key, ttl, tenantId, isolated: !isShared };
        });

        // Dynamic content caching action
        this.policyActions.set('dynamic-cache', async (req, res, context) => {
            const policy = context.policy;
            
            // Filter and normalize query parameters
            const filteredQuery = this.normalizeQueryParams(req.query, policy.config);
            
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
                    queryParams: filteredQuery,
                    normalized: policy.config.normalization,
                    parameterHash: policy.config.parameterHashing ? 
                        this.hashObject(filteredQuery) : null
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, dynamic: true, queryParams: filteredQuery };
        });

        // Compression caching action
        this.policyActions.set('compress-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            
            // Choose best compression algorithm
            const algorithm = this.selectCompressionAlgorithm(req, res);
            
            // Compress response data
            const originalSize = Buffer.byteLength(JSON.stringify(res.body));
            const compressed = await this.compressData(res.body, algorithm);
            const compressedSize = compressed.length;
            
            const entry = {
                data: compressed,
                headers: {
                    ...res.headers,
                    'content-encoding': algorithm,
                    'x-original-size': originalSize,
                    'x-compression-ratio': ((1 - compressedSize / originalSize) * 100).toFixed(2) + '%'
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    compressed: true,
                    algorithm,
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
                algorithm,
                saved: originalSize - compressedSize
            };
        });

        // Edge caching action
        this.policyActions.set('edge-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            const policy = context.policy;
            
            // Determine optimal regions based on geo optimization
            const regions = policy.config.geoOptimization ? 
                this.selectOptimalRegions(req) : policy.config.regions;
            
            const entry = {
                data: res.body,
                headers: {
                    ...res.headers,
                    'x-edge-cache': 'true',
                    'x-edge-regions': regions.join(',')
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    edge: true,
                    regions,
                    syncStrategy: policy.config.syncStrategy,
                    priority: this.calculateCachePriority(req, res)
                }
            };
            
            // Cache locally first
            await this.cacheManager.set(key, entry, ttl);
            
            // Distribute to edge locations
            if (this.edgeCacheConfig.enabled) {
                this.distributeToEdge(key, entry, regions);
            }
            
            return { 
                cached: true, 
                key, 
                ttl, 
                edge: true,
                regions,
                priority: entry.metadata.priority
            };
        });

        // Predictive caching action
        this.policyActions.set('predictive-cache', async (req, res, context) => {
            const predictions = await this.predictNextRequests(req);
            const policy = context.policy;
            
            // Filter predictions by confidence
            const highConfidencePredictions = predictions.filter(p => 
                p.confidence >= policy.config.confidence
            );
            
            for (const prediction of highConfidencePredictions.slice(0, policy.config.maxPredictions)) {
                this.preloadQueue.push({
                    path: prediction.path,
                    method: prediction.method,
                    headers: prediction.headers || {},
                    priority: prediction.confidence,
                    source: 'predictive'
                });
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
                    predictions: highConfidencePredictions.length,
                    totalPredictions: predictions.length,
                    pattern: this.identifyAccessPattern(req)
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            // Start preloading if not already running
            this.processPreloadQueue();
            
            return { 
                cached: true, 
                key, 
                ttl, 
                predictive: true,
                predictions: highConfidencePredictions.length
            };
        });

        // Cache warming action
        this.policyActions.set('warm-cache', async (req, res, context) => {
            const key = this.generateCacheKey(req, context);
            const ttl = this.calculateTTL(req, res, context);
            const policy = context.policy;
            
            // Add to warming queue for future warming
            this.addToWarmingQueue({
                key,
                path: req.path,
                method: req.method,
                headers: req.headers,
                priority: this.warmingConfig.priority,
                dependencies: policy.config.dependencies ? 
                    this.identifyDependencies(req) : []
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
                    lastWarmed: Date.now(),
                    warmingPriority: this.warmingConfig.priority,
                    dependencies: policy.config.dependencies
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, warmed: true };
        });

        // Conditional caching action
        this.policyActions.set('conditional-cache', async (req, res, context) => {
            const policy = context.policy;
            const ifNoneMatch = req.headers['if-none-match'];
            const ifModifiedSince = req.headers['if-modified-since'];
            
            const key = this.generateCacheKey(req, context);
            const existingEntry = await this.cacheManager.get(key);
            
            if (existingEntry) {
                // Check ETag
                if (policy.config.etagSupport && ifNoneMatch) {
                    const currentETag = existingEntry.metadata?.etag;
                    if (currentETag && ifNoneMatch === currentETag) {
                        return { 
                            notModified: true, 
                            statusCode: 304,
                            etag: currentETag
                        };
                    }
                }
                
                // Check Last-Modified
                if (policy.config.lastModifiedSupport && ifModifiedSince) {
                    const lastModified = new Date(existingEntry.timestamp);
                    const ifModifiedSinceDate = new Date(ifModifiedSince);
                    
                    if (lastModified <= ifModifiedSinceDate) {
                        return { 
                            notModified: true, 
                            statusCode: 304,
                            lastModified: lastModified.toUTCString()
                        };
                    }
                }
            }
            
            // Cache new response with conditional headers
            const ttl = this.calculateTTL(req, res, context);
            const etag = this.generateETag(res.body);
            
            const entry = {
                data: res.body,
                headers: {
                    ...res.headers,
                    'etag': etag,
                    'last-modified': new Date().toUTCString(),
                    'cache-control': `max-age=${ttl / 1000}`
                },
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    etag,
                    conditional: true,
                    validationType: policy.config.strongValidation ? 'strong' : 'weak'
                }
            };
            
            await this.cacheManager.set(key, entry, ttl);
            
            return { cached: true, key, ttl, conditional: true, etag };
        });

        // Multi-tier caching action
        this.policyActions.set('multi-tier-cache', async (req, res, context) => {
            const policy = context.policy;
            const key = this.generateCacheKey(req, context);
            
            // Determine which tier this should be cached in
            const tier = this.determineCacheTier(req, res, policy.config);
            const ttl = this.calculateTierTTL(tier, policy.config);
            
            const entry = {
                data: res.body,
                headers: res.headers,
                statusCode: res.statusCode,
                timestamp: Date.now(),
                ttl,
                metadata: {
                    tier,
                    multiTier: true,
                    size: Buffer.byteLength(JSON.stringify(res.body)),
                    accessFrequency: this.getAccessFrequency(key)
                }
            };
            
            // Cache in appropriate tier
            await this.cacheInTier(tier, key, entry, ttl);
            
            // Promote to higher tier if access frequency warrants it
            if (this.shouldPromoteToHigherTier(entry.metadata)) {
                await this.promoteToHigherTier(key, entry);
            }
            
            return { 
                cached: true, 
                key, 
                ttl, 
                tier,
                multiTier: true,
                accessFrequency: entry.metadata.accessFrequency
            };
        });
    }

    /**
     * Cache strategy implementations
     */
    
    async noCacheStrategy(req, res, next) {
        // Bypass cache completely
        this.metrics.bypasses++;
        this.updateStrategyMetrics('no-cache');
        return next();
    }
    
    async cacheFirstStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.get(key);
        
        if (cached && !this.isStale(cached)) {
            this.metrics.hits++;
            this.updateStrategyMetrics('cache-first', true);
            return this.sendCachedResponse(res, cached);
        }
        
        this.metrics.misses++;
        this.updateStrategyMetrics('cache-first', false);
        return next();
    }
    
    async networkFirstStrategy(req, res, next) {
        try {
            // Try network first
            const response = await next();
            
            // Cache the response if successful
            if (this.shouldCache(req, response)) {
                const key = this.generateCacheKey(req);
                await this.cacheResponse(key, response);
            }
            
            this.updateStrategyMetrics('network-first', true);
            return response;
        } catch (error) {
            // Fall back to cache on network error
            const key = this.generateCacheKey(req);
            const cached = await this.get(key);
            
            if (cached) {
                this.metrics.hits++;
                this.updateStrategyMetrics('network-first', true);
                this.log('info', 'Network failed, serving from cache', { key, error: error.message });
                return this.sendCachedResponse(res, cached);
            }
            
            this.updateStrategyMetrics('network-first', false);
            throw error;
        }
    }
    
    async staleWhileRevalidateStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.get(key);
        
        if (cached) {
            this.metrics.hits++;
            this.updateStrategyMetrics('stale-while-revalidate', true);
            
            // Serve stale content immediately
            this.sendCachedResponse(res, cached);
            
            // Revalidate in background if stale
            if (this.isStale(cached)) {
                this.revalidateInBackground(req, key);
            }
            
            return;
        }
        
        this.metrics.misses++;
        this.updateStrategyMetrics('stale-while-revalidate', false);
        return next();
    }
    
    async cacheOnlyStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        const cached = await this.get(key);
        
        if (cached) {
            this.metrics.hits++;
            this.updateStrategyMetrics('cache-only', true);
            return this.sendCachedResponse(res, cached);
        }
        
        this.metrics.misses++;
        this.updateStrategyMetrics('cache-only', false);
        res.status(504).json({
            error: 'Cache miss - network requests disabled',
            code: 'CACHE_ONLY_MISS',
            strategy: 'cache-only'
        });
    }
    
    async networkOnlyStrategy(req, res, next) {
        // Always use network, never cache
        this.updateStrategyMetrics('network-only');
        return next();
    }
    
    async cacheAndNetworkStrategy(req, res, next) {
        const key = this.generateCacheKey(req);
        
        // Send cached response immediately if available
        const cached = await this.get(key);
        if (cached) {
            this.metrics.hits++;
            this.updateStrategyMetrics('cache-and-network', true);
            this.sendCachedResponse(res, cached);
        }
        
        // Also fetch from network and update cache
        try {
            const response = await next();
            
            if (this.shouldCache(req, response)) {
                await this.cacheResponse(key, response);
                
                // Send update to client if supported (Server-Sent Events, WebSocket, etc.)
                if (res.push && typeof res.push === 'function') {
                    res.push(response);
                }
            }
        } catch (error) {
            if (!cached) {
                this.updateStrategyMetrics('cache-and-network', false);
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
        this.updateStrategyMetrics('predictive');
        return this.cacheFirstStrategy(req, res, next);
    }
    
    async adaptiveCacheStrategy(req, res, next) {
        // Adapt strategy based on metrics and conditions
        const metrics = this.getRecentMetrics();
        const load = this.getCurrentLoad();
        const networkLatency = this.getNetworkLatency();
        
        let strategy;
        
        if (metrics.hitRate > 0.8 && load < 0.5) {
            strategy = this.cacheFirstStrategy;
        } else if (metrics.errorRate > 0.1 || networkLatency > 1000) {
            strategy = this.staleWhileRevalidateStrategy;
        } else if (load > 0.8) {
            strategy = this.cacheFirstStrategy;
        } else if (networkLatency < 100) {
            strategy = this.networkFirstStrategy;
        } else {
            strategy = this.cacheFirstStrategy;
        }
        
        this.updateStrategyMetrics('adaptive');
        return strategy.call(this, req, res, next);
    }

    /**
     * Cache management methods
     */
    
    async get(key) {
        try {
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
            
            // Update access patterns
            this.updateAccessPattern(key);
            
            // Decompress if needed
            if (entry.metadata?.compressed) {
                entry.data = await this.decompressData(entry.data, entry.metadata.algorithm);
            }
            
            return entry;
        } catch (error) {
            this.metrics.errors++;
            this.log('error', 'Cache get error', { key, error: error.message });
            return null;
        }
    }
    
    async set(key, value, ttl) {
        try {
            const finalTTL = Math.min(Math.max(ttl || this.defaultTTL, this.minTTL), this.maxTTL);
            
            // Apply compression if beneficial
            let data = value.data;
            let compressed = false;
            let algorithm = null;
            
            if (this.shouldCompress(null, value)) {
                algorithm = this.selectCompressionAlgorithm(null, value);
                const compressedData = await this.compressData(data, algorithm);
                
                if (compressedData.length < Buffer.byteLength(JSON.stringify(data))) {
                    data = compressedData;
                    compressed = true;
                }
            }
            
            const entry = {
                ...value,
                data,
                metadata: {
                    ...value.metadata,
                    compressed,
                    algorithm,
                    stored: Date.now(),
                    ttl: finalTTL,
                    version: this.generateVersion()
                }
            };
            
            await this.cacheManager.set(key, entry, finalTTL);
            this.metrics.writes++;
            
            // Update size tracking
            this.updateCacheSize(key, entry);
            
            // Track access patterns
            this.initializeAccessPattern(key);
            
            this.emit('cache:set', { key, ttl: finalTTL });
            
            return true;
        } catch (error) {
            this.metrics.errors++;
            this.log('error', 'Cache set error', { key, error: error.message });
            return false;
        }
    }
    
    async delete(key) {
        try {
            const deleted = await this.cacheManager.delete(key);
            
            if (deleted) {
                this.metrics.deletes++;
                this.cleanupAccessPattern(key);
                this.emit('cache:delete', { key });
            }
            
            return deleted;
        } catch (error) {
            this.metrics.errors++;
            this.log('error', 'Cache delete error', { key, error: error.message });
            return false;
        }
    }
    
    async invalidate(pattern) {
        try {
            const keys = await this.cacheManager.keys(pattern);
            let count = 0;
            
            // Process invalidation in batches
            const batchSize = 100;
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                const promises = batch.map(key => this.delete(key));
                const results = await Promise.all(promises);
                count += results.filter(result => result).length;
            }
            
            this.metrics.invalidations++;
            this.emit('cache:invalidate', { pattern, count });
            
            return count;
        } catch (error) {
            this.metrics.errors++;
            this.log('error', 'Cache invalidate error', { pattern, error: error.message });
            return 0;
        }
    }
    
    async clear() {
        try {
            const cleared = await this.cacheManager.clear();
            
            // Reset metrics
            this.metrics = {
                ...this.metrics,
                hits: 0,
                misses: 0,
                writes: 0,
                deletes: 0,
                cacheSize: 0
            };
            
            // Clear access patterns
            this.accessPatterns.clear();
            this.entryMetadata.clear();
            
            this.emit('cache:clear');
            
            return cleared;
        } catch (error) {
            this.metrics.errors++;
            this.log('error', 'Cache clear error', { error: error.message });
            return false;
        }
    }

    /**
     * Initialization methods
     */
    
    async initializeCacheStrategies() {
        // Initialize strategy metrics
        for (const strategyName of Object.keys(this.strategies)) {
            this.metrics.strategyMetrics.set(strategyName, {
                hits: 0,
                misses: 0,
                errors: 0,
                totalRequests: 0
            });
        }
        
        this.log('info', 'Cache strategies initialized');
    }
    
    async initializeCacheWarming() {
        // Start cache warming if enabled
        this.startCacheWarming();
        
        // Initialize warming queue processing
        this.processWarmingQueue();
        
        this.log('info', 'Cache warming initialized');
    }
    
    async initializeDistributedCache() {
        // Initialize distributed cache coordination
        if (this.distributedConfig.nodes.length > 0) {
            for (const node of this.distributedConfig.nodes) {
                try {
                    await this.connectToNode(node);
                } catch (error) {
                    this.log('error', `Failed to connect to cache node: ${node}`, error);
                }
            }
        }
        
        this.log('info', 'Distributed cache initialized');
    }
    
    async initializeSmartCache() {
        // Initialize machine learning components for smart caching
        this.smartCacheModel = this.createSmartCacheModel();
        
        // Start adaptive TTL if enabled
        if (this.smartCache.adaptiveTTL) {
            this.startAdaptiveTTL();
        }
        
        // Start predictive invalidation if enabled
        if (this.smartCache.predictiveInvalidation) {
            this.startPredictiveInvalidation();
        }
        
        this.log('info', 'Smart cache features initialized');
    }
    
    async startBackgroundTasks() {
        // Cache cleanup
        this.backgroundTasks.set('cache-cleanup', setInterval(() => {
            this.cleanupExpiredEntries();
        }, 60000)); // Every minute
        
        // Metrics calculation
        this.backgroundTasks.set('metrics-calculation', setInterval(() => {
            this.calculateMetrics();
        }, 10000)); // Every 10 seconds
        
        // Distributed sync
        if (this.distributedConfig.enabled) {
            this.backgroundTasks.set('distributed-sync', setInterval(() => {
                this.syncDistributedCache();
            }, this.edgeCacheConfig.syncInterval));
        }
        
        // Access pattern analysis
        this.backgroundTasks.set('pattern-analysis', setInterval(() => {
            this.analyzeAccessPatterns();
        }, 300000)); // Every 5 minutes
        
        // Smart cache learning
        if (this.smartCache.enabled) {
            this.backgroundTasks.set('smart-cache-learning', setInterval(() => {
                this.updateSmartCacheModel();
            }, 600000)); // Every 10 minutes
        }
        
        this.log('info', 'Background tasks started');
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
        const cacheControl = res.headers?.['cache-control'];
        if (cacheControl) {
            if (cacheControl.includes('no-store') || 
                cacheControl.includes('private') ||
                cacheControl.includes('no-cache')) {
                return false;
            }
        }
        
        // Check bypass conditions
        if (this.shouldBypass(req)) {
            return false;
        }
        
        // Check content type
        const contentType = res.headers?.['content-type'];
        if (contentType && contentType.includes('multipart/')) {
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
        
        // Check methods
        if (this.bypassConfig.methods.includes(req.method)) {
            return true;
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
        
        // Check if already compressed
        if (res?.headers?.['content-encoding']) {
            return false;
        }
        
        return true;
    }
    
    selectCompressionAlgorithm(req, res) {
        const acceptEncoding = req?.headers?.['accept-encoding'] || '';
        const availableAlgorithms = this.compressionConfig.algorithms;
        
        // Prefer gzip if available
        if (acceptEncoding.includes('gzip') && availableAlgorithms.includes('gzip')) {
            return 'gzip';
        }
        
        // Fall back to deflate
        if (acceptEncoding.includes('deflate') && availableAlgorithms.includes('deflate')) {
            return 'deflate';
        }
        
        // Default to first available algorithm
        return availableAlgorithms[0] || 'gzip';
    }
    
    async compressData(data, algorithm = 'gzip') {
        const stringData = typeof data === 'string' ? data : JSON.stringify(data);
        
        switch (algorithm) {
            case 'gzip':
                return gzipAsync(stringData, { level: this.compressionConfig.level });
            case 'deflate':
                return promisify(zlib.deflate)(stringData, { level: this.compressionConfig.level });
            default:
                return gzipAsync(stringData, { level: this.compressionConfig.level });
        }
    }
    
    async decompressData(data, algorithm = 'gzip') {
        try {
            let decompressed;
            
            switch (algorithm) {
                case 'gzip':
                    decompressed = await gunzipAsync(data);
                    break;
                case 'deflate':
                    decompressed = await promisify(zlib.inflate)(data);
                    break;
                default:
                    decompressed = await gunzipAsync(data);
            }
            
            const result = decompressed.toString();
            
            try {
                return JSON.parse(result);
            } catch {
                return result;
            }
        } catch (error) {
            this.log('error', 'Decompression failed', { algorithm, error: error.message });
            return data; // Return original data if decompression fails
        }
    }
    
    generateCacheKey(req, context) {
        const generator = this.keyGenerators.get(req.path) || this.defaultKeyGenerator;
        return generator(req, context);
    }
    
    generateDefaultCacheKey(req, context) {
        const parts = [
            req.method,
            req.hostname || 'localhost',
            req.path,
            req.headers['x-api-version'] || 'v1'
        ];
        
        // Add query parameters if present
        if (req.query && Object.keys(req.query).length > 0) {
            const normalizedQuery = this.normalizeQueryParams(req.query);
            const sortedQuery = Object.keys(normalizedQuery)
                .sort()
                .map(key => `${key}=${normalizedQuery[key]}`)
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
        const version = req.query.v || req.query.version || 'latest';
        return `static:${req.path}:${version}`;
    }
    
    generateDynamicKey(req, query) {
        const normalizedQuery = this.normalizeQueryParams(query);
        const queryString = Object.keys(normalizedQuery)
            .sort()
            .map(key => `${key}=${normalizedQuery[key]}`)
            .join('&');
        
        return `dynamic:${req.path}:${this.hashObject(normalizedQuery)}`;
    }
    
    generateETag(data) {
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
    }
    
    generateVersion() {
        if (this.versioningConfig.strategy === 'timestamp') {
            return Date.now().toString();
        } else if (this.versioningConfig.strategy === 'hash') {
            return crypto.randomBytes(8).toString('hex');
        } else {
            return '1';
        }
    }
    
    normalizeQueryParams(query, config = {}) {
        const normalized = {};
        const excludeParams = config.excludeParams || this.bypassConfig.queryParams;
        
        for (const [key, value] of Object.entries(query)) {
            if (!excludeParams.includes(key)) {
                // Normalize parameter values
                let normalizedValue = value;
                
                if (Array.isArray(value)) {
                    normalizedValue = value.sort().join(',');
                } else if (typeof value === 'string') {
                    normalizedValue = value.trim().toLowerCase();
                }
                
                normalized[key] = normalizedValue;
            }
        }
        
        return normalized;
    }
    
    hashObject(obj) {
        const str = JSON.stringify(obj, Object.keys(obj).sort());
        return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
    }
    
    calculateTTL(req, res, context) {
        // Check for explicit cache control
        const cacheControl = res.headers?.['cache-control'];
        if (cacheControl && this.cacheHeaders.respectCacheControl) {
            const maxAge = this.extractMaxAge(cacheControl);
            if (maxAge) {
                return Math.min(maxAge * 1000, this.maxTTL);
            }
        }
        
        // Check for expires header
        const expires = res.headers?.expires;
        if (expires && this.cacheHeaders.respectExpires) {
            const expiresTime = new Date(expires).getTime();
            const ttl = expiresTime - Date.now();
            if (ttl > 0) {
                return Math.min(ttl, this.maxTTL);
            }
        }
        
        // Check policy-specific TTL
        if (context?.policy?.config?.ttl) {
            return Math.min(context.policy.config.ttl, this.maxTTL);
        }
        
        // Check endpoint-specific TTL
        const endpointTTL = this.ttlConfigs.get(req.path);
        if (endpointTTL) {
            return Math.min(endpointTTL, this.maxTTL);
        }
        
        // Adaptive TTL based on access patterns
        if (this.smartCache.adaptiveTTL) {
            return this.calculateAdaptiveTTL(req);
        }
        
        return this.defaultTTL;
    }
    
    calculateAdaptiveTTL(req) {
        const key = this.generateCacheKey(req);
        const pattern = this.accessPatterns.get(key);
        
        if (pattern) {
            const accessFrequency = pattern.accessCount / 
                Math.max((Date.now() - pattern.firstAccess) / 3600000, 1); // per hour
            
            if (accessFrequency > 10) {
                return this.maxTTL; // High frequency, long TTL
            } else if (accessFrequency > 1) {
                return this.defaultTTL * 2; // Medium frequency
            } else {
                return this.defaultTTL / 2; // Low frequency, short TTL
            }
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
            'vary',
            'expires'
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
        const personal = ['set-cookie', 'authorization', 'x-user-id', 'x-session-id'];
        const filtered = { ...headers };
        
        for (const header of personal) {
            delete filtered[header];
        }
        
        return filtered;
    }
    
    extractVersion(req) {
        return req.headers['x-api-version'] || 
               this.extractVersionFromPath(req.path) || 
               'v1';
    }
    
    extractVersionFromPath(path) {
        const match = path.match(/\/v(\d+)\//);
        return match ? `v${match[1]}` : null;
    }
    
    getFileExtension(path) {
        const lastDot = path.lastIndexOf('.');
        return lastDot !== -1 ? path.substring(lastDot) : '';
    }
    
    isStaticAsset(path) {
        const staticExtensions = ['.js', '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
        return staticExtensions.some(ext => path.endsWith(ext));
    }
    
    isEdgeCacheable(req) {
        // Check if request is suitable for edge caching
        if (req.method !== 'GET') return false;
        if (req.headers.authorization) return false;
        if (req.path.includes('/api/private')) return false;
        if (req.path.includes('/admin')) return false;
        
        return true;
    }
    
    isWarmingCandidate(path) {
        return this.warmingConfig.endpoints.some(endpoint => 
            endpoint.path === path || path.startsWith(endpoint.path)
        );
    }
    
    isDeprecatedVersion(version) {
        // Simple deprecation check
        const versionNum = parseInt(version.replace('v', ''));
        return versionNum < 2; // Versions below v2 are deprecated
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

    /**
     * Cache management and monitoring
     */
    
    updateAccessPattern(key) {
        let pattern = this.accessPatterns.get(key);
        
        if (!pattern) {
            pattern = {
                firstAccess: Date.now(),
                lastAccess: Date.now(),
                accessCount: 0,
                accessTimes: []
            };
        }
        
        pattern.lastAccess = Date.now();
        pattern.accessCount++;
        pattern.accessTimes.push(Date.now());
        
        // Keep only recent access times (last 100)
        if (pattern.accessTimes.length > 100) {
            pattern.accessTimes = pattern.accessTimes.slice(-100);
        }
        
        this.accessPatterns.set(key, pattern);
    }
    
    initializeAccessPattern(key) {
        if (!this.accessPatterns.has(key)) {
            this.accessPatterns.set(key, {
                firstAccess: Date.now(),
                lastAccess: Date.now(),
                accessCount: 0,
                accessTimes: []
            });
        }
    }
    
    cleanupAccessPattern(key) {
        this.accessPatterns.delete(key);
    }
    
    getAccessFrequency(key) {
        const pattern = this.accessPatterns.get(key);
        if (!pattern) return 0;
        
        const timeRange = Math.max(Date.now() - pattern.firstAccess, 3600000); // At least 1 hour
        return pattern.accessCount / (timeRange / 3600000); // Accesses per hour
    }
    
    identifyAccessPattern(req) {
        // Simple pattern identification
        if (req.path.includes('/api/')) {
            return 'api';
        } else if (this.isStaticAsset(req.path)) {
            return 'static';
        } else if (req.user) {
            return 'authenticated';
        } else {
            return 'public';
        }
    }
    
    updateStrategyMetrics(strategy, hit = null) {
        const metrics = this.metrics.strategyMetrics.get(strategy);
        if (metrics) {
            metrics.totalRequests++;
            if (hit === true) {
                metrics.hits++;
            } else if (hit === false) {
                metrics.misses++;
            }
        }
    }
    
    updateCacheMetrics(operation, data) {
        switch (operation) {
            case 'write':
                this.metrics.writes++;
                break;
            case 'delete':
                this.metrics.deletes++;
                break;
            case 'invalidate':
                this.metrics.invalidations++;
                break;
        }
    }
    
    updateTenantMetrics(tenantId, sizeIncrease, entryIncrease) {
        let tenantMetrics = this.metrics.tenantMetrics.get(tenantId);
        
        if (!tenantMetrics) {
            tenantMetrics = { size: 0, entries: 0 };
        }
        
        tenantMetrics.size += sizeIncrease;
        tenantMetrics.entries += entryIncrease;
        
        this.metrics.tenantMetrics.set(tenantId, tenantMetrics);
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
    
    calculateMetrics() {
        const total = this.metrics.hits + this.metrics.misses;
        this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
        
        // Calculate average response time
        this.metrics.avgResponseTime = this.calculateAverageResponseTime();
        
        // Calculate strategy performance
        for (const [strategy, metrics] of this.metrics.strategyMetrics) {
            const strategyTotal = metrics.hits + metrics.misses;
            metrics.hitRate = strategyTotal > 0 ? metrics.hits / strategyTotal : 0;
        }
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
    
    getRecentMetrics() {
        return {
            hitRate: this.metrics.hitRate,
            errorRate: this.metrics.errors / Math.max(this.metrics.hits + this.metrics.misses, 1),
            avgResponseTime: this.metrics.avgResponseTime
        };
    }
    
    getCurrentLoad() {
        // Simplified load calculation
        // In production, would use actual system metrics
        return Math.random();
    }
    
    getNetworkLatency() {
        // Simplified network latency calculation
        // In production, would measure actual network latency
        return Math.random() * 200;
    }

    /**
     * Advanced caching features
     */
    
    async evictTenantCache(tenantId) {
        const pattern = `tenant:${tenantId}:*`;
        const count = await this.invalidate(pattern);
        
        // Reset tenant metrics
        this.metrics.tenantMetrics.set(tenantId, { size: 0, entries: 0 });
        
        this.log('info', `Evicted ${count} cache entries for tenant ${tenantId}`);
        
        return count;
    }
    
    async cleanupExpiredEntries() {
        if (!this.cacheManager.keys) {
            return 0;
        }
        
        try {
            const keys = await this.cacheManager.keys('*');
            let cleaned = 0;
            
            // Process in batches to avoid blocking
            const batchSize = 50;
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                
                for (const key of batch) {
                    const entry = await this.cacheManager.get(key);
                    
                    if (entry && this.isExpired(entry)) {
                        await this.delete(key);
                        cleaned++;
                    }
                }
                
                // Small delay between batches
                if (i + batchSize < keys.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            if (cleaned > 0) {
                this.log('info', `Cleaned up ${cleaned} expired cache entries`);
            }
            
            return cleaned;
        } catch (error) {
            this.log('error', 'Cache cleanup failed', error);
            return 0;
        }
    }

    /**
     * Event handlers
     */
    
    onCacheHit(data) {
        this.metrics.hits++;
        this.recordResponseTime(data.responseTime || 0);
    }
    
    onCacheMiss(data) {
        this.metrics.misses++;
    }
    
    onCacheError(error) {
        this.metrics.errors++;
        this.log('error', 'Cache operation error', error);
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
            this.log('info', `Cache policy enabled: ${name}`);
        }
    }
    
    disablePolicy(name) {
        const policy = this.policies.get(name);
        if (policy) {
            policy.enabled = false;
            this.log('info', `Cache policy disabled: ${name}`);
        }
    }
    
    updatePolicy(name, updates) {
        const policy = this.policies.get(name);
        if (policy) {
            Object.assign(policy, updates);
            this.log('info', `Cache policy updated: ${name}`);
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
            strategies: {
                available: Object.keys(this.strategies),
                metrics: Object.fromEntries(this.metrics.strategyMetrics)
            },
            warming: {
                enabled: this.warmingConfig.enabled,
                queueSize: this.warmingQueue?.length || 0
            },
            edge: {
                enabled: this.edgeCacheConfig.enabled,
                regions: this.edgeCacheConfig.regions
            },
            compression: {
                enabled: this.compressionConfig.enabled,
                saved: this.metrics.compressionSaved
            },
            accessPatterns: this.accessPatterns.size,
            backgroundTasks: this.backgroundTasks.size
        };
    }

    /**
     * Performs cleanup operations
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.log('info', 'Cleaning up cache policy engine');
            
            // Clear background tasks
            for (const [name, task] of this.backgroundTasks) {
                clearInterval(task);
                this.log('debug', `Stopped background task: ${name}`);
            }
            this.backgroundTasks.clear();
            
            // Clear caches and patterns
            this.accessPatterns.clear();
            this.entryMetadata.clear();
            this.cachePatterns.clear();
            
            // Clear queues
            this.invalidationQueue = [];
            this.warmingQueue = [];
            this.preloadQueue = [];
            
            // Reset metrics
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
                tenantMetrics: new Map(),
                strategyMetrics: new Map(),
                invalidations: 0,
                warmingRequests: 0
            };
            
            // Reset flags
            this.warmingInProgress = false;
            this.preloadInProgress = false;
            
            this.isInitialized = false;
            this.log('info', 'Cache policy engine cleanup completed');
            
        } catch (error) {
            this.log('error', 'Error during cache policy engine cleanup', error);
            throw error;
        }
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger && typeof this.logger[level] === 'function') {
            this.logger[level](message, data);
        } else {
            console[level] || console.log(message, data);
        }
    }

    // Cache warming implementation
    startCacheWarming() {
        if (!this.warmingConfig.enabled) return;
        
        this.backgroundTasks.set('cache-warming', setInterval(() => {
            this.warmCache();
        }, this.warmingConfig.interval));
        
        // Initial warming
        this.warmCache();
        this.log('info', 'Cache warming started');
    }
    
    async warmCache() {
        const endpoints = this.warmingConfig.endpoints;
        const concurrent = this.warmingConfig.concurrent;
        
        if (endpoints.length === 0) return;
        
        this.log('debug', `Starting cache warming for ${endpoints.length} endpoints`);
        
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
                hostname: endpoint.hostname || 'localhost',
                headers: endpoint.headers || {},
                query: endpoint.query || {},
                user: endpoint.user,
                tenant: endpoint.tenant
            };
            
            const key = this.generateCacheKey(mockReq);
            
            // Check if already cached and not stale
            const cached = await this.get(key);
            if (cached && !this.isStale(cached)) {
                return;
            }
            
            // Fetch and cache
            const response = await this.fetchEndpoint(endpoint);
            const ttl = endpoint.ttl || this.defaultTTL;
            
            await this.set(key, response, ttl);
            this.metrics.warmingRequests++;
            
            this.log('debug', `Warmed cache for endpoint: ${endpoint.path}`);
            
        } catch (error) {
            this.log('error', `Failed to warm endpoint ${endpoint.path}`, error);
        }
    }
    
    async fetchEndpoint(endpoint) {
        // Placeholder for actual HTTP request
        // In production, this would make an actual request to the endpoint
        return {
            data: { warmed: true, timestamp: Date.now() },
            headers: { 'content-type': 'application/json' },
            statusCode: 200,
            metadata: {
                size: 100,
                warmed: true
            }
        };
    }
    
    processWarmingQueue() {
        if (this.warmingInProgress || this.warmingQueue.length === 0) {
            return;
        }
        
        this.warmingInProgress = true;
        
        const processNext = async () => {
            if (this.warmingQueue.length === 0) {
                this.warmingInProgress = false;
                return;
            }
            
            const item = this.warmingQueue.shift();
            
            try {
                await this.warmEndpoint(item);
                
                // Process dependencies if enabled
                if (item.dependencies && item.dependencies.length > 0) {
                    for (const dep of item.dependencies) {
                        this.warmingQueue.push({
                            ...dep,
                            priority: item.priority - 1
                        });
                    }
                }
            } catch (error) {
                this.log('error', 'Warming queue processing failed', error);
            }
            
            // Continue processing with small delay
            setTimeout(processNext, 100);
        };
        
        processNext();
    }
    
    addToWarmingQueue(item) {
        // Add priority if not specified
        if (!item.priority) {
            item.priority = this.warmingConfig.priority === 'high' ? 10 : 
                           this.warmingConfig.priority === 'low' ? 1 : 5;
        }
        
        this.warmingQueue.push(item);
        
        // Sort by priority (highest first)
        this.warmingQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        if (!this.warmingInProgress) {
            this.processWarmingQueue();
        }
    }
    
    identifyDependencies(req) {
        const dependencies = [];
        
        // For API endpoints, identify related endpoints
        if (req.path.includes('/api/users/')) {
            const userId = req.path.split('/')[3];
            if (userId) {
                dependencies.push(
                    { path: `/api/users/${userId}/profile`, method: 'GET' },
                    { path: `/api/users/${userId}/settings`, method: 'GET' }
                );
            }
        }
        
        // For product pages, identify related resources
        if (req.path.includes('/products/')) {
            const productId = req.path.split('/')[2];
            if (productId) {
                dependencies.push(
                    { path: `/api/products/${productId}/reviews`, method: 'GET' },
                    { path: `/api/products/${productId}/related`, method: 'GET' }
                );
            }
        }
        
        return dependencies;
    }

    // Edge caching implementation
    async distributeToEdge(key, entry, regions) {
        if (!this.distributedConfig.enabled) return;
        
        const promises = regions.map(region => 
            this.pushToRegion(region, key, entry)
        );
        
        try {
            await Promise.all(promises);
            this.log('debug', `Distributed cache to ${regions.length} regions`, { key });
        } catch (error) {
            this.log('error', 'Failed to distribute cache', { key, error: error.message });
        }
    }
    
    async pushToRegion(region, key, entry) {
        // Implementation would push to actual edge nodes
        // This is a simplified version
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) { // 90% success rate
                    this.log('debug', `Pushed to region: ${region}`, { key });
                    resolve();
                } else {
                    reject(new Error(`Failed to push to region: ${region}`));
                }
            }, Math.random() * 200);
        });
    }
    
    selectOptimalRegions(req) {
        const clientRegion = this.getClientRegion(req);
        const nearbyRegions = this.getNearbyRegions(clientRegion);
        
        // Select client region and 2 nearest regions
        return [clientRegion, ...nearbyRegions.slice(0, 2)];
    }
    
    getClientRegion(req) {
        // Get client region from headers or IP
        return req.headers['cf-ipcountry'] ? 
            this.countryToRegion(req.headers['cf-ipcountry']) : 
            'us-east-1';
    }
    
    countryToRegion(country) {
        const regionMap = {
            'US': 'us-east-1',
            'CA': 'us-east-1',
            'GB': 'eu-west-1',
            'DE': 'eu-central-1',
            'FR': 'eu-west-1',
            'JP': 'ap-northeast-1',
            'SG': 'ap-southeast-1',
            'AU': 'ap-southeast-2'
        };
        
        return regionMap[country] || 'us-east-1';
    }
    
    getNearbyRegions(region) {
        const regionHierarchy = {
            'us-east-1': ['us-west-2', 'eu-west-1'],
            'us-west-2': ['us-east-1', 'ap-southeast-1'],
            'eu-west-1': ['eu-central-1', 'us-east-1'],
            'eu-central-1': ['eu-west-1', 'ap-southeast-1'],
            'ap-northeast-1': ['ap-southeast-1', 'us-west-2'],
            'ap-southeast-1': ['ap-northeast-1', 'ap-southeast-2'],
            'ap-southeast-2': ['ap-southeast-1', 'us-west-2']
        };
        
        return regionHierarchy[region] || ['us-east-1'];
    }
    
    calculateCachePriority(req, res) {
        let priority = 5; // Default priority
        
        // Static assets get high priority
        if (this.isStaticAsset(req.path)) {
            priority += 3;
        }
        
        // Frequently accessed content gets higher priority
        const key = this.generateCacheKey(req);
        const frequency = this.getAccessFrequency(key);
        if (frequency > 10) {
            priority += 2;
        } else if (frequency > 1) {
            priority += 1;
        }
        
        // Small responses get higher priority
        const size = res.metadata?.size || 0;
        if (size < 1024) { // Less than 1KB
            priority += 1;
        }
        
        return Math.min(priority, 10); // Max priority is 10
    }

    // Distributed cache implementation
    async connectToNode(node) {
        // Placeholder for actual node connection
        // In production, this would establish connection to cache node
        this.log('info', `Connected to cache node: ${node}`);
        return Promise.resolve();
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
        // This handles conflict resolution based on strategy
        const conflictResolution = this.distributedConfig.conflictResolution;
        
        switch (conflictResolution) {
            case 'timestamp':
                return this.syncByTimestamp(node);
            case 'version':
                return this.syncByVersion(node);
            case 'manual':
                return this.syncManually(node);
            default:
                return this.syncByTimestamp(node);
        }
    }
    
    async syncByTimestamp(node) {
        // Sync based on timestamp - newer wins
        this.log('debug', `Syncing with node ${node} using timestamp strategy`);
        return Promise.resolve();
    }
    
    async syncByVersion(node) {
        // Sync based on version numbers
        this.log('debug', `Syncing with node ${node} using version strategy`);
        return Promise.resolve();
    }
    
    async syncManually(node) {
        // Manual conflict resolution required
        this.log('debug', `Manual sync required for node ${node}`);
        return Promise.resolve();
    }

    // Smart cache implementation
    createSmartCacheModel() {
        // Simplified ML model for cache predictions
        return {
            weights: new Map(),
            learningRate: this.smartCache.learningRate,
            predictions: new Map(),
            
            predict: (features) => {
                // Simple linear prediction
                let score = 0;
                for (const [feature, value] of Object.entries(features)) {
                    const weight = this.weights.get(feature) || 0;
                    score += weight * value;
                }
                return Math.max(0, Math.min(1, score));
            },
            
            train: (features, actual) => {
                // Simple gradient descent
                const predicted = this.predict(features);
                const error = actual - predicted;
                
                for (const [feature, value] of Object.entries(features)) {
                    const currentWeight = this.weights.get(feature) || 0;
                    const newWeight = currentWeight + this.learningRate * error * value;
                    this.weights.set(feature, newWeight);
                }
            }
        };
    }
    
    startAdaptiveTTL() {
        this.backgroundTasks.set('adaptive-ttl', setInterval(() => {
            this.updateAdaptiveTTLs();
        }, 300000)); // Every 5 minutes
        
        this.log('info', 'Adaptive TTL started');
    }
    
    updateAdaptiveTTLs() {
        // Update TTL configurations based on access patterns
        for (const [key, pattern] of this.accessPatterns) {
            const frequency = this.getAccessFrequency(key);
            const path = this.extractPathFromKey(key);
            
            if (path) {
                let newTTL;
                
                if (frequency > 10) {
                    newTTL = this.maxTTL;
                } else if (frequency > 1) {
                    newTTL = this.defaultTTL * 2;
                } else {
                    newTTL = this.defaultTTL / 2;
                }
                
                this.ttlConfigs.set(path, newTTL);
            }
        }
    }
    
    extractPathFromKey(key) {
        // Extract path from cache key
        // This is a simplified extraction
        const parts = key.split(':');
        return parts.find(part => part.startsWith('/'));
    }
    
    startPredictiveInvalidation() {
        this.backgroundTasks.set('predictive-invalidation', setInterval(() => {
            this.predictiveInvalidation();
        }, 600000)); // Every 10 minutes
        
        this.log('info', 'Predictive invalidation started');
    }
    
    predictiveInvalidation() {
        // Predict which cache entries should be invalidated
        const now = Date.now();
        
        for (const [key, metadata] of this.entryMetadata) {
            const age = now - metadata.created;
            const hitRate = metadata.hits / Math.max(metadata.accessed, 1);
            
            // Predict if entry will become stale soon
            if (age > this.defaultTTL * 0.8 && hitRate < 0.1) {
                // Low hit rate and old entry - candidate for preemptive invalidation
                this.scheduleInvalidation(key, age + this.defaultTTL * 0.1);
            }
        }
    }
    
    scheduleInvalidation(key, timestamp) {
        this.invalidationQueue.push({
            key,
            timestamp,
            reason: 'predictive'
        });
        
        // Sort by timestamp
        this.invalidationQueue.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    updateSmartCacheModel() {
        if (!this.smartCacheModel) return;
        
        // Update model with recent access patterns
        for (const [key, pattern] of this.accessPatterns) {
            const features = this.extractFeatures(key, pattern);
            const actual = this.calculateActualValue(pattern);
            
            this.smartCacheModel.train(features, actual);
        }
        
        this.log('debug', 'Smart cache model updated');
    }
    
    extractFeatures(key, pattern) {
        return {
            frequency: this.getAccessFrequency(key),
            recency: (Date.now() - pattern.lastAccess) / 3600000, // Hours since last access
            size: this.entryMetadata.get(key)?.size || 0,
            isStatic: this.isStaticAsset(key) ? 1 : 0,
            hasUser: key.includes('user:') ? 1 : 0,
            hasTenant: key.includes('tenant:') ? 1 : 0
        };
    }
    
    calculateActualValue(pattern) {
        // Calculate actual cache value based on hit rate
        const totalAccesses = pattern.accessTimes.length;
        const recentAccesses = pattern.accessTimes.filter(time => 
            Date.now() - time < 3600000 // Last hour
        ).length;
        
        return totalAccesses > 0 ? recentAccesses / totalAccesses : 0;
    }

    // Predictive caching implementation
    async predictNextRequests(req) {
        const predictions = [];
        const userAgent = req.headers['user-agent'];
        const referer = req.headers['referer'];
        
        // Pattern-based predictions
        if (req.path.includes('/api/users/')) {
            const userId = req.path.split('/')[3];
            if (userId) {
                predictions.push({
                    path: `/api/users/${userId}/profile`,
                    method: 'GET',
                    confidence: 0.8,
                    headers: { 'user-agent': userAgent }
                });
                
                predictions.push({
                    path: `/api/users/${userId}/preferences`,
                    method: 'GET',
                    confidence: 0.6,
                    headers: { 'user-agent': userAgent }
                });
            }
        }
        
        // Sequential page predictions
        if (req.path.includes('/page/')) {
            const pageNum = parseInt(req.path.split('/').pop());
            if (!isNaN(pageNum)) {
                predictions.push({
                    path: req.path.replace(`/${pageNum}`, `/${pageNum + 1}`),
                    method: 'GET',
                    confidence: 0.7,
                    headers: { 'user-agent': userAgent }
                });
            }
        }
        
        // Product detail predictions
        if (req.path.includes('/products/') && !req.path.includes('/api/')) {
            const productId = req.path.split('/')[2];
            if (productId) {
                predictions.push({
                    path: `/api/products/${productId}/reviews`,
                    method: 'GET',
                    confidence: 0.9,
                    headers: { 'user-agent': userAgent }
                });
                
                predictions.push({
                    path: `/api/products/${productId}/related`,
                    method: 'GET',
                    confidence: 0.7,
                    headers: { 'user-agent': userAgent }
                });
            }
        }
        
        // Search result predictions
        if (req.path.includes('/search') && req.query.q) {
            const query = req.query.q;
            predictions.push({
                path: `/api/search/suggestions?q=${encodeURIComponent(query)}`,
                method: 'GET',
                confidence: 0.8,
                headers: { 'user-agent': userAgent }
            });
        }
        
        // Use smart cache model if available
        if (this.smartCacheModel) {
            const modelPredictions = this.getModelPredictions(req);
            predictions.push(...modelPredictions);
        }
        
        return predictions;
    }
    
    getModelPredictions(req) {
        if (!this.smartCacheModel) return [];
        
        const predictions = [];
        const features = this.extractFeatures(req.path, { accessCount: 1 });
        
        // Generate predictions based on similar patterns
        for (const [key, pattern] of this.accessPatterns) {
            const keyFeatures = this.extractFeatures(key, pattern);
            const similarity = this.calculateSimilarity(features, keyFeatures);
            
            if (similarity > 0.7) {
                const confidence = this.smartCacheModel.predict(keyFeatures);
                if (confidence > 0.5) {
                    predictions.push({
                        path: this.extractPathFromKey(key),
                        method: 'GET',
                        confidence: confidence * similarity,
                        source: 'model'
                    });
                }
            }
        }
        
        return predictions.slice(0, 5); // Limit to top 5 predictions
    }
    
    calculateSimilarity(features1, features2) {
        let similarity = 0;
        let count = 0;
        
        for (const key in features1) {
            if (key in features2) {
                const diff = Math.abs(features1[key] - features2[key]);
                similarity += Math.max(0, 1 - diff);
                count++;
            }
        }
        
        return count > 0 ? similarity / count : 0;
    }
    
    async prefetchRequest(prediction) {
        try {
            const mockReq = {
                method: prediction.method,
                path: prediction.path,
                headers: prediction.headers || {},
                query: {}
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
            
            this.log('debug', `Prefetched: ${prediction.path}`);
            
        } catch (error) {
            this.log('error', `Prefetch failed: ${prediction.path}`, error);
        }
    }
    
    async processPreloadQueue() {
        if (this.preloadInProgress || this.preloadQueue.length === 0) {
            return;
        }
        
        this.preloadInProgress = true;
        
        // Sort by priority
        this.preloadQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
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

    // Multi-tier caching implementation
    determineCacheTier(req, res, config) {
        const size = res.metadata?.size || 0;
        const frequency = this.getAccessFrequency(this.generateCacheKey(req));
        
        // Tier 1 (Memory): Small, frequently accessed
        if (size < config.l1Config.maxSize / 100 && frequency > 10) {
            return 'l1';
        }
        
        // Tier 2 (SSD): Medium size, moderate access
        if (size < config.l2Config.maxSize / 100 && frequency > 1) {
            return 'l2';
        }
        
        // Tier 3 (Distributed): Large or infrequent
        return 'l3';
    }
    
    calculateTierTTL(tier, config) {
        switch (tier) {
            case 'l1':
                return config.l1Config.ttl;
            case 'l2':
                return config.l2Config.ttl;
            case 'l3':
                return config.l3Config.ttl;
            default:
                return this.defaultTTL;
        }
    }
    
    async cacheInTier(tier, key, entry, ttl) {
        // Store in appropriate cache tier
        const tierKey = `${tier}:${key}`;
        
        switch (tier) {
            case 'l1':
                this.cacheTopology.l1.set(tierKey, entry);
                break;
            case 'l2':
                this.cacheTopology.l2.set(tierKey, entry);
                break;
            case 'l3':
                this.cacheTopology.l3.set(tierKey, entry);
                break;
        }
        
        // Also store in main cache manager
        await this.cacheManager.set(tierKey, entry, ttl);
    }
    
    shouldPromoteToHigherTier(metadata) {
        return metadata.accessFrequency > 5 && metadata.tier !== 'l1';
    }
    
    async promoteToHigherTier(key, entry) {
        const currentTier = entry.metadata.tier;
        let newTier;
        
        if (currentTier === 'l3') {
            newTier = 'l2';
        } else if (currentTier === 'l2') {
            newTier = 'l1';
        } else {
            return; // Already at highest tier
        }
        
        // Move to higher tier
        entry.metadata.tier = newTier;
        const newKey = key.replace(`${currentTier}:`, `${newTier}:`);
        
        await this.cacheInTier(newTier, key.substring(3), entry, entry.ttl);
        await this.delete(`${currentTier}:${key.substring(3)}`);
        
        this.log('debug', `Promoted cache entry from ${currentTier} to ${newTier}`, { key });
    }

    // Additional utility methods
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
        
        if (cached.metadata?.compressed) {
            res.set('X-Cache-Compressed', 'true');
            res.set('X-Compression-Algorithm', cached.metadata.algorithm);
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
                this.log('debug', 'Background revalidation completed', { key });
            } catch (error) {
                this.log('error', 'Background revalidation failed', { key, error: error.message });
            }
        });
    }
    
    async cacheResponse(key, response) {
        const entry = {
            data: response.data || response,
            headers: response.headers || {},
            statusCode: response.statusCode || 200,
            timestamp: Date.now(),
            ttl: this.defaultTTL,
            metadata: {
                size: Buffer.byteLength(JSON.stringify(response.data || response)),
                cached: true
            }
        };
        
        return this.set(key, entry, entry.ttl);
    }
    
    shouldCache(req, response) {
        return this.shouldCacheResponse(req, response);
    }
    
    analyzeAccessPatterns() {
        const now = Date.now();
        const patterns = {};
        
        for (const [key, pattern] of this.accessPatterns) {
            const path = this.extractPathFromKey(key);
            if (!path) continue;
            
            if (!patterns[path]) {
                patterns[path] = {
                    totalAccess: 0,
                    uniqueKeys: 0,
                    avgFrequency: 0,
                    lastAccess: 0
                };
            }
            
            patterns[path].totalAccess += pattern.accessCount;
            patterns[path].uniqueKeys++;
            patterns[path].avgFrequency += this.getAccessFrequency(key);
            patterns[path].lastAccess = Math.max(patterns[path].lastAccess, pattern.lastAccess);
        }
        
        // Calculate averages
        for (const path in patterns) {
            patterns[path].avgFrequency /= patterns[path].uniqueKeys;
        }
        
        this.cachePatterns = new Map(Object.entries(patterns));
        
        this.log('debug', `Analyzed ${Object.keys(patterns).length} cache patterns`);
    }
}

module.exports = { CachePolicyEngine };