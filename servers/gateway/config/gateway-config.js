/**
 * Configuration Manager for API Gateway
 * Handles all configuration loading, validation, and management
 */

const fs = require('fs').promises;
const path = require('path');
const Joi = require('joi');
const _ = require('lodash');

/**
 * Configuration Manager Class
 */
class ConfigManager {
    constructor() {
        this.config = {};
        this.environment = process.env.NODE_ENV || 'development';
        this.configPath = path.join(__dirname, 'environments');
        this.schemas = this.defineSchemas();
    }

    /**
     * Define configuration schemas for validation
     */
    defineSchemas() {
        return {
            server: Joi.object({
                port: Joi.number().integer().min(1).max(65535).default(3000),
                host: Joi.string().hostname().default('0.0.0.0'),
                timeout: Joi.number().integer().min(1000).default(120000),
                keepAliveTimeout: Joi.number().integer().min(1000).default(65000),
                headersTimeout: Joi.number().integer().min(1000).default(66000),
                bodyLimit: Joi.string().default('10mb'),
                trustProxy: Joi.boolean().default(true)
            }),

            services: Joi.object({
                adminServer: Joi.object({
                    url: Joi.string().uri().required(),
                    healthPath: Joi.string().default('/health'),
                    timeout: Joi.number().integer().default(30000),
                    retries: Joi.number().integer().default(3),
                    weight: Joi.number().integer().default(1)
                }),
                customerServices: Joi.object({
                    url: Joi.string().uri().required(),
                    healthPath: Joi.string().default('/health'),
                    timeout: Joi.number().integer().default(30000),
                    retries: Joi.number().integer().default(3),
                    weight: Joi.number().integer().default(1)
                }),
                discovery: Joi.object({
                    enabled: Joi.boolean().default(false),
                    type: Joi.string().valid('consul', 'etcd', 'static').default('static'),
                    refreshInterval: Joi.number().integer().default(30000),
                    consul: Joi.object({
                        host: Joi.string().hostname(),
                        port: Joi.number().integer(),
                        secure: Joi.boolean().default(false)
                    }).optional(),
                    etcd: Joi.object({
                        hosts: Joi.array().items(Joi.string()),
                        credentials: Joi.object().optional()
                    }).optional()
                })
            }),

            routing: Joi.object({
                rules: Joi.array().items(
                    Joi.object({
                        name: Joi.string().required(),
                        path: Joi.string().required(),
                        target: Joi.string().required(),
                        methods: Joi.array().items(Joi.string()).default(['*']),
                        rewrite: Joi.boolean().default(false),
                        stripPath: Joi.boolean().default(false),
                        preserveHostHeader: Joi.boolean().default(true),
                        loadBalancing: Joi.string().valid('round-robin', 'least-connections', 'random').default('round-robin')
                    })
                ),
                defaultTarget: Joi.string().default('customer-services')
            }),

            security: Joi.object({
                helmet: Joi.object({
                    contentSecurityPolicy: Joi.alternatives().try(Joi.boolean(), Joi.object()).default(false),
                    hsts: Joi.object({
                        maxAge: Joi.number().default(31536000),
                        includeSubDomains: Joi.boolean().default(true),
                        preload: Joi.boolean().default(true)
                    }).default()
                }).default(),
                cors: Joi.object({
                    origin: Joi.alternatives().try(
                        Joi.boolean(),
                        Joi.string(),
                        Joi.array().items(Joi.string()),
                        Joi.function()
                    ).default(true),
                    credentials: Joi.boolean().default(true),
                    methods: Joi.array().items(Joi.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
                    allowedHeaders: Joi.array().items(Joi.string()).default(['Content-Type', 'Authorization']),
                    exposedHeaders: Joi.array().items(Joi.string()).default(['X-Request-ID']),
                    maxAge: Joi.number().default(86400)
                }).default(),
                ipWhitelist: Joi.object({
                    enabled: Joi.boolean().default(false),
                    ips: Joi.array().items(Joi.string()),
                    checkHeader: Joi.string().default('X-Forwarded-For')
                }),
                cookieSecret: Joi.string().default('change-this-secret-in-production')
            }),

            authentication: Joi.object({
                enabled: Joi.boolean().default(true),
                jwt: Joi.object({
                    secret: Joi.string().required(),
                    publicKey: Joi.string().optional(),
                    algorithm: Joi.string().default('HS256'),
                    expiresIn: Joi.string().default('1h'),
                    refreshExpiresIn: Joi.string().default('7d'),
                    issuer: Joi.string().default('insightserenity'),
                    audience: Joi.string().default('api-gateway')
                }),
                excludePaths: Joi.array().items(Joi.string()).default([
                    '/health',
                    '/metrics',
                    '/docs'
                ]),
                sessionStore: Joi.object({
                    type: Joi.string().valid('memory', 'redis').default('redis'),
                    prefix: Joi.string().default('sess:'),
                    ttl: Joi.number().default(3600)
                })
            }),

            rateLimit: Joi.object({
                enabled: Joi.boolean().default(true),
                global: Joi.object({
                    windowMs: Joi.number().default(60000),
                    max: Joi.number().default(100),
                    message: Joi.string().default('Too many requests'),
                    standardHeaders: Joi.boolean().default(true),
                    legacyHeaders: Joi.boolean().default(false)
                }),
                endpoints: Joi.array().items(
                    Joi.object({
                        path: Joi.string().required(),
                        windowMs: Joi.number().required(),
                        max: Joi.number().required()
                    })
                ),
                store: Joi.object({
                    type: Joi.string().valid('memory', 'redis').default('redis'),
                    prefix: Joi.string().default('rl:'),
                    client: Joi.any().optional()
                })
            }),

            cache: Joi.object({
                enabled: Joi.boolean().default(true),
                redis: Joi.object({
                    host: Joi.string().default('localhost'),
                    port: Joi.number().default(6379),
                    password: Joi.string().optional(),
                    db: Joi.number().default(0),
                    keyPrefix: Joi.string().default('gateway:'),
                    retryStrategy: Joi.function().optional()
                }),
                ttl: Joi.object({
                    default: Joi.number().default(300),
                    api: Joi.number().default(60),
                    static: Joi.number().default(3600)
                }),
                endpoints: Joi.array().items(
                    Joi.object({
                        path: Joi.string().required(),
                        ttl: Joi.number().required(),
                        key: Joi.function().optional()
                    })
                )
            }),

            circuitBreaker: Joi.object({
                enabled: Joi.boolean().default(true),
                timeout: Joi.number().default(30000),
                errorThresholdPercentage: Joi.number().default(50),
                resetTimeout: Joi.number().default(30000),
                rollingCountTimeout: Joi.number().default(10000),
                rollingCountBuckets: Joi.number().default(10),
                volumeThreshold: Joi.number().default(20),
                halfOpenRequests: Joi.number().default(3)
            }),

            multiTenant: Joi.object({
                enabled: Joi.boolean().default(true),
                strategy: Joi.string().valid('subdomain', 'header', 'path').default('subdomain'),
                headerName: Joi.string().default('X-Tenant-ID'),
                defaultTenant: Joi.string().default('default'),
                validation: Joi.object({
                    enabled: Joi.boolean().default(true),
                    cache: Joi.boolean().default(true),
                    cacheTtl: Joi.number().default(300)
                })
            }),

            tracing: Joi.object({
                enabled: Joi.boolean().default(true),
                serviceName: Joi.string().default('api-gateway'),
                endpoint: Joi.string().default('http://localhost:4318/v1/traces'),
                samplingRate: Joi.number().min(0).max(1).default(1),
                propagators: Joi.array().items(Joi.string()).default(['tracecontext', 'baggage']),
                exportIntervalMillis: Joi.number().default(5000),
                exportTimeoutMillis: Joi.number().default(10000)
            }),

            metrics: Joi.object({
                enabled: Joi.boolean().default(true),
                port: Joi.number().default(9090),
                path: Joi.string().default('/metrics'),
                defaultLabels: Joi.object().default({}),
                buckets: Joi.array().items(Joi.number()).default([0.003, 0.03, 0.1, 0.3, 1.5, 10])
            }),

            logging: Joi.object({
                level: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
                format: Joi.string().valid('json', 'simple', 'combined').default('json'),
                console: Joi.boolean().default(true),
                file: Joi.object({
                    enabled: Joi.boolean().default(false),
                    filename: Joi.string().default('gateway.log'),
                    maxSize: Joi.string().default('20m'),
                    maxFiles: Joi.number().default(5),
                    compress: Joi.boolean().default(true)
                }),
                excludePaths: Joi.array().items(Joi.string()).default(['/health', '/metrics'])
            }),

            websocket: Joi.object({
                enabled: Joi.boolean().default(true),
                path: Joi.string().default('/ws'),
                perMessageDeflate: Joi.boolean().default(true),
                clientTracking: Joi.boolean().default(true),
                maxPayload: Joi.number().default(100 * 1024 * 1024)
            }),

            documentation: Joi.object({
                enabled: Joi.boolean().default(true),
                path: Joi.string().default('/docs'),
                requireAuth: Joi.boolean().default(false),
                swagger: Joi.object({
                    title: Joi.string().default('InsightSerenity API Gateway'),
                    version: Joi.string().default('1.0.0'),
                    description: Joi.string().default('Enterprise API Gateway Documentation'),
                    basePath: Joi.string().default('/'),
                    schemes: Joi.array().items(Joi.string()).default(['https', 'http'])
                })
            }),

            admin: Joi.object({
                enabled: Joi.boolean().default(true),
                path: Joi.string().default('/admin'),
                username: Joi.string().default('admin'),
                password: Joi.string().required()
            }),

            healthCheck: Joi.object({
                interval: Joi.number().default(30000),
                timeout: Joi.number().default(5000),
                unhealthyThreshold: Joi.number().default(2),
                healthyThreshold: Joi.number().default(3)
            }),

            compression: Joi.object({
                enabled: Joi.boolean().default(true),
                level: Joi.number().min(0).max(9).default(6),
                threshold: Joi.string().default('1kb'),
                filter: Joi.function().optional()
            }),

            transformation: Joi.object({
                request: Joi.object({
                    enabled: Joi.boolean().default(true),
                    headers: Joi.object({
                        add: Joi.object().default({}),
                        remove: Joi.array().items(Joi.string()).default([]),
                        modify: Joi.object().default({})
                    }),
                    body: Joi.object({
                        enabled: Joi.boolean().default(false),
                        transformations: Joi.array().items(Joi.object())
                    })
                }),
                response: Joi.object({
                    enabled: Joi.boolean().default(true),
                    headers: Joi.object({
                        add: Joi.object().default({}),
                        remove: Joi.array().items(Joi.string()).default([]),
                        modify: Joi.object().default({})
                    }),
                    body: Joi.object({
                        enabled: Joi.boolean().default(false),
                        transformations: Joi.array().items(Joi.object())
                    })
                })
            }),

            validation: Joi.object({
                enabled: Joi.boolean().default(true),
                request: Joi.object({
                    headers: Joi.boolean().default(true),
                    body: Joi.boolean().default(true),
                    query: Joi.boolean().default(true),
                    params: Joi.boolean().default(true)
                }),
                schemas: Joi.object().default({})
            }),

            errorHandling: Joi.object({
                exposeErrors: Joi.boolean().default(false),
                includeStack: Joi.boolean().default(false),
                customHandlers: Joi.object().default({})
            })
        };
    }

    /**
     * Load configuration from files and environment
     */
    async load() {
        try {
            // Load base configuration
            const baseConfig = await this.loadConfigFile('base.config.js');
            
            // Load environment-specific configuration
            const envConfig = await this.loadConfigFile(`${this.environment}.config.js`);
            
            // Merge configurations
            this.config = _.merge({}, baseConfig, envConfig);
            
            // Override with environment variables
            this.applyEnvironmentVariables();
            
            // Validate configuration
            await this.validate();
            
            // Process dynamic values
            this.processDynamicValues();
            
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    /**
     * Load a configuration file
     */
    async loadConfigFile(filename) {
        const filepath = path.join(this.configPath, filename);
        
        try {
            await fs.access(filepath);
            const config = require(filepath);
            return typeof config === 'function' ? config() : config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`Configuration file not found: ${filename}`);
                return {};
            }
            throw error;
        }
    }

    /**
     * Apply environment variable overrides
     */
    applyEnvironmentVariables() {
        const envMappings = {
            'GATEWAY_PORT': 'server.port',
            'GATEWAY_HOST': 'server.host',
            'ADMIN_SERVER_URL': 'services.adminServer.url',
            'CUSTOMER_SERVICES_URL': 'services.customerServices.url',
            'JWT_SECRET': 'authentication.jwt.secret',
            'JWT_PUBLIC_KEY': 'authentication.jwt.publicKey',
            'REDIS_HOST': 'cache.redis.host',
            'REDIS_PORT': 'cache.redis.port',
            'REDIS_PASSWORD': 'cache.redis.password',
            'LOG_LEVEL': 'logging.level',
            'TRACING_ENABLED': 'tracing.enabled',
            'TRACING_ENDPOINT': 'tracing.endpoint',
            'METRICS_ENABLED': 'metrics.enabled',
            'RATE_LIMIT_ENABLED': 'rateLimit.enabled',
            'CIRCUIT_BREAKER_ENABLED': 'circuitBreaker.enabled',
            'MULTI_TENANT_ENABLED': 'multiTenant.enabled',
            'ADMIN_PASSWORD': 'admin.password'
        };

        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const value = process.env[envVar];
            if (value !== undefined) {
                _.set(this.config, configPath, this.parseEnvValue(value));
            }
        }
    }

