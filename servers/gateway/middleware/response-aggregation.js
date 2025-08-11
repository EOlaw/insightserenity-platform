'use strict';

/**
 * @fileoverview Response Aggregation Middleware - Composite response aggregation and transformation
 * @module servers/gateway/middleware/response-aggregation
 * @requires events
 * @requires stream
 * @requires zlib
 * @requires jsonpath
 * @requires ajv
 */

const { EventEmitter } = require('events');
const { Transform, PassThrough } = require('stream');
const zlib = require('zlib');
const JSONPath = require('jsonpath');
const Ajv = require('ajv');
const crypto = require('crypto');

/**
 * ResponseAggregationMiddleware class provides comprehensive response aggregation,
 * transformation, and composition capabilities for the API Gateway. It supports
 * parallel and sequential service calls, response merging, data transformation,
 * schema validation, response caching, streaming aggregation, and conditional
 * response composition based on business rules and user permissions.
 * 
 * @class ResponseAggregationMiddleware
 * @extends EventEmitter
 */
class ResponseAggregationMiddleware extends EventEmitter {
    /**
     * Creates an instance of ResponseAggregationMiddleware
     * @constructor
     * @param {Object} config - Aggregation configuration
     * @param {CacheManager} cacheManager - Cache manager for response caching
     * @param {CircuitBreakerManager} circuitBreakerManager - Circuit breaker manager
     * @param {Logger} logger - Logger instance
     */
    constructor(config, cacheManager, circuitBreakerManager, logger) {
        super();
        this.config = config || {};
        this.cacheManager = cacheManager;
        this.circuitBreakerManager = circuitBreakerManager;
        this.logger = logger;
        this.isInitialized = false;
        
        // Schema validator
        this.ajv = new Ajv({
            allErrors: true,
            coerceTypes: true,
            useDefaults: true,
            removeAdditional: 'all'
        });
        
        // Aggregation strategies
        this.aggregationStrategies = new Map();
        this.customAggregators = new Map();
        
        // Transformation pipelines
        this.transformationPipelines = new Map();
        this.responseTransformers = new Map();
        
        // Response schemas
        this.responseSchemas = new Map();
        this.schemaValidators = new Map();
        
        // Aggregation templates
        this.aggregationTemplates = new Map();
        this.templateCache = new Map();
        
        // Parallel execution pools
        this.executionPools = new Map();
        this.maxConcurrency = config.maxConcurrency || 10;
        
        // Response composition rules
        this.compositionRules = new Map();
        this.conditionalComposers = new Map();
        
        // Field mapping configurations
        this.fieldMappings = new Map();
        this.dataEnrichers = new Map();
        
        // Error handling strategies
        this.errorStrategies = {
            'fail-fast': this.failFastStrategy.bind(this),
            'fail-silent': this.failSilentStrategy.bind(this),
            'partial-response': this.partialResponseStrategy.bind(this),
            'fallback': this.fallbackStrategy.bind(this),
            'retry': this.retryStrategy.bind(this)
        };
        
        // Default configuration
        this.defaultConfig = {
            timeout: config.timeout || 30000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            compressionEnabled: config.compressionEnabled !== false,
            compressionThreshold: config.compressionThreshold || 1024, // 1KB
            streamingEnabled: config.streamingEnabled || false,
            validationEnabled: config.validationEnabled !== false,
            transformationEnabled: config.transformationEnabled !== false,
            errorStrategy: config.errorStrategy || 'partial-response',
            ...config
        };
        
        // Response cache
        this.responseCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
        
        // Streaming aggregation support
        this.streamingAggregators = new Map();
        this.activeStreams = new Map();
        
        // Metrics and statistics
        this.statistics = {
            totalAggregations: 0,
            successfulAggregations: 0,
            failedAggregations: 0,
            partialAggregations: 0,
            averageAggregationTime: 0,
            cacheHitRate: 0,
            transformationsApplied: 0,
            validationErrors: 0,
            serviceCalls: 0,
            parallelExecutions: 0,
            sequentialExecutions: 0,
            streamingAggregations: 0,
            byStrategy: {},
            byService: {}
        };
        
        // Performance tracking
        this.performanceMetrics = new Map();
        this.performanceWindow = 60000; // 1 minute
        
        // Request correlation
        this.correlationMap = new Map();
        
        // Response interceptors
        this.responseInterceptors = [];
        this.requestInterceptors = [];
        
        // Batch aggregation support
        this.batchQueue = new Map();
        this.batchInterval = config.batchInterval || 100;
        this.batchSize = config.batchSize || 10;
        
        // GraphQL aggregation support
        this.graphqlResolvers = new Map();
        this.graphqlSchemas = new Map();
        
        // Content negotiation
        this.contentNegotiators = new Map();
        this.supportedFormats = ['json', 'xml', 'csv', 'protobuf', 'msgpack'];
        
        // Response compression streams
        this.compressionStreams = {
            'gzip': zlib.createGzip,
            'deflate': zlib.createDeflate,
            'br': zlib.createBrotliCompress
        };
        
        // Monitoring interval
        this.monitoringInterval = null;
        this.cleanupInterval = null;
    }

