'use strict';

/**
 * @fileoverview System Monitoring Routes Index - Central export and configuration for all system monitoring routes
 * @module servers/admin-server/modules/system-monitoring/routes
 * @requires express
 * @requires module:servers/admin-server/modules/system-monitoring/routes/system-health-routes
 * @requires module:servers/admin-server/modules/system-monitoring/routes/performance-monitoring-routes
 * @requires module:servers/admin-server/modules/system-monitoring/routes/metrics-collection-routes
 * @requires module:servers/admin-server/modules/system-monitoring/routes/alerting-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const crypto = require('crypto');
const os = require('os');
const systemHealthRoutes = require('./system-health-routes');
const performanceMonitoringRoutes = require('./performance-monitoring-routes');
const metricsCollectionRoutes = require('./metrics-collection-routes');
const alertingRoutes = require('./alerting-routes');
const logger = require('../../../../../shared/lib/utils/logger');
const { ResponseFormatter } = require('../../../../../shared/lib/utils/response-formatter');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');

/**
 * SystemMonitoringRoutesManager class handles the configuration, initialization,
 * and management of all system monitoring related routes. It provides a centralized
 * interface for registering routes with the Express application while maintaining
 * proper middleware ordering, error handling, and comprehensive system observability.
 * 
 * @class SystemMonitoringRoutesManager
 */
class SystemMonitoringRoutesManager {
    /**
     * Private fields for internal state management
     */
    #router;
    #config;
    #responseFormatter;
    #routeRegistry;
    #metricsCollector;
    #healthChecks;
    #routeDocumentation;
    #securityConfig;
    #middlewareStack;
    #initialized;
    #performanceMetrics;
    #auditLog;
    #circuitBreaker;
    #rateLimiters;
    #cacheManager;
    #alertManager;
    #systemHealthMonitor;
    #performanceAnalyzer;
    #resourceTracker;
    #anomalyDetector;
    #predictiveAnalytics;
    #infrastructureMonitor;
    #applicationMonitor;
    #networkMonitor;
    #securityMonitor;
    #capacityPlanner;

    /**
     * Constructor initializes the routes manager with default configurations
     * and prepares the internal state for route registration and management.
     */
    constructor() {
        this.#router = express.Router();
        this.#responseFormatter = new ResponseFormatter();
        this.#routeRegistry = new Map();
        this.#metricsCollector = new Map();
        this.#healthChecks = new Map();
        this.#routeDocumentation = [];
        this.#middlewareStack = [];
        this.#initialized = false;

        this.#initializeConfiguration();
        this.#initializeSecurityConfig();
        this.#initializePerformanceTracking();
        this.#initializeAuditSystem();
        this.#initializeCircuitBreakers();
        this.#initializeRateLimiters();
        this.#initializeCacheManager();
        this.#initializeAlertManager();
        this.#initializeSystemHealthMonitor();
        this.#initializePerformanceAnalyzer();
        this.#initializeResourceTracker();
        this.#initializeAnomalyDetector();
        this.#initializePredictiveAnalytics();
        this.#initializeInfrastructureMonitor();
        this.#initializeApplicationMonitor();
        this.#initializeNetworkMonitor();
        this.#initializeSecurityMonitor();
        this.#initializeCapacityPlanner();
        this.#setupBaseMiddleware();
        this.#registerRouteModules();
        this.#setupHealthChecks();
        this.#setupMetricsCollection();
        this.#generateRouteDocumentation();
        this.#startBackgroundMonitoring();

        logger.info('SystemMonitoringRoutesManager initialized successfully', {
            module: 'system-monitoring',
            version: this.#config.apiVersion,
            monitoringLevel: 'COMPREHENSIVE',
            capabilities: this.#config.featureFlags
        });
    }

    /**
     * Initialize default configuration for the routes manager.
     * This includes API versioning, route prefixes, feature flags,
     * and operational parameters.
     * 
     * @private
     */
    #initializeConfiguration() {
        this.#config = {
            apiVersion: process.env.API_VERSION || 'v1',
            basePrefix: process.env.SYSTEM_MONITORING_BASE_PATH || '/api/v1/system-monitoring',
            enableMetrics: process.env.ENABLE_ROUTE_METRICS !== 'false',
            enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
            enableDocumentation: process.env.ENABLE_ROUTE_DOCS !== 'false',
            enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
            enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
            enableCaching: process.env.ENABLE_ROUTE_CACHING !== 'false',
            requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
            maxRequestSize: process.env.MAX_REQUEST_SIZE || '5mb',
            corsEnabled: process.env.ENABLE_CORS !== 'false',
            compressionEnabled: process.env.ENABLE_COMPRESSION !== 'false',
            
            routePrefixes: {
                health: '/health',
                performance: '/performance',
                metrics: '/metrics',
                alerts: '/alerts'
            },
            
            featureFlags: {
                enableSystemHealth: process.env.FEATURE_SYSTEM_HEALTH !== 'false',
                enablePerformanceMonitoring: process.env.FEATURE_PERFORMANCE_MONITORING !== 'false',
                enableMetricsCollection: process.env.FEATURE_METRICS_COLLECTION !== 'false',
                enableAlerting: process.env.FEATURE_ALERTING !== 'false',
                enableAnomalyDetection: process.env.FEATURE_ANOMALY_DETECTION !== 'false',
                enablePredictiveAnalytics: process.env.FEATURE_PREDICTIVE_ANALYTICS !== 'false',
                enableCapacityPlanning: process.env.FEATURE_CAPACITY_PLANNING !== 'false',
                enableInfrastructureMonitoring: process.env.FEATURE_INFRASTRUCTURE_MONITORING !== 'false',
                enableApplicationMonitoring: process.env.FEATURE_APPLICATION_MONITORING !== 'false',
                enableNetworkMonitoring: process.env.FEATURE_NETWORK_MONITORING !== 'false'
            },
            