    /**
     * Parse environment variable value
     */
    parseEnvValue(value) {
        // Boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        // Number
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            return parseFloat(value);
        }
        
        // JSON
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    /**
     * Validate configuration against schemas
     */
    async validate() {
        const errors = [];
        
        for (const [section, schema] of Object.entries(this.schemas)) {
            const { error, value } = schema.validate(this.config[section] || {}, {
                abortEarly: false,
                allowUnknown: true
            });
            
            if (error) {
                errors.push(...error.details.map(detail => ({
                    section,
                    path: detail.path.join('.'),
                    message: detail.message
                })));
            } else {
                this.config[section] = value;
            }
        }
        
        if (errors.length > 0) {
            const errorMessage = errors.map(e => 
                `${e.section}.${e.path}: ${e.message}`
            ).join('\n');
            throw new Error(`Configuration validation failed:\n${errorMessage}`);
        }
    }

    /**
     * Process dynamic values in configuration
     */
    processDynamicValues() {
        // Add dynamic routing rules based on services
        if (!this.config.routing || !this.config.routing.rules) {
            this.config.routing = {
                rules: [
                    {
                        name: 'admin-routes',
                        path: '/api/admin',
                        target: 'admin-server',
                        stripPath: false
                    },
                    {
                        name: 'customer-routes',
                        path: '/api',
                        target: 'customer-services',
                        stripPath: false
                    }
                ],
                defaultTarget: 'customer-services'
            };
        }
        
        // Set default labels for metrics
        this.config.metrics.defaultLabels = {
            ...this.config.metrics.defaultLabels,
            service: 'api-gateway',
            environment: this.environment,
            version: require('../package.json').version
        };
    }

    /**
     * Get configuration value by path
     */
    get(path, defaultValue) {
        return _.get(this.config, path, defaultValue);
    }

    /**
     * Set configuration value by path
     */
    set(path, value) {
        _.set(this.config, path, value);
    }

    /**
     * Get entire configuration
     */
    getAll() {
        return _.cloneDeep(this.config);
    }

    /**
     * Reload configuration
     */
    async reload() {
        await this.load();
    }

    /**
     * Export configuration for debugging
     */
    export() {
        const safeConfig = _.cloneDeep(this.config);
        
        // Remove sensitive values
        const sensitiveKeys = [
            'authentication.jwt.secret',
            'authentication.jwt.publicKey',
            'cache.redis.password',
            'admin.password',
            'security.cookieSecret'
        ];
        
        for (const key of sensitiveKeys) {
            const value = _.get(safeConfig, key);
            if (value) {
                _.set(safeConfig, key, '[REDACTED]');
            }
        }
        
        return safeConfig;
    }
}

module.exports = { ConfigManager };