    /**
     * Initializes the response aggregation middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Response aggregation middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Response Aggregation Middleware');
            
            // Initialize aggregation strategies
            this.initializeAggregationStrategies();
            
            // Load aggregation templates
            await this.loadAggregationTemplates();
            
            // Setup transformation pipelines
            this.setupTransformationPipelines();
            
            // Initialize response schemas
            await this.loadResponseSchemas();
            
            // Setup composition rules
            this.setupCompositionRules();
            
            // Initialize execution pools
            this.initializeExecutionPools();
            
            // Start monitoring
            this.startMonitoring();
            
            // Start cleanup
            this.startCleanup();
            
            this.isInitialized = true;
            this.emit('aggregation:initialized');
            
            this.log('info', 'Response Aggregation Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Response Aggregation Middleware', error);
            throw error;
        }
    }

    /**
     * Aggregates responses from multiple services
     * @async
     * @param {Object} req - Request object
     * @param {Object} aggregationConfig - Aggregation configuration
     * @returns {Promise<Object>} Aggregated response
     */
    async aggregate(req, aggregationConfig) {
        const startTime = Date.now();
        const correlationId = this.generateCorrelationId();
        
        this.statistics.totalAggregations++;
        
        try {
            // Validate aggregation configuration
            this.validateAggregationConfig(aggregationConfig);
            
            // Check cache if enabled
            if (this.defaultConfig.cacheEnabled && aggregationConfig.cache !== false) {
                const cachedResponse = await this.getCachedResponse(req, aggregationConfig);
                if (cachedResponse) {
                    this.statistics.cacheHitRate = (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100;
                    return cachedResponse;
                }
            }
            
            // Apply request interceptors
            for (const interceptor of this.requestInterceptors) {
                await interceptor(req, aggregationConfig);
            }
            
            // Determine aggregation strategy
            const strategy = aggregationConfig.strategy || 'parallel';
            const aggregator = this.getAggregationStrategy(strategy);
            
            if (!aggregator) {
                throw new Error(`Unknown aggregation strategy: ${strategy}`);
            }
            
            // Set correlation context
            this.setCorrelationContext(correlationId, req, aggregationConfig);
            
            // Execute aggregation
            let response = await aggregator(req, aggregationConfig, correlationId);
            
            // Apply transformations if enabled
            if (this.defaultConfig.transformationEnabled && aggregationConfig.transform !== false) {
                response = await this.transformResponse(response, aggregationConfig);
            }
            
            // Validate response if enabled
            if (this.defaultConfig.validationEnabled && aggregationConfig.validate !== false) {
                await this.validateResponse(response, aggregationConfig);
            }
            
            // Apply response interceptors
            for (const interceptor of this.responseInterceptors) {
                response = await interceptor(response, req, aggregationConfig);
            }
            
            // Cache response if enabled
            if (this.defaultConfig.cacheEnabled && aggregationConfig.cache !== false) {
                await this.cacheResponse(req, aggregationConfig, response);
            }
            
            // Update statistics
            const duration = Date.now() - startTime;
            this.updateStatistics(strategy, duration, true);
            
            this.statistics.successfulAggregations++;
            this.emit('aggregation:success', { correlationId, duration, strategy });
            
            return response;
            
        } catch (error) {
            this.statistics.failedAggregations++;
            this.log('error', 'Aggregation failed', { correlationId, error: error.message });
            
            // Apply error strategy
            const errorStrategy = aggregationConfig.errorStrategy || this.defaultConfig.errorStrategy;
            const errorHandler = this.errorStrategies[errorStrategy];
            
            if (errorHandler) {
                return await errorHandler(error, req, aggregationConfig, correlationId);
            }
            
            throw error;
        } finally {
            // Clean up correlation context
            this.clearCorrelationContext(correlationId);
        }
    }

    /**
     * Initializes aggregation strategies
     * @private
     */
    initializeAggregationStrategies() {
        // Parallel aggregation
        this.aggregationStrategies.set('parallel', this.parallelAggregation.bind(this));
        
        // Sequential aggregation
        this.aggregationStrategies.set('sequential', this.sequentialAggregation.bind(this));
        
        // Batch aggregation
        this.aggregationStrategies.set('batch', this.batchAggregation.bind(this));
        
        // Streaming aggregation
        this.aggregationStrategies.set('streaming', this.streamingAggregation.bind(this));
        
        // Pipeline aggregation
        this.aggregationStrategies.set('pipeline', this.pipelineAggregation.bind(this));
        
        // Conditional aggregation
        this.aggregationStrategies.set('conditional', this.conditionalAggregation.bind(this));
        
        // GraphQL aggregation
        this.aggregationStrategies.set('graphql', this.graphqlAggregation.bind(this));
        
        // Custom aggregation
        this.aggregationStrategies.set('custom', this.customAggregation.bind(this));
        
        this.log('info', 'Aggregation strategies initialized');
    }

    /**
     * Parallel aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Aggregated response
     */
    async parallelAggregation(req, config, correlationId) {
        this.statistics.parallelExecutions++;
        
        const services = config.services || [];
        const promises = [];
        const serviceResponses = {};
        
        // Create promises for all service calls
        for (const service of services) {
            const promise = this.callService(req, service, correlationId)
                .then(response => {
                    serviceResponses[service.name || service.id] = {
                        success: true,
                        data: response,
                        timestamp: Date.now()
                    };
                })
                .catch(error => {
                    serviceResponses[service.name || service.id] = {
                        success: false,
                        error: error.message,
                        timestamp: Date.now()
                    };
                    
                    if (service.required !== false) {
                        throw error;
                    }
                });
            
            promises.push(promise);
        }
        
        // Wait for all promises with timeout
        await Promise.race([
            Promise.allSettled(promises),
            this.timeout(config.timeout || this.defaultConfig.timeout)
        ]);
        
        // Merge responses
        return this.mergeResponses(serviceResponses, config);
    }

    /**
     * Sequential aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Aggregated response
     */
    async sequentialAggregation(req, config, correlationId) {
        this.statistics.sequentialExecutions++;
        
        const services = config.services || [];
        const serviceResponses = {};
        let previousResponse = null;
        
        for (const service of services) {
            try {
                // Pass previous response as context
                if (previousResponse && service.usePreviousResponse) {
                    req = this.enrichRequestWithResponse(req, previousResponse);
                }
                
                const response = await this.callService(req, service, correlationId);
                
                serviceResponses[service.name || service.id] = {
                    success: true,
                    data: response,
                    timestamp: Date.now()
                };
                
                previousResponse = response;
                
            } catch (error) {
                serviceResponses[service.name || service.id] = {
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                };
                
                if (service.required !== false) {
                    throw error;
                }
            }
        }
        
        return this.mergeResponses(serviceResponses, config);
    }

    /**
     * Batch aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Aggregated response
     */
    async batchAggregation(req, config, correlationId) {
        const batchKey = config.batchKey || 'default';
        
        if (!this.batchQueue.has(batchKey)) {
            this.batchQueue.set(batchKey, []);
        }
        
        const batch = this.batchQueue.get(batchKey);
        
        return new Promise((resolve, reject) => {
            batch.push({
                req,
                config,
                correlationId,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            // Process batch if size limit reached
            if (batch.length >= this.batchSize) {
                this.processBatch(batchKey);
            } else {
                // Schedule batch processing
                setTimeout(() => {
                    if (this.batchQueue.has(batchKey) && this.batchQueue.get(batchKey).length > 0) {
                        this.processBatch(batchKey);
                    }
                }, this.batchInterval);
            }
        });
    }

    /**
     * Streaming aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Stream>} Response stream
     */
    async streamingAggregation(req, config, correlationId) {
        this.statistics.streamingAggregations++;
        
        const outputStream = new PassThrough();
        const services = config.services || [];
        
        // Create streaming pipeline
        const pipeline = this.createStreamingPipeline(services, correlationId);
        
        // Start streaming
        this.startStreaming(req, pipeline, outputStream, config, correlationId);
        
        return outputStream;
    }

    /**
     * Pipeline aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Aggregated response
     */
    async pipelineAggregation(req, config, correlationId) {
        const pipeline = config.pipeline || [];
        let currentData = req.body || {};
        
        for (const stage of pipeline) {
            const stageProcessor = this.getStageProcessor(stage.type);
            
            if (!stageProcessor) {
                throw new Error(`Unknown pipeline stage: ${stage.type}`);
            }
            
            currentData = await stageProcessor(currentData, stage, req, correlationId);
            
            // Apply stage transformations
            if (stage.transform) {
                currentData = await this.applyTransformation(currentData, stage.transform);
            }
            
            // Validate stage output
            if (stage.validate) {
                await this.validateData(currentData, stage.validate);
            }
        }
        
        return currentData;
    }

    /**
     * Conditional aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Aggregated response
     */
    async conditionalAggregation(req, config, correlationId) {
        const conditions = config.conditions || [];
        const serviceResponses = {};
        
        for (const condition of conditions) {
            if (await this.evaluateCondition(condition, req, serviceResponses)) {
                const services = condition.services || [];
                
                for (const service of services) {
                    try {
                        const response = await this.callService(req, service, correlationId);
                        serviceResponses[service.name || service.id] = {
                            success: true,
                            data: response,
                            timestamp: Date.now()
                        };
                    } catch (error) {
                        if (service.required !== false) {
                            throw error;
                        }
                    }
                }
                
                if (condition.breakOnMatch) {
                    break;
                }
            }
        }
        
        return this.mergeResponses(serviceResponses, config);
    }

    /**
     * GraphQL aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} GraphQL response
     */
    async graphqlAggregation(req, config, correlationId) {
        const query = req.body.query;
        const variables = req.body.variables || {};
        const operationName = req.body.operationName;
        
        // Parse GraphQL query
        const parsedQuery = this.parseGraphQLQuery(query);
        
        // Resolve fields in parallel
        const resolvers = this.getGraphQLResolvers(parsedQuery);
        const resolvedData = {};
        
        const promises = Object.entries(resolvers).map(async ([field, resolver]) => {
            try {
                resolvedData[field] = await resolver(req, variables, correlationId);
            } catch (error) {
                resolvedData[field] = null;
                if (parsedQuery.fields[field].required) {
                    throw error;
                }
            }
        });
        
        await Promise.all(promises);
        
        return {
            data: resolvedData,
            extensions: {
                correlationId,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Custom aggregation strategy
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Custom aggregated response
     */
    async customAggregation(req, config, correlationId) {
        const aggregatorName = config.aggregator;
        const customAggregator = this.customAggregators.get(aggregatorName);
        
        if (!customAggregator) {
            throw new Error(`Custom aggregator not found: ${aggregatorName}`);
        }
        
        return await customAggregator(req, config, correlationId);
    }

    /**
     * Calls a service
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} serviceConfig - Service configuration
     * @param {string} correlationId - Correlation ID
     * @returns {Promise<Object>} Service response
     */
    async callService(req, serviceConfig, correlationId) {
        this.statistics.serviceCalls++;
        
        const startTime = Date.now();
        const serviceKey = `${serviceConfig.name}:${correlationId}`;
        
        try {
            // Check circuit breaker
            if (this.circuitBreakerManager) {
                const breaker = this.circuitBreakerManager.getBreaker(serviceConfig.name);
                if (breaker && breaker.opened) {
                    throw new Error(`Circuit breaker open for service: ${serviceConfig.name}`);
                }
            }
            
            // Prepare service request
            const serviceRequest = this.prepareServiceRequest(req, serviceConfig);
            
            // Add correlation headers
            serviceRequest.headers = {
                ...serviceRequest.headers,
                'x-correlation-id': correlationId,
                'x-gateway-timestamp': Date.now().toString()
            };
            
            // Make service call
            const response = await this.makeServiceCall(serviceRequest, serviceConfig);
            
            // Record performance metrics
            const duration = Date.now() - startTime;
            this.recordServiceMetrics(serviceConfig.name, duration, true);
            
            // Update statistics
            this.statistics.byService[serviceConfig.name] = 
                (this.statistics.byService[serviceConfig.name] || 0) + 1;
            
            return response;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.recordServiceMetrics(serviceConfig.name, duration, false);
            
            this.log('error', 'Service call failed', {
                service: serviceConfig.name,
                correlationId,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Makes actual service call
     * @private
     * @async
     * @param {Object} request - Service request
     * @param {Object} config - Service configuration
     * @returns {Promise<Object>} Service response
     */
    async makeServiceCall(request, config) {
        // This would integrate with actual HTTP client or service mesh
        // For now, return mock response
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    service: config.name,
                    data: {
                        message: `Response from ${config.name}`,
                        timestamp: Date.now()
                    }
                });
            }, Math.random() * 100);
        });
    }

    /**
     * Merges service responses
     * @private
     * @param {Object} responses - Service responses
     * @param {Object} config - Merge configuration
     * @returns {Object} Merged response
     */
    mergeResponses(responses, config) {
        const mergeStrategy = config.mergeStrategy || 'default';
        
        if (mergeStrategy === 'custom' && config.customMerger) {
            return config.customMerger(responses);
        }
        
        const merged = {
            timestamp: Date.now(),
            correlationId: config.correlationId,
            services: {}
        };
        
        // Apply field mappings
        for (const [serviceName, response] of Object.entries(responses)) {
            if (response.success) {
                const mappedData = this.applyFieldMapping(response.data, config.fieldMappings?.[serviceName]);
                
                if (mergeStrategy === 'flat') {
                    Object.assign(merged, mappedData);
                } else if (mergeStrategy === 'nested') {
                    merged.services[serviceName] = mappedData;
                } else {
                    // Default strategy
                    merged[serviceName] = mappedData;
                }
            } else if (config.includeErrors) {
                merged.errors = merged.errors || {};
                merged.errors[serviceName] = response.error;
            }
        }
        
        // Apply global transformations
        if (config.globalTransform) {
            return this.applyTransformation(merged, config.globalTransform);
        }
        
        return merged;
    }

    /**
     * Applies field mapping
     * @private
     * @param {Object} data - Source data
     * @param {Object} mapping - Field mapping configuration
     * @returns {Object} Mapped data
     */
    applyFieldMapping(data, mapping) {
        if (!mapping) return data;
        
        const mapped = {};
        
        for (const [targetField, sourceField] of Object.entries(mapping)) {
            if (typeof sourceField === 'string') {
                // Simple field mapping
                mapped[targetField] = this.getNestedValue(data, sourceField);
            } else if (typeof sourceField === 'object') {
                // Complex mapping with transformation
                const value = this.getNestedValue(data, sourceField.path);
                mapped[targetField] = sourceField.transform ? 
                    sourceField.transform(value) : value;
            }
        }
        
        return mapped;
    }

    /**
     * Transforms response
     * @private
     * @async
     * @param {Object} response - Response to transform
     * @param {Object} config - Transformation configuration
     * @returns {Promise<Object>} Transformed response
     */
    async transformResponse(response, config) {
        this.statistics.transformationsApplied++;
        
        const transformations = config.transformations || [];
        let transformed = response;
        
        for (const transformation of transformations) {
            const transformer = this.responseTransformers.get(transformation.type);
            
            if (transformer) {
                transformed = await transformer(transformed, transformation);
            } else if (transformation.type === 'jsonpath') {
                transformed = this.applyJSONPathTransformation(transformed, transformation);
            } else if (transformation.type === 'custom' && transformation.function) {
                transformed = await transformation.function(transformed);
            }
        }
        
        return transformed;
    }

    /**
     * Applies JSONPath transformation
     * @private
     * @param {Object} data - Data to transform
     * @param {Object} config - JSONPath configuration
     * @returns {Object} Transformed data
     */
    applyJSONPathTransformation(data, config) {
        const result = {};
        
        for (const [key, path] of Object.entries(config.paths || {})) {
            try {
                const values = JSONPath.query(data, path);
                result[key] = values.length === 1 ? values[0] : values;
            } catch (error) {
                this.log('warn', 'JSONPath query failed', { path, error: error.message });
                result[key] = null;
            }
        }
        
        return result;
    }

    /**
     * Validates response
     * @private
     * @async
     * @param {Object} response - Response to validate
     * @param {Object} config - Validation configuration
     * @returns {Promise<void>}
     */
    async validateResponse(response, config) {
        if (!config.schema) return;
        
        const schemaName = config.schema;
        let validator = this.schemaValidators.get(schemaName);
        
        if (!validator) {
            const schema = this.responseSchemas.get(schemaName);
            if (schema) {
                validator = this.ajv.compile(schema);
                this.schemaValidators.set(schemaName, validator);
            } else {
                throw new Error(`Schema not found: ${schemaName}`);
            }
        }
        
        const valid = validator(response);
        
        if (!valid) {
            this.statistics.validationErrors++;
            const errors = validator.errors;
            
            this.log('error', 'Response validation failed', { 
                schema: schemaName, 
                errors 
            });
            
            if (config.strictValidation) {
                throw new Error(`Response validation failed: ${JSON.stringify(errors)}`);
            }
        }
    }

    /**
     * Gets cached response
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @returns {Promise<Object|null>} Cached response or null
     */
    async getCachedResponse(req, config) {
        const cacheKey = this.generateCacheKey(req, config);
        
        // Check local cache first
        const localCached = this.responseCache.get(cacheKey);
        if (localCached && Date.now() < localCached.expiry) {
            this.cacheStats.hits++;
            return localCached.data;
        }
        
        // Check distributed cache
        if (this.cacheManager) {
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                this.cacheStats.hits++;
                
                // Update local cache
                this.responseCache.set(cacheKey, {
                    data: cached,
                    expiry: Date.now() + this.defaultConfig.cacheTTL
                });
                
                return cached;
            }
        }
        
        this.cacheStats.misses++;
        return null;
    }

    /**
     * Caches response
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} config - Aggregation configuration
     * @param {Object} response - Response to cache
     */
    async cacheResponse(req, config, response) {
        const cacheKey = this.generateCacheKey(req, config);
        const ttl = config.cacheTTL || this.defaultConfig.cacheTTL;
        
        // Update local cache
        this.responseCache.set(cacheKey, {
            data: response,
            expiry: Date.now() + ttl
        });
        
        // Update distributed cache
        if (this.cacheManager) {
            await this.cacheManager.set(cacheKey, response, ttl / 1000);
        }
        
        // Manage cache size
        if (this.responseCache.size > 1000) {
            this.evictOldestCacheEntry();
        }
    }

    /**
     * Generates cache key
     * @private
     * @param {Object} req - Request object
     * @param {Object} config - Configuration
     * @returns {string} Cache key
     */
    generateCacheKey(req, config) {
        const parts = [
            'aggregate',
            req.method,
            req.path,
            JSON.stringify(req.query || {}),
            JSON.stringify(config.services?.map(s => s.name) || []),
            config.strategy || 'default'
        ];
        
        return crypto.createHash('sha256')
            .update(parts.join(':'))
            .digest('hex')
            .substring(0, 32);
    }

    /**
     * Loads aggregation templates
     * @private
     * @async
     */
    async loadAggregationTemplates() {
        // Load predefined templates
        this.aggregationTemplates.set('user-profile', {
            strategy: 'parallel',
            services: [
                { name: 'user-service', path: '/user', required: true },
                { name: 'preferences-service', path: '/preferences', required: false },
                { name: 'activity-service', path: '/activity', required: false }
            ],
            mergeStrategy: 'nested',
            cache: true,
            cacheTTL: 300000
        });
        
        this.aggregationTemplates.set('dashboard', {
            strategy: 'parallel',
            services: [
                { name: 'stats-service', path: '/stats' },
                { name: 'notifications-service', path: '/notifications' },
                { name: 'tasks-service', path: '/tasks' }
            ],
            mergeStrategy: 'flat',
            errorStrategy: 'partial-response'
        });
        
        this.log('info', `Loaded ${this.aggregationTemplates.size} aggregation templates`);
    }

    /**
     * Loads response schemas
     * @private
     * @async
     */
    async loadResponseSchemas() {
        // Load predefined schemas
        this.responseSchemas.set('user-profile', {
            type: 'object',
            properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
                preferences: { type: 'object' },
                activity: { type: 'array' }
            },
            required: ['id', 'username']
        });
        
        this.responseSchemas.set('dashboard', {
            type: 'object',
            properties: {
                stats: { type: 'object' },
                notifications: { type: 'array' },
                tasks: { type: 'array' }
            }
        });
        
        this.log('info', `Loaded ${this.responseSchemas.size} response schemas`);
    }

    /**
     * Sets up transformation pipelines
     * @private
     */
    setupTransformationPipelines() {
        // Data filtering transformer
        this.responseTransformers.set('filter', async (data, config) => {
            if (config.fields) {
                return this.filterFields(data, config.fields);
            }
            return data;
        });
        
        // Data sorting transformer
        this.responseTransformers.set('sort', async (data, config) => {
            if (Array.isArray(data) && config.field) {
                return data.sort((a, b) => {
                    const aVal = this.getNestedValue(a, config.field);
                    const bVal = this.getNestedValue(b, config.field);
                    return config.order === 'desc' ? bVal - aVal : aVal - bVal;
                });
            }
            return data;
        });
        
        // Data pagination transformer
        this.responseTransformers.set('paginate', async (data, config) => {
            if (Array.isArray(data)) {
                const page = config.page || 1;
                const limit = config.limit || 10;
                const start = (page - 1) * limit;
                const end = start + limit;
                
                return {
                    data: data.slice(start, end),
                    pagination: {
                        page,
                        limit,
                        total: data.length,
                        pages: Math.ceil(data.length / limit)
                    }
                };
            }
            return data;
        });
        
        this.log('info', 'Transformation pipelines configured');
    }

    /**
     * Sets up composition rules
     * @private
     */
    setupCompositionRules() {
        // User-based composition
        this.compositionRules.set('user-based', {
            condition: (req) => req.user?.role,
            composer: (req, responses) => {
                const role = req.user.role;
                if (role === 'admin') {
                    return responses;
                } else if (role === 'user') {
                    // Filter sensitive data
                    return this.filterSensitiveData(responses);
                }
                return {};
            }
        });
        
        // Tenant-based composition
        this.compositionRules.set('tenant-based', {
            condition: (req) => req.headers['x-tenant-id'],
            composer: (req, responses) => {
                const tenantId = req.headers['x-tenant-id'];
                // Apply tenant-specific transformations
                return this.applyTenantTransformations(responses, tenantId);
            }
        });
        
        this.log('info', 'Composition rules configured');
    }

    /**
     * Initializes execution pools
     * @private
     */
    initializeExecutionPools() {
        // Create execution pools for different priorities
        this.executionPools.set('high', {
            concurrency: Math.floor(this.maxConcurrency * 0.5),
            queue: []
        });
        
        this.executionPools.set('normal', {
            concurrency: Math.floor(this.maxConcurrency * 0.3),
            queue: []
        });
        
        this.executionPools.set('low', {
            concurrency: Math.floor(this.maxConcurrency * 0.2),
            queue: []
        });
        
        this.log('info', 'Execution pools initialized');
    }

    /**
     * Error handling strategies
     */
    
    async failFastStrategy(error, req, config, correlationId) {
        throw error;
    }
    
    async failSilentStrategy(error, req, config, correlationId) {
        return null;
    }
    
    async partialResponseStrategy(error, req, config, correlationId) {
        this.statistics.partialAggregations++;
        return {
            partial: true,
            error: error.message,
            timestamp: Date.now()
        };
    }
    
    async fallbackStrategy(error, req, config, correlationId) {
        if (config.fallback) {
            return config.fallback;
        }
        return { error: 'Service unavailable', timestamp: Date.now() };
    }
    
    async retryStrategy(error, req, config, correlationId) {
        const maxRetries = config.maxRetries || this.defaultConfig.maxRetries;
        const retryDelay = config.retryDelay || this.defaultConfig.retryDelay;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.statistics.retries++;
            await this.delay(retryDelay * attempt);
            
            try {
                return await this.aggregate(req, { ...config, maxRetries: 0 });
            } catch (retryError) {
                if (attempt === maxRetries) {
                    throw retryError;
                }
            }
        }
    }

    /**
     * Utility methods
     */
    
    validateAggregationConfig(config) {
        if (!config) {
            throw new Error('Aggregation configuration is required');
        }
        
        if (!config.services || !Array.isArray(config.services)) {
            throw new Error('Services array is required in aggregation configuration');
        }
        
        if (config.services.length === 0) {
            throw new Error('At least one service is required for aggregation');
        }
    }
    
    getAggregationStrategy(strategy) {
        return this.aggregationStrategies.get(strategy);
    }
    
    generateCorrelationId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    setCorrelationContext(correlationId, req, config) {
        this.correlationMap.set(correlationId, {
            request: req,
            config,
            startTime: Date.now()
        });
    }
    
    clearCorrelationContext(correlationId) {
        this.correlationMap.delete(correlationId);
    }
    
    prepareServiceRequest(req, serviceConfig) {
        return {
            method: serviceConfig.method || req.method,
            path: serviceConfig.path || req.path,
            headers: { ...req.headers, ...serviceConfig.headers },
            body: serviceConfig.body || req.body,
            query: serviceConfig.query || req.query
        };
    }
    
    enrichRequestWithResponse(req, response) {
        return {
            ...req,
            previousResponse: response,
            enrichedAt: Date.now()
        };
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    filterFields(data, fields) {
        if (!fields || fields.length === 0) return data;
        
        const filtered = {};
        for (const field of fields) {
            const value = this.getNestedValue(data, field);
            if (value !== undefined) {
                this.setNestedValue(filtered, field, value);
            }
        }
        return filtered;
    }
    
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }
    
    filterSensitiveData(data) {
        const sensitiveFields = ['password', 'secret', 'token', 'apiKey'];
        return this.removeSensitiveFields(data, sensitiveFields);
    }
    
    removeSensitiveFields(obj, fields) {
        if (typeof obj !== 'object' || obj === null) return obj;
        
        const cleaned = Array.isArray(obj) ? [] : {};
        
        for (const [key, value] of Object.entries(obj)) {
            if (!fields.includes(key)) {
                cleaned[key] = typeof value === 'object' ? 
                    this.removeSensitiveFields(value, fields) : value;
            }
        }
        
        return cleaned;
    }
    
    applyTenantTransformations(data, tenantId) {
        // Apply tenant-specific transformations
        return {
            ...data,
            tenant: tenantId,
            processedAt: Date.now()
        };
    }
    
    timeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Aggregation timeout')), ms);
        });
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    evictOldestCacheEntry() {
        const firstKey = this.responseCache.keys().next().value;
        if (firstKey) {
            this.responseCache.delete(firstKey);
            this.cacheStats.evictions++;
        }
    }
    
    recordServiceMetrics(serviceName, duration, success) {
        if (!this.performanceMetrics.has(serviceName)) {
            this.performanceMetrics.set(serviceName, []);
        }
        
        const metrics = this.performanceMetrics.get(serviceName);
        metrics.push({
            duration,
            success,
            timestamp: Date.now()
        });
        
        // Keep only recent metrics
        const cutoff = Date.now() - this.performanceWindow;
        this.performanceMetrics.set(
            serviceName,
            metrics.filter(m => m.timestamp > cutoff)
        );
    }
    
    updateStatistics(strategy, duration, success) {
        this.statistics.byStrategy[strategy] = 
            (this.statistics.byStrategy[strategy] || 0) + 1;
        
        const total = this.statistics.successfulAggregations + 
                     this.statistics.failedAggregations;
        
        this.statistics.averageAggregationTime = 
            (this.statistics.averageAggregationTime * total + duration) / (total + 1);
    }
    
    processBatch(batchKey) {
        const batch = this.batchQueue.get(batchKey);
        if (!batch || batch.length === 0) return;
        
        this.batchQueue.set(batchKey, []);
        
        // Process all requests in batch
        Promise.all(batch.map(item => 
            this.aggregate(item.req, item.config)
                .then(response => item.resolve(response))
                .catch(error => item.reject(error))
        ));
    }
    
    createStreamingPipeline(services, correlationId) {
        const transforms = services.map(service => {
            return new Transform({
                objectMode: true,
                transform: async (chunk, encoding, callback) => {
                    try {
                        const response = await this.callService(chunk, service, correlationId);
                        callback(null, response);
                    } catch (error) {
                        callback(error);
                    }
                }
            });
        });
        
        return transforms;
    }
    
    startStreaming(req, pipeline, outputStream, config, correlationId) {
        let currentStream = outputStream;
        
        for (const transform of pipeline) {
            currentStream = currentStream.pipe(transform);
        }
        
        currentStream.on('error', (error) => {
            this.log('error', 'Streaming aggregation failed', { correlationId, error });
            outputStream.destroy(error);
        });
        
        currentStream.on('end', () => {
            this.log('info', 'Streaming aggregation completed', { correlationId });
        });
        
        // Start streaming with initial data
        currentStream.write(req.body);
    }
    
    evaluateCondition(condition, req, responses) {
        if (typeof condition.evaluate === 'function') {
            return condition.evaluate(req, responses);
        }
        
        if (condition.field && condition.value) {
            const fieldValue = this.getNestedValue(req, condition.field);
            
            switch (condition.operator) {
                case 'eq': return fieldValue === condition.value;
                case 'neq': return fieldValue !== condition.value;
                case 'gt': return fieldValue > condition.value;
                case 'gte': return fieldValue >= condition.value;
                case 'lt': return fieldValue < condition.value;
                case 'lte': return fieldValue <= condition.value;
                case 'contains': return fieldValue?.includes?.(condition.value);
                case 'regex': return new RegExp(condition.value).test(fieldValue);
                default: return false;
            }
        }
        
        return true;
    }
    
    parseGraphQLQuery(query) {
        // Simplified GraphQL query parsing
        // In production, use a proper GraphQL parser
        return {
            fields: {},
            variables: []
        };
    }
    
    getGraphQLResolvers(parsedQuery) {
        const resolvers = {};
        
        for (const field of Object.keys(parsedQuery.fields)) {
            const resolver = this.graphqlResolvers.get(field);
            if (resolver) {
                resolvers[field] = resolver;
            }
        }
        
        return resolvers;
    }
    
    getStageProcessor(type) {
        const processors = {
            'transform': this.transformStageProcessor.bind(this),
            'enrich': this.enrichStageProcessor.bind(this),
            'filter': this.filterStageProcessor.bind(this),
            'aggregate': this.aggregateStageProcessor.bind(this),
            'validate': this.validateStageProcessor.bind(this)
        };
        
        return processors[type];
    }
    
    async transformStageProcessor(data, stage, req, correlationId) {
        return this.applyTransformation(data, stage.config);
    }
    
    async enrichStageProcessor(data, stage, req, correlationId) {
        const enricher = this.dataEnrichers.get(stage.enricher);
        if (enricher) {
            return await enricher(data, req, correlationId);
        }
        return data;
    }
    
    async filterStageProcessor(data, stage, req, correlationId) {
        if (stage.filter && typeof stage.filter === 'function') {
            return stage.filter(data);
        }
        return data;
    }
    
    async aggregateStageProcessor(data, stage, req, correlationId) {
        if (Array.isArray(data) && stage.aggregation) {
            return data.reduce(stage.aggregation.reducer, stage.aggregation.initialValue);
        }
        return data;
    }
    
    async validateStageProcessor(data, stage, req, correlationId) {
        await this.validateData(data, stage.schema);
        return data;
    }
    
    async applyTransformation(data, transform) {
        if (typeof transform === 'function') {
            return await transform(data);
        }
        return data;
    }
    
    async validateData(data, schema) {
        if (!schema) return;
        
        const validator = this.ajv.compile(schema);
        const valid = validator(data);
        
        if (!valid) {
            throw new Error(`Data validation failed: ${JSON.stringify(validator.errors)}`);
        }
    }

    /**
     * Starts monitoring
     * @private
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.emit('aggregation:statistics', this.getStatistics());
            
            // Clean old performance metrics
            const cutoff = Date.now() - this.performanceWindow;
            for (const [service, metrics] of this.performanceMetrics) {
                this.performanceMetrics.set(
                    service,
                    metrics.filter(m => m.timestamp > cutoff)
                );
            }
        }, 30000); // Every 30 seconds
        
        this.log('info', 'Response aggregation monitoring started');
    }

    /**
     * Starts cleanup
     * @private
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            
            // Clean expired cache entries
            for (const [key, entry] of this.responseCache) {
                if (entry.expiry < now) {
                    this.responseCache.delete(key);
                }
            }
            
            // Clean old correlation contexts
            for (const [id, context] of this.correlationMap) {
                if (now - context.startTime > 300000) { // 5 minutes
                    this.correlationMap.delete(id);
                }
            }
            
            // Clean template cache
            for (const [key, cached] of this.templateCache) {
                if (cached.expiry < now) {
                    this.templateCache.delete(key);
                }
            }
        }, 60000); // Every minute
        
        this.log('info', 'Response aggregation cleanup started');
    }

    /**
     * Registers custom aggregator
     * @param {string} name - Aggregator name
     * @param {Function} aggregator - Aggregator function
     */
    registerCustomAggregator(name, aggregator) {
        this.customAggregators.set(name, aggregator);
        this.log('info', `Custom aggregator registered: ${name}`);
    }

    /**
     * Registers response transformer
     * @param {string} name - Transformer name
     * @param {Function} transformer - Transformer function
     */
    registerTransformer(name, transformer) {
        this.responseTransformers.set(name, transformer);
        this.log('info', `Response transformer registered: ${name}`);
    }

    /**
     * Registers data enricher
     * @param {string} name - Enricher name
     * @param {Function} enricher - Enricher function
     */
    registerEnricher(name, enricher) {
        this.dataEnrichers.set(name, enricher);
        this.log('info', `Data enricher registered: ${name}`);
    }

    /**
     * Adds response interceptor
     * @param {Function} interceptor - Interceptor function
     */
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }

    /**
     * Adds request interceptor
     * @param {Function} interceptor - Interceptor function
     */
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }

    /**
     * Gets aggregation statistics
     * @returns {Object} Aggregation statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheStats: this.cacheStats,
            activeBatches: this.batchQueue.size,
            activeStreams: this.activeStreams.size,
            registeredAggregators: this.customAggregators.size,
            registeredTransformers: this.responseTransformers.size,
            performanceMetrics: Object.fromEntries(
                Array.from(this.performanceMetrics.entries()).map(([service, metrics]) => [
                    service,
                    {
                        count: metrics.length,
                        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length || 0,
                        successRate: metrics.filter(m => m.success).length / metrics.length || 0
                    }
                ])
            )
        };
    }

    /**
     * Resets statistics
     */
    resetStatistics() {
        this.statistics = {
            totalAggregations: 0,
            successfulAggregations: 0,
            failedAggregations: 0,
            partialAggregations: 0,
            averageAggregationTime: 0,
            cacheHitRate: 0,
            transformationsApplied: 0,
            validationErrors: 0,
            serviceCalls: 0,
            parallelExecutions: 0,
            sequentialExecutions: 0,
            streamingAggregations: 0,
            byStrategy: {},
            byService: {}
        };
        
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
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
     * Cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.log('info', 'Cleaning up Response Aggregation Middleware');
        
        // Clear intervals
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Clear maps
        this.aggregationStrategies.clear();
        this.customAggregators.clear();
        this.transformationPipelines.clear();
        this.responseTransformers.clear();
        this.responseSchemas.clear();
        this.schemaValidators.clear();
        this.aggregationTemplates.clear();
        this.templateCache.clear();
        this.executionPools.clear();
        this.compositionRules.clear();
        this.conditionalComposers.clear();
        this.fieldMappings.clear();
        this.dataEnrichers.clear();
        this.responseCache.clear();
        this.streamingAggregators.clear();
        this.activeStreams.clear();
        this.performanceMetrics.clear();
        this.correlationMap.clear();
        this.batchQueue.clear();
        this.graphqlResolvers.clear();
        this.graphqlSchemas.clear();
        this.contentNegotiators.clear();
        
        // Clear interceptors
        this.responseInterceptors = [];
        this.requestInterceptors = [];
        
        this.isInitialized = false;
        this.emit('aggregation:cleanup');
    }
}

module.exports = { ResponseAggregationMiddleware };