            monitoring: {
                logLevel: process.env.ROUTE_LOG_LEVEL || 'info',
                metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 30000,
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 15000,
                slowRouteThreshold: parseInt(process.env.SLOW_ROUTE_THRESHOLD) || 1000,
                errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05,
                systemThresholds: {
                    cpuUsage: 80,
                    memoryUsage: 85,
                    diskUsage: 90,
                    networkLatency: 500,
                    errorRate: 0.05,
                    responseTime: 2000,
                    throughput: 1000,
                    connectionCount: 10000
                },
                retentionPeriods: {
                    metrics: 604800000, // 7 days
                    logs: 2592000000, // 30 days
                    alerts: 7776000000, // 90 days
                    performance: 2592000000 // 30 days
                }
            },
            
            collection: {
                systemMetrics: {
                    enabled: true,
                    interval: 30000, // 30 seconds
                    detailed: process.env.DETAILED_SYSTEM_METRICS === 'true'
                },
                applicationMetrics: {
                    enabled: true,
                    interval: 60000, // 1 minute
                    includeCustomMetrics: true
                },
                performanceMetrics: {
                    enabled: true,
                    interval: 15000, // 15 seconds
                    includeTracing: process.env.PERFORMANCE_TRACING === 'true'
                },
                businessMetrics: {
                    enabled: process.env.BUSINESS_METRICS_ENABLED === 'true',
                    interval: 300000 // 5 minutes
                }
            },
            
            alerting: {
                enabled: true,
                channels: ['email', 'slack', 'webhook', 'sms', 'pager'],
                severityLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                escalationRules: {
                    'CRITICAL': { timeout: 300000, escalateAfter: 1 },
                    'HIGH': { timeout: 900000, escalateAfter: 2 },
                    'MEDIUM': { timeout: 1800000, escalateAfter: 5 },
                    'LOW': { timeout: 3600000, escalateAfter: 10 }
                },
                suppressionRules: {
                    enabled: true,
                    maxSimilar: 5,
                    timeWindow: 300000
                },
                autoRemediation: {
                    enabled: process.env.AUTO_REMEDIATION_ENABLED === 'true',
                    actions: ['restart_service', 'scale_up', 'clear_cache', 'rotate_logs']
                }
            },
            
            storage: {
                timeseries: {
                    enabled: process.env.TIMESERIES_DB_ENABLED === 'true',
                    provider: process.env.TIMESERIES_PROVIDER || 'influxdb',
                    retention: '30d',
                    precision: 's'
                },
                logs: {
                    enabled: true,
                    provider: process.env.LOG_STORAGE_PROVIDER || 'elasticsearch',
                    retention: '30d',
                    indexing: true
                },
                aggregation: {
                    enabled: true,
                    intervals: ['1m', '5m', '15m', '1h', '1d'],
                    functions: ['avg', 'min', 'max', 'sum', 'count']
                }
            },
            
            integration: {
                prometheus: {
                    enabled: process.env.PROMETHEUS_INTEGRATION === 'true',
                    endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
                    pushgateway: process.env.PROMETHEUS_PUSHGATEWAY_URL
                },
                grafana: {
                    enabled: process.env.GRAFANA_INTEGRATION === 'true',
                    endpoint: process.env.GRAFANA_ENDPOINT,
                    datasources: ['prometheus', 'influxdb', 'elasticsearch']
                },
                datadog: {
                    enabled: process.env.DATADOG_INTEGRATION === 'true',
                    apiKey: process.env.DATADOG_API_KEY,
                    tags: process.env.DATADOG_TAGS?.split(',') || []
                },
                newrelic: {
                    enabled: process.env.NEWRELIC_INTEGRATION === 'true',
                    licenseKey: process.env.NEWRELIC_LICENSE_KEY
                },
                splunk: {
                    enabled: process.env.SPLUNK_INTEGRATION === 'true',
                    endpoint: process.env.SPLUNK_ENDPOINT,
                    token: process.env.SPLUNK_TOKEN
                }
            }
        };
    }

    /**
     * Initialize security configuration for route protection.
     * This includes authentication requirements, authorization levels,
     * and monitoring-specific security measures.
     * 
     * @private
     */
    #initializeSecurityConfig() {
        this.#securityConfig = {
            authentication: {
                required: true,
                excludePaths: [
                    '/health/live',
                    '/health/ready',
                    '/metrics/prometheus',
                    '/metrics/public'
                ],
                tokenValidation: {
                    algorithm: 'HS256',
                    issuer: process.env.JWT_ISSUER || 'insightserenity',
                    audience: process.env.JWT_AUDIENCE || 'monitoring-api',
                    maxAge: process.env.JWT_MAX_AGE || '24h'
                }
            },
            
            authorization: {
                defaultRequiredRoles: ['MONITORING_ADMIN'],
                roleHierarchy: {
                    'SUPER_ADMIN': 10,
                    'PLATFORM_ADMIN': 9,
                    'MONITORING_ADMIN': 8,
                    'SRE': 7,
                    'DEVOPS_ENGINEER': 6,
                    'SYSTEM_ADMIN': 5,
                    'OPERATIONS_MANAGER': 4,
                    'SUPPORT_ENGINEER': 3,
                    'DEVELOPER': 2,
                    'READ_ONLY_MONITORING': 1
                },
                resourcePermissions: {
                    'health': ['read', 'check', 'test'],
                    'performance': ['read', 'analyze', 'optimize'],
                    'metrics': ['read', 'collect', 'export', 'configure'],
                    'alerts': ['read', 'create', 'update', 'acknowledge', 'silence'],
                    'system': ['read', 'configure', 'restart', 'scale'],
                    'infrastructure': ['read', 'monitor', 'manage']
                },
                permissionCache: {
                    enabled: true,
                    ttl: 600,
                    maxSize: 1000
                }
            },
            
            headers: {
                hsts: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true
                },
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", "'unsafe-inline'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        imgSrc: ["'self'", 'data:', 'https:'],
                        connectSrc: ["'self'"],
                        fontSrc: ["'self'"],
                        objectSrc: ["'none'"],
                        mediaSrc: ["'self'"],
                        frameSrc: ["'none'"]
                    }
                },
                referrerPolicy: 'strict-origin-when-cross-origin',
                xContentTypeOptions: 'nosniff',
                xFrameOptions: 'DENY',
                xXssProtection: '1; mode=block'
            },
            
            rateLimiting: {
                windowMs: 60000,
                max: 500, // Higher limit for monitoring APIs
                standardHeaders: true,
                legacyHeaders: false,
                skipSuccessfulRequests: false,
                keyGenerator: (req) => `${req.user?.id || req.ip}_monitoring`,
                message: 'Monitoring API rate limit exceeded'
            },
            
            encryption: {
                algorithm: 'aes-256-gcm',
                keyRotationInterval: 86400000,
                sensitiveFields: [
                    'password',
                    'apiKey',
                    'token',
                    'secret',
                    'privateKey',
                    'connectionString'
                ]
            },
            
            ipWhitelist: {
                enabled: process.env.MONITORING_IP_WHITELIST_ENABLED === 'true',
                allowedIps: (process.env.MONITORING_ALLOWED_IPS || '').split(',').filter(Boolean)
            }
        };
    }

    /**
     * Initialize performance tracking system
     * @private
     */
    #initializePerformanceTracking() {
        this.#performanceMetrics = {
            routes: new Map(),
            system: {
                startTime: Date.now(),
                requestCount: 0,
                errorCount: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                monitoringOperations: 0,
                healthChecks: 0,
                metricsCollections: 0,
                alertsTriggered: 0
            },
            realtime: {
                cpu: { current: 0, history: [], threshold: this.#config.monitoring.systemThresholds.cpuUsage },
                memory: { current: 0, history: [], threshold: this.#config.monitoring.systemThresholds.memoryUsage },
                disk: { current: 0, history: [], threshold: this.#config.monitoring.systemThresholds.diskUsage },
                network: { current: 0, history: [], threshold: this.#config.monitoring.systemThresholds.networkLatency },
                processes: { current: 0, history: [] },
                connections: { current: 0, history: [] }
            },
            thresholds: {
                slowRoute: 1000,
                highMemory: 1024 * 1024 * 1024, // 1GB
                errorRate: 0.05,
                alertResponseTime: 5000,
                healthCheckTimeout: 10000
            },
            trends: {
                hourly: [],
                daily: [],
                weekly: [],
                monthly: []
            },
            baselines: new Map(),
            anomalies: new Map(),
            predictions: new Map()
        };
    }

    /**
     * Initialize comprehensive audit system
     * @private
     */
    #initializeAuditSystem() {
        this.#auditLog = {
            enabled: this.#config.enableAuditLogging,
            entries: [],
            maxEntries: 500000,
            retention: this.#config.monitoring.retentionPeriods.logs,
            sensitiveOperations: new Set([
                'system_configuration_change',
                'alert_rule_creation',
                'alert_rule_deletion',
                'monitoring_disable',
                'metric_deletion',
                'threshold_change',
                'escalation_change',
                'access_grant',
                'access_revoke',
                'remediation_action',
                'maintenance_mode',
                'service_restart',
                'capacity_change'
            ]),
            monitoringEvents: new Map(),
            performanceEvents: new Map(),
            securityEvents: new Map(),
            operationalEvents: new Map(),
            categories: {
                MONITORING: 'monitoring_operations',
                PERFORMANCE: 'performance_analysis',
                ALERTING: 'alert_management',
                HEALTH: 'health_monitoring',
                INFRASTRUCTURE: 'infrastructure_monitoring',
                APPLICATION: 'application_monitoring',
                SECURITY: 'security_monitoring',
                OPERATIONS: 'operational_monitoring'
            }
        };
    }

    /**
     * Initialize circuit breakers for monitoring services
     * @private
     */
    #initializeCircuitBreakers() {
        this.#circuitBreaker = {
            metricsStorage: {
                state: 'closed',
                failures: 0,
                threshold: 5,
                timeout: 60000,
                lastFailure: null
            },
            alertingService: {
                state: 'closed',
                failures: 0,
                threshold: 3,
                timeout: 30000,
                lastFailure: null
            },
            timeseriesDb: {
                state: 'closed',
                failures: 0,
                threshold: 4,
                timeout: 45000,
                lastFailure: null
            },
            logAggregation: {
                state: 'closed',
                failures: 0,
                threshold: 5,
                timeout: 60000,
                lastFailure: null
            },
            externalIntegrations: {
                state: 'closed',
                failures: 0,
                threshold: 10,
                timeout: 120000,
                lastFailure: null
            },
            anomalyDetection: {
                state: 'closed',
                failures: 0,
                threshold: 3,
                timeout: 90000,
                lastFailure: null
            }
        };
    }

    /**
     * Initialize rate limiting configurations
     * @private
     */
    #initializeRateLimiters() {
        this.#rateLimiters = {
            standard: { windowMs: 60000, max: 500 },
            strict: { windowMs: 60000, max: 100 },
            health: { windowMs: 60000, max: 1000 },
            performance: { windowMs: 60000, max: 200 },
            metrics: { windowMs: 60000, max: 1000 },
            alerts: { windowMs: 60000, max: 100 },
            realtime: { windowMs: 10000, max: 100 },
            bulk: { windowMs: 300000, max: 50 },
            reporting: { windowMs: 300000, max: 20 },
            streaming: { windowMs: 60000, max: 10 }
        };
    }

    /**
     * Initialize cache management system
     * @private
     */
    #initializeCacheManager() {
        this.#cacheManager = {
            enabled: this.#config.enableCaching,
            ttl: 60000, // 1 minute for real-time data
            metricsTtl: 30000, // 30 seconds for metrics
            healthTtl: 15000, // 15 seconds for health data
            alertsTtl: 300000, // 5 minutes for alerts
            performanceTtl: 60000, // 1 minute for performance data
            maxSize: 50000,
            cache: new Map(),
            metricsCache: new Map(),
            healthCache: new Map(),
            alertsCache: new Map(),
            performanceCache: new Map(),
            hitRate: 0,
            missRate: 0,
            evictionCount: 0,
            cacheStrategies: {
                health: 'write-through',
                metrics: 'write-behind',
                alerts: 'write-through',
                performance: 'write-behind'
            }
        };
    }

    /**
     * Initialize alert management system
     * @private
     */
    #initializeAlertManager() {
        this.#alertManager = {
            enabled: this.#config.alerting.enabled,
            activeAlerts: new Map(),
            suppressedAlerts: new Set(),
            alertHistory: [],
            rules: new Map(),
            thresholds: this.#config.monitoring.systemThresholds,
            channels: this.#config.alerting.channels,
            escalationRules: this.#config.alerting.escalationRules,
            suppressionRules: this.#config.alerting.suppressionRules,
            autoRemediation: this.#config.alerting.autoRemediation,
            categories: {
                SYSTEM_HEALTH: 'system_health',
                PERFORMANCE: 'performance',
                RESOURCE_USAGE: 'resource_usage',
                APPLICATION_ERROR: 'application_error',
                INFRASTRUCTURE: 'infrastructure',
                SECURITY: 'security',
                CAPACITY: 'capacity',
                ANOMALY: 'anomaly'
            },
            templates: new Map(),
            integrations: {
                email: { enabled: true, templates: new Map() },
                slack: { enabled: process.env.SLACK_ALERTS === 'true', webhook: process.env.SLACK_WEBHOOK },
                pagerduty: { enabled: process.env.PAGERDUTY_ALERTS === 'true', apiKey: process.env.PAGERDUTY_API_KEY },
                webhook: { enabled: true, endpoints: new Map() }
            }
        };
    }

    /**
     * Initialize system health monitoring
     * @private
     */
    #initializeSystemHealthMonitor() {
        this.#systemHealthMonitor = {
            enabled: this.#config.featureFlags.enableSystemHealth,
            checks: new Map([
                ['cpu', { enabled: true, threshold: this.#config.monitoring.systemThresholds.cpuUsage }],
                ['memory', { enabled: true, threshold: this.#config.monitoring.systemThresholds.memoryUsage }],
                ['disk', { enabled: true, threshold: this.#config.monitoring.systemThresholds.diskUsage }],
                ['network', { enabled: true, threshold: this.#config.monitoring.systemThresholds.networkLatency }],
                ['processes', { enabled: true, threshold: 500 }],
                ['connections', { enabled: true, threshold: this.#config.monitoring.systemThresholds.connectionCount }],
                ['database', { enabled: true, threshold: 2000 }],
                ['cache', { enabled: true, threshold: 1000 }],
                ['queue', { enabled: true, threshold: 10000 }]
            ]),
            status: new Map(),
            history: new Map(),
            dependencies: new Map(),
            compositeHealth: 100,
            lastCheck: new Date(),
            checkInterval: this.#config.monitoring.healthCheckInterval
        };
    }

    /**
     * Initialize performance analyzer
     * @private
     */
    #initializePerformanceAnalyzer() {
        this.#performanceAnalyzer = {
            enabled: this.#config.featureFlags.enablePerformanceMonitoring,
            profilers: new Map(),
            bottlenecks: new Map(),
            optimizations: new Map(),
            benchmarks: new Map(),
            regressions: new Map(),
            trends: new Map(),
            analysis: {
                cpu: { enabled: true, profiling: process.env.CPU_PROFILING === 'true' },
                memory: { enabled: true, leakDetection: process.env.MEMORY_LEAK_DETECTION === 'true' },
                database: { enabled: true, queryAnalysis: process.env.QUERY_ANALYSIS === 'true' },
                network: { enabled: true, latencyTracking: true },
                application: { enabled: true, tracing: process.env.APPLICATION_TRACING === 'true' }
            },
            sampling: {
                enabled: true,
                rate: parseFloat(process.env.PERFORMANCE_SAMPLING_RATE) || 0.1,
                adaptive: process.env.ADAPTIVE_SAMPLING === 'true'
            }
        };
    }

    /**
     * Initialize resource tracking system
     * @private
     */
    #initializeResourceTracker() {
        this.#resourceTracker = {
            enabled: true,
            resources: new Map([
                ['cpu', { usage: 0, limit: 100, unit: '%' }],
                ['memory', { usage: 0, limit: os.totalmem(), unit: 'bytes' }],
                ['disk', { usage: 0, limit: 0, unit: 'bytes' }],
                ['network', { usage: 0, limit: 0, unit: 'bytes/s' }],
                ['handles', { usage: 0, limit: 65536, unit: 'count' }],
                ['connections', { usage: 0, limit: 10000, unit: 'count' }]
            ]),
            tracking: {
                interval: 30000,
                retention: 86400000, // 24 hours
                aggregation: ['avg', 'min', 'max', 'p95', 'p99']
            },
            quotas: new Map(),
            limits: new Map(),
            usage: new Map(),
            forecasts: new Map(),
            recommendations: new Map()
        };
    }

    /**
     * Initialize anomaly detection engine
     * @private
     */
    #initializeAnomalyDetector() {
        this.#anomalyDetector = {
            enabled: this.#config.featureFlags.enableAnomalyDetection,
            algorithms: {
                statistical: { enabled: true, sensitivity: 0.95 },
                machinelearning: { enabled: process.env.ML_ANOMALY_DETECTION === 'true', model: 'isolation_forest' },
                timeseries: { enabled: true, seasonal: true },
                threshold: { enabled: true, dynamic: true }
            },
            detections: new Map(),
            patterns: new Map(),
            baselines: new Map(),
            models: new Map(),
            training: {
                enabled: process.env.ANOMALY_MODEL_TRAINING === 'true',
                schedule: '0 2 * * *', // Daily at 2 AM
                dataWindow: 2592000000 // 30 days
            },
            feedback: {
                enabled: true,
                falsePositives: new Map(),
                truePositives: new Map(),
                improvements: new Map()
            }
        };
    }

    /**
     * Initialize predictive analytics system
     * @private
     */
    #initializePredictiveAnalytics() {
        this.#predictiveAnalytics = {
            enabled: this.#config.featureFlags.enablePredictiveAnalytics,
            models: new Map(),
            predictions: new Map(),
            forecasting: {
                enabled: true,
                horizon: 86400000, // 24 hours
                intervals: [3600000, 21600000, 86400000], // 1h, 6h, 24h
                confidence: 0.95
            },
            analysis: {
                trends: new Map(),
                seasonality: new Map(),
                correlations: new Map(),
                regressions: new Map()
            },
            alerts: {
                enabled: true,
                thresholds: new Map(),
                notifications: new Map()
            },
            optimization: {
                enabled: process.env.PREDICTIVE_OPTIMIZATION === 'true',
                recommendations: new Map(),
                autoApply: process.env.AUTO_APPLY_PREDICTIONS === 'true'
            }
        };
    }

    /**
     * Initialize infrastructure monitoring
     * @private
     */
    #initializeInfrastructureMonitor() {
        this.#infrastructureMonitor = {
            enabled: this.#config.featureFlags.enableInfrastructureMonitoring,
            components: new Map([
                ['servers', { monitored: new Set(), metrics: new Map() }],
                ['containers', { monitored: new Set(), metrics: new Map() }],
                ['databases', { monitored: new Set(), metrics: new Map() }],
                ['caches', { monitored: new Set(), metrics: new Map() }],
                ['queues', { monitored: new Set(), metrics: new Map() }],
                ['loadBalancers', { monitored: new Set(), metrics: new Map() }],
                ['cdns', { monitored: new Set(), metrics: new Map() }],
                ['storage', { monitored: new Set(), metrics: new Map() }]
            ]),
            discovery: {
                enabled: process.env.INFRASTRUCTURE_DISCOVERY === 'true',
                interval: 300000, // 5 minutes
                providers: ['aws', 'azure', 'gcp', 'kubernetes', 'docker']
            },
            topology: {
                enabled: true,
                mapping: new Map(),
                dependencies: new Map(),
                visualization: process.env.TOPOLOGY_VISUALIZATION === 'true'
            },
            provisioning: {
                enabled: process.env.INFRASTRUCTURE_PROVISIONING === 'true',
                templates: new Map(),
                automation: new Map()
            }
        };
    }

    /**
     * Initialize application monitoring
     * @private
     */
    #initializeApplicationMonitor() {
        this.#applicationMonitor = {
            enabled: this.#config.featureFlags.enableApplicationMonitoring,
            applications: new Map(),
            services: new Map(),
            transactions: new Map(),
            errors: new Map(),
            performance: new Map(),
            dependencies: new Map(),
            tracing: {
                enabled: process.env.APPLICATION_TRACING === 'true',
                sampling: parseFloat(process.env.TRACE_SAMPLING_RATE) || 0.1,
                spans: new Map(),
                traces: new Map()
            },
            profiling: {
                enabled: process.env.APPLICATION_PROFILING === 'true',
                cpu: process.env.CPU_PROFILING === 'true',
                memory: process.env.MEMORY_PROFILING === 'true',
                continuous: process.env.CONTINUOUS_PROFILING === 'true'
            },
            synthetic: {
                enabled: process.env.SYNTHETIC_MONITORING === 'true',
                tests: new Map(),
                schedules: new Map(),
                results: new Map()
            }
        };
    }

    /**
     * Initialize network monitoring
     * @private
     */
    #initializeNetworkMonitor() {
        this.#networkMonitor = {
            enabled: this.#config.featureFlags.enableNetworkMonitoring,
            interfaces: new Map(),
            connections: new Map(),
            traffic: new Map(),
            latency: new Map(),
            bandwidth: new Map(),
            protocols: new Map(['http', 'https', 'tcp', 'udp', 'dns']),
            monitoring: {
                ping: { enabled: true, interval: 30000 },
                traceroute: { enabled: process.env.TRACEROUTE_MONITORING === 'true', interval: 300000 },
                portScan: { enabled: process.env.PORT_SCAN_MONITORING === 'true', interval: 3600000 },
                dnsLookup: { enabled: true, interval: 60000 }
            },
            security: {
                ddosDetection: process.env.DDOS_DETECTION === 'true',
                intrusionDetection: process.env.NETWORK_INTRUSION_DETECTION === 'true',
                anomalyDetection: process.env.NETWORK_ANOMALY_DETECTION === 'true'
            }
        };
    }

    /**
     * Initialize security monitoring
     * @private
     */
    #initializeSecurityMonitor() {
        this.#securityMonitor = {
            enabled: true,
            threats: new Map(),
            vulnerabilities: new Map(),
            incidents: new Map(),
            compliance: new Map(),
            monitoring: {
                accessPatterns: true,
                failedLogins: true,
                privilegeEscalation: true,
                dataAccess: true,
                configChanges: true
            },
            detection: {
                realTime: true,
                behavioral: process.env.BEHAVIORAL_SECURITY_MONITORING === 'true',
                signature: true,
                anomaly: true
            },
            response: {
                automated: process.env.AUTOMATED_SECURITY_RESPONSE === 'true',
                isolation: process.env.SECURITY_ISOLATION === 'true',
                blocking: process.env.SECURITY_BLOCKING === 'true'
            }
        };
    }

    /**
     * Initialize capacity planning system
     * @private
     */
    #initializeCapacityPlanner() {
        this.#capacityPlanner = {
            enabled: this.#config.featureFlags.enableCapacityPlanning,
            resources: new Map(),
            utilization: new Map(),
            forecasts: new Map(),
            scenarios: new Map(),
            recommendations: new Map(),
            planning: {
                horizon: 2592000000, // 30 days
                confidence: 0.90,
                scenarios: ['optimistic', 'realistic', 'pessimistic']
            },
            optimization: {
                enabled: true,
                costOptimization: process.env.COST_OPTIMIZATION === 'true',
                performanceOptimization: true,
                rightSizing: process.env.RIGHT_SIZING === 'true'
            },
            automation: {
                enabled: process.env.AUTOMATED_CAPACITY_MANAGEMENT === 'true',
                scaling: process.env.AUTO_SCALING === 'true',
                provisioning: process.env.AUTO_PROVISIONING === 'true'
            }
        };
    }

    /**
     * Setup base middleware that applies to all routes.
     * @private
     */
    #setupBaseMiddleware() {
        // Enhanced request logging for monitoring operations
        this.#router.use(requestLogger({
            module: 'SystemMonitoringRoutes',
            logLevel: this.#config.monitoring.logLevel,
            includeHeaders: process.env.NODE_ENV === 'development',
            includeBody: false, // Monitoring data can be large
            sensitiveFields: this.#securityConfig.encryption.sensitiveFields,
            monitoringContext: true
        }));

        // Security headers
        this.#router.use(securityHeaders(this.#securityConfig.headers));

        // Monitoring context middleware
        this.#router.use((req, res, next) => {
            req.requestId = req.headers['x-request-id'] || this.#generateRequestId();
            req.correlationId = req.headers['x-correlation-id'] || this.#generateCorrelationId();
            
            req.monitoringContext = {
                module: 'system-monitoring',
                requestId: req.requestId,
                correlationId: req.correlationId,
                timestamp: new Date().toISOString(),
                realTime: req.query.realtime === 'true',
                detailed: req.query.detailed === 'true'
            };
            
            res.setHeader('X-Request-ID', req.requestId);
            res.setHeader('X-Correlation-ID', req.correlationId);
            res.setHeader('X-Monitoring-Module', 'system-monitoring');
            
            next();
        });

        // Real-time metrics collection
        this.#router.use((req, res, next) => {
            if (req.monitoringContext.realTime) {
                req.metricsSnapshot = this.#captureMetricsSnapshot();
            }
            next();
        });

        // Performance monitoring middleware
        if (this.#config.enableMetrics) {
            this.#router.use(this.#createMonitoringPerformanceMiddleware());
        }

        // Audit logging middleware
        if (this.#config.enableAuditLogging) {
            this.#router.use(this.#createMonitoringAuditMiddleware());
        }

        logger.debug('System monitoring base middleware configured');
    }

    /**
     * Register all route modules with their respective prefixes.
     * @private
     */
    #registerRouteModules() {
        const modules = [
            {
                name: 'health',
                routes: systemHealthRoutes,
                prefix: this.#config.routePrefixes.health,
                enabled: this.#config.featureFlags.enableSystemHealth,
                description: 'System health monitoring and diagnostics endpoints',
                capabilities: [
                    'health-checks',
                    'dependency-monitoring',
                    'service-discovery',
                    'diagnostic-tools'
                ]
            },
            {
                name: 'performance',
                routes: performanceMonitoringRoutes,
                prefix: this.#config.routePrefixes.performance,
                enabled: this.#config.featureFlags.enablePerformanceMonitoring,
                description: 'Performance monitoring and analysis endpoints',
                capabilities: [
                    'performance-analysis',
                    'bottleneck-detection',
                    'optimization-recommendations',
                    'benchmark-tracking'
                ]
            },
            {
                name: 'metrics',
                routes: metricsCollectionRoutes,
                prefix: this.#config.routePrefixes.metrics,
                enabled: this.#config.featureFlags.enableMetricsCollection,
                description: 'Metrics collection and aggregation endpoints',
                capabilities: [
                    'metrics-collection',
                    'data-aggregation',
                    'time-series-storage',
                    'custom-metrics'
                ]
            },
            {
                name: 'alerts',
                routes: alertingRoutes,
                prefix: this.#config.routePrefixes.alerts,
                enabled: this.#config.featureFlags.enableAlerting,
                description: 'Alert management and notification endpoints',
                capabilities: [
                    'alert-management',
                    'notification-routing',
                    'escalation-policies',
                    'auto-remediation'
                ]
            }
        ];

        modules.forEach(module => {
            if (module.enabled) {
                this.#registerMonitoringModule(module);
                logger.info(`Registered ${module.name} monitoring routes at prefix: ${module.prefix}`, {
                    capabilities: module.capabilities
                });
            } else {
                logger.warn(`${module.name} monitoring routes are disabled by feature flag`);
            }
        });
    }

    /**
     * Register a monitoring module
     * @private
     * @param {Object} module - Module configuration
     */
    #registerMonitoringModule(module) {
        const moduleRouter = express.Router();
        moduleRouter.use(this.#createMonitoringModuleMiddleware(module.name));
        moduleRouter.use(module.routes);
        this.#router.use(module.prefix, moduleRouter);

        this.#routeRegistry.set(module.name, {
            prefix: module.prefix,
            router: moduleRouter,
            description: module.description,
            capabilities: module.capabilities,
            registeredAt: new Date(),
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0,
            lastAccessed: null,
            monitoringOperations: 0,
            realTimeRequests: 0
        });
    }

    /**
     * Create monitoring module middleware
     * @private
     * @param {string} moduleName - Module name
     * @returns {Function} Express middleware
     */
    #createMonitoringModuleMiddleware(moduleName) {
        return (req, res, next) => {
            const startTime = Date.now();
            
            req.moduleContext = {
                module: moduleName,
                startTime,
                requestId: req.requestId
            };

            const moduleData = this.#routeRegistry.get(moduleName);
            if (moduleData) {
                moduleData.requestCount++;
                moduleData.lastAccessed = new Date();
                moduleData.monitoringOperations++;
                
                if (req.monitoringContext.realTime) {
                    moduleData.realTimeRequests++;
                }
            }

            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                if (moduleData) {
                    const currentAvg = moduleData.averageResponseTime;
                    const count = moduleData.requestCount;
                    moduleData.averageResponseTime = (currentAvg * (count - 1) + responseTime) / count;
                    
                    if (res.statusCode >= 400) {
                        moduleData.errorCount++;
                    }
                }
            });

            next();
        };
    }

    /**
     * Start background monitoring tasks
     * @private
     */
    #startBackgroundMonitoring() {
        // System metrics collection
        if (this.#config.collection.systemMetrics.enabled) {
            setInterval(() => {
                this.#collectSystemMetrics();
            }, this.#config.collection.systemMetrics.interval);
        }

        // Health checks
        if (this.#systemHealthMonitor.enabled) {
            setInterval(() => {
                this.#performSystemHealthCheck();
            }, this.#systemHealthMonitor.checkInterval);
        }

        // Performance analysis
        if (this.#performanceAnalyzer.enabled) {
            setInterval(() => {
                this.#analyzePerformance();
            }, 60000); // Every minute
        }

        // Anomaly detection
        if (this.#anomalyDetector.enabled) {
            setInterval(() => {
                this.#detectAnomalies();
            }, 300000); // Every 5 minutes
        }

        logger.info('Background monitoring tasks started');
    }

    /**
     * Setup health check endpoints
     * @private
     */
    #setupHealthChecks() {
        this.#router.get('/health', async (req, res) => {
            const health = await this.#performHealthCheck();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        });

        this.#router.get('/health/detailed', async (req, res) => {
            const detailedHealth = await this.#performDetailedHealthCheck();
            res.json(detailedHealth);
        });

        logger.debug('Health check endpoints configured');
    }

    /**
     * Setup metrics collection endpoints
     * @private
     */
    #setupMetricsCollection() {
        if (!this.#config.enableMetrics) return;

        this.#router.get('/metrics', (req, res) => {
            const metrics = this.#collectMetrics();
            res.json(metrics);
        });

        this.#router.get('/metrics/prometheus', (req, res) => {
            const prometheusMetrics = this.#formatMetricsForPrometheus();
            res.set('Content-Type', 'text/plain');
            res.send(prometheusMetrics);
        });

        logger.debug('Metrics collection endpoints configured');
    }

    /**
     * Generate route documentation
     * @private
     */
    #generateRouteDocumentation() {
        if (!this.#config.enableDocumentation) return;

        this.#router.get('/docs', (req, res) => {
            const docs = this.#buildDocumentation();
            res.json(docs);
        });

        logger.debug('Documentation endpoints configured');
    }

    // Helper methods and utilities

    #generateRequestId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substr(2, 9);
        return `mon-${timestamp}-${randomPart}`;
    }

    #generateCorrelationId() {
        return crypto.randomBytes(16).toString('hex');
    }

    #captureMetricsSnapshot() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            timestamp: Date.now(),
            memory: memUsage,
            cpu: cpuUsage,
            uptime: process.uptime(),
            load: os.loadavg()
        };
    }

    #createMonitoringPerformanceMiddleware() {
        return (req, res, next) => {
            const startTime = process.hrtime();
            
            res.on('finish', () => {
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const duration = seconds * 1000 + nanoseconds * 1e-6;
                
                this.#performanceMetrics.system.requestCount++;
                this.#performanceMetrics.system.totalResponseTime += duration;
                this.#performanceMetrics.system.averageResponseTime = 
                    this.#performanceMetrics.system.totalResponseTime / this.#performanceMetrics.system.requestCount;
            });
            
            next();
        };
    }

    #createMonitoringAuditMiddleware() {
        return (req, res, next) => {
            const auditEntry = {
                timestamp: new Date().toISOString(),
                requestId: req.requestId,
                method: req.method,
                path: req.path,
                user: req.user?.id || 'anonymous',
                module: req.moduleContext?.module || 'unknown'
            };

            res.on('finish', () => {
                auditEntry.statusCode = res.statusCode;
                this.#auditLog.entries.push(auditEntry);
            });

            next();
        };
    }

    #collectSystemMetrics() {
        const metrics = {
            timestamp: Date.now(),
            cpu: process.cpuUsage(),
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            load: os.loadavg(),
            platform: os.platform(),
            version: process.version
        };

        this.#performanceMetrics.realtime.cpu.current = metrics.cpu.user / 1000;
        this.#performanceMetrics.realtime.memory.current = metrics.memory.heapUsed;
        
        // Store in history
        this.#performanceMetrics.realtime.cpu.history.push(metrics.cpu.user / 1000);
        this.#performanceMetrics.realtime.memory.history.push(metrics.memory.heapUsed);
        
        // Keep history size manageable
        if (this.#performanceMetrics.realtime.cpu.history.length > 1000) {
            this.#performanceMetrics.realtime.cpu.history = 
                this.#performanceMetrics.realtime.cpu.history.slice(-500);
        }
    }

    #performSystemHealthCheck() {
        const cpuUsage = this.#performanceMetrics.realtime.cpu.current;
        const memoryUsage = (this.#performanceMetrics.realtime.memory.current / os.totalmem()) * 100;
        
        this.#systemHealthMonitor.status.set('cpu', {
            healthy: cpuUsage < this.#systemHealthMonitor.checks.get('cpu').threshold,
            value: cpuUsage,
            timestamp: new Date()
        });

        this.#systemHealthMonitor.status.set('memory', {
            healthy: memoryUsage < this.#systemHealthMonitor.checks.get('memory').threshold,
            value: memoryUsage,
            timestamp: new Date()
        });

        this.#systemHealthMonitor.lastCheck = new Date();
    }

    #analyzePerformance() {
        // Analyze recent performance data
        const recentCpu = this.#performanceMetrics.realtime.cpu.history.slice(-10);
        const recentMemory = this.#performanceMetrics.realtime.memory.history.slice(-10);
        
        if (recentCpu.length > 0) {
            const avgCpu = recentCpu.reduce((a, b) => a + b, 0) / recentCpu.length;
            if (avgCpu > this.#performanceMetrics.thresholds.slowRoute / 10) {
                logger.warn('High CPU usage detected', { average: avgCpu });
            }
        }
    }

    #detectAnomalies() {
        // Simple anomaly detection based on statistical thresholds
        const cpuHistory = this.#performanceMetrics.realtime.cpu.history;
        if (cpuHistory.length > 10) {
            const recent = cpuHistory.slice(-10);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const stdDev = Math.sqrt(recent.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / recent.length);
            
            if (stdDev > avg * 0.5) {
                this.#anomalyDetector.detections.set('cpu_variance', {
                    detected: true,
                    timestamp: new Date(),
                    severity: 'medium',
                    details: { average: avg, standardDeviation: stdDev }
                });
            }
        }
    }

    #performHealthCheck() {
        const healthStatus = Array.from(this.#systemHealthMonitor.status.values());
        const allHealthy = healthStatus.every(check => check.healthy);
        
        return Promise.resolve({
            status: allHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            checks: Object.fromEntries(this.#systemHealthMonitor.status),
            uptime: process.uptime()
        });
    }

    #performDetailedHealthCheck() {
        return Promise.resolve({
            overallStatus: 'healthy',
            modules: Array.from(this.#routeRegistry.keys()),
            system: Object.fromEntries(this.#systemHealthMonitor.status),
            performance: this.#performanceMetrics.realtime,
            anomalies: Array.from(this.#anomalyDetector.detections.keys())
        });
    }

    #collectMetrics() {
        return {
            timestamp: new Date().toISOString(),
            system: this.#performanceMetrics.system,
            realtime: this.#performanceMetrics.realtime,
            routes: Array.from(this.#routeRegistry.values())
        };
    }

    #formatMetricsForPrometheus() {
        const lines = [];
        
        // System metrics
        lines.push('# HELP system_cpu_usage CPU usage percentage');
        lines.push('# TYPE system_cpu_usage gauge');
        lines.push(`system_cpu_usage ${this.#performanceMetrics.realtime.cpu.current}`);
        
        lines.push('# HELP system_memory_usage Memory usage in bytes');
        lines.push('# TYPE system_memory_usage gauge');
        lines.push(`system_memory_usage ${this.#performanceMetrics.realtime.memory.current}`);
        
        return lines.join('\n');
    }

    #buildDocumentation() {
        return {
            service: 'System Monitoring Service',
            modules: Array.from(this.#routeRegistry.keys()),
            capabilities: this.#config.featureFlags,
            endpoints: Array.from(this.#routeRegistry.values()).map(route => ({
                name: route.prefix,
                description: route.description,
                capabilities: route.capabilities
            }))
        };
    }

    /**
     * Get configured router
     * @returns {express.Router} Configured router
     */
    getRouter() {
        if (!this.#initialized) {
            this.#finalize();
        }
        return this.#router;
    }

    #finalize() {
        this.#router.use((req, res) => {
            res.status(404).json({
                error: 'System monitoring endpoint not found',
                path: req.path,
                availableRoutes: Array.from(this.#routeRegistry.keys())
            });
        });

        this.#router.use(errorHandler());
        this.#initialized = true;
        logger.info('System monitoring routes finalized');
    }

    // Public interface methods
    getStatistics() {
        return {
            routes: Array.from(this.#routeRegistry.keys()),
            system: this.#performanceMetrics.system,
            health: Object.fromEntries(this.#systemHealthMonitor.status)
        };
    }

    resetMetrics() {
        this.#performanceMetrics.system = {
            startTime: Date.now(),
            requestCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            averageResponseTime: 0,
            monitoringOperations: 0,
            healthChecks: 0,
            metricsCollections: 0,
            alertsTriggered: 0
        };
        logger.info('System monitoring metrics reset');
    }

    getConfiguration() {
        return {
            monitoring: true,
            systemHealth: this.#systemHealthMonitor.enabled,
            performanceAnalysis: this.#performanceAnalyzer.enabled,
            anomalyDetection: this.#anomalyDetector.enabled
        };
    }
}

/**
 * Create and export singleton instance
 */
const routesManager = new SystemMonitoringRoutesManager();

/**
 * Main export - configured router
 */
module.exports = routesManager.getRouter();

/**
 * Export manager class and instance
 */
module.exports.SystemMonitoringRoutesManager = SystemMonitoringRoutesManager;
module.exports.routesManager = routesManager;

/**
 * Utility exports
 */
module.exports.getStatistics = () => routesManager.getStatistics();
module.exports.resetMetrics = () => routesManager.resetMetrics();
module.exports.getConfiguration = () => routesManager.getConfiguration();

/**
 * Route modules export
 */
module.exports.routes = {
    health: systemHealthRoutes,
    performance: performanceMonitoringRoutes,
    metrics: metricsCollectionRoutes,
    alerts: alertingRoutes
};

/**
 * Module initialization logging
 */
logger.info('System Monitoring Routes module initialized', {
    modules: Object.keys(module.exports.routes),
    systemHealth: routesManager.getConfiguration().systemHealth,
    performanceAnalysis: routesManager.getConfiguration().performanceAnalysis,
    anomalyDetection: routesManager.getConfiguration().anomalyDetection,
    realTimeMonitoring: true
});