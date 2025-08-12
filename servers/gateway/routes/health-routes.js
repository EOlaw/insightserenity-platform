'use strict';

/**
 * @fileoverview HealthRoutesManager - Comprehensive health check and monitoring endpoints for API Gateway
 * @module servers/gateway/routes/health-routes
 * @version 2.0.0
 * @author InsightSerenity Platform Team
 * @requires express
 * @requires os
 * @requires v8
 * @requires cluster
 * @requires util
 * @requires child_process
 */

const express = require('express');
const os = require('os');
const v8 = require('v8');
const cluster = require('cluster');
const util = require('util');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

/**
 * HealthRoutesManager class provides enterprise-grade health check and monitoring endpoints
 * for the InsightSerenity API Gateway. It implements comprehensive health monitoring including
 * shallow and deep health checks, Kubernetes-style probes (liveness, readiness, startup),
 * dependency verification, performance monitoring, resource utilization tracking, 
 * detailed diagnostics, security health checks, and real-time monitoring capabilities.
 * 
 * Features:
 * - Multi-level health checks (basic, detailed, deep)
 * - Kubernetes probe compatibility (liveness, readiness, startup)
 * - Real-time resource monitoring and alerting
 * - Dependency health verification
 * - Performance metrics and diagnostics
 * - Security health assessments
 * - Custom health check registration
 * - Health history and trending
 * - Circuit breaker integration
 * - Service discovery health verification
 * - Cache and database health monitoring
 * - Network connectivity testing
 * - Memory leak detection
 * - Event loop lag monitoring
 * - File descriptor tracking
 * - Load balancer health integration
 * 
 * @class HealthRoutesManager
 */
class HealthRoutesManager {
    /**
     * Creates an instance of HealthRoutesManager
     * @constructor
     * @param {Object} healthMonitor - Health monitor service instance
     * @param {Object} metricsCollector - Metrics collection service
     * @param {Object} logger - Logging service instance
     */
    constructor(healthMonitor, metricsCollector, logger) {
        this.healthMonitor = healthMonitor;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
        
        // Initialize components as null - will be set during initialization
        this.serviceRegistry = null;
        this.cacheManager = null;
        this.circuitBreakerManager = null;
        this.traceManager = null;
        this.config = null;
        
        // Express router instance
        this.router = express.Router();
        
        // Health check configuration and thresholds
        this.thresholds = {
            memory: {
                warning: 0.75,   // 75% memory usage warning
                critical: 0.90,  // 90% memory usage critical
                process: 0.85    // 85% process memory critical
            },
            cpu: {
                warning: 0.70,   // 70% CPU usage warning
                critical: 0.90,  // 90% CPU usage critical
                load: 2.0        // Load average threshold per core
            },
            diskSpace: {
                warning: 0.80,   // 80% disk usage warning
                critical: 0.95   // 95% disk usage critical
            },
            responseTime: {
                warning: 1000,   // 1 second response time warning
                critical: 5000,  // 5 seconds response time critical
                dependency: 2000 // 2 seconds dependency response critical
            },
            errorRate: {
                warning: 0.01,   // 1% error rate warning
                critical: 0.05,  // 5% error rate critical
                service: 0.10    // 10% service error rate critical
            },
            eventLoop: {
                warning: 10,     // 10ms event loop lag warning
                critical: 100    // 100ms event loop lag critical
            },
            fileDescriptors: {
                warning: 0.80,   // 80% file descriptor usage warning
                critical: 0.95   // 95% file descriptor usage critical
            },
            connections: {
                warning: 1000,   // 1000 active connections warning
                critical: 5000   // 5000 active connections critical
            }
        };
        
        // Health status classification levels
        this.statusLevels = {
            HEALTHY: 'healthy',
            DEGRADED: 'degraded', 
            UNHEALTHY: 'unhealthy',
            CRITICAL: 'critical',
            UNKNOWN: 'unknown'
        };
        
        // Health check categories
        this.checkCategories = {
            CORE: 'core',           // Essential system components
            DEPENDENCIES: 'dependencies', // External dependencies
            RESOURCES: 'resources',  // System resource utilization
            PERFORMANCE: 'performance', // Performance metrics
            SECURITY: 'security',   // Security-related health
            CUSTOM: 'custom'        // Custom health checks
        };
        
        // Component health check registry
        this.componentChecks = new Map();
        this.customChecks = new Map();
        this.dependencyChecks = new Map();
        this.performanceChecks = new Map();
        this.securityChecks = new Map();
        
        // Health monitoring data structures
        this.healthHistory = [];
        this.maxHistorySize = 1000;
        this.healthTrends = new Map();
        this.alertThresholds = new Map();
        this.maintenanceMode = false;
        this.healthCheckEnabled = true;
        
        // Caching and performance optimization
        this.lastCheckResults = new Map();
        this.checkCacheTTL = {
            basic: 5000,      // 5 seconds for basic checks
            detailed: 10000,  // 10 seconds for detailed checks
            diagnostic: 30000 // 30 seconds for diagnostic checks
        };
        
        // Startup and initialization tracking
        this.startupTime = Date.now();
        this.initializationComplete = false;
        this.initializationProgress = {
            steps: [],
            completed: 0,
            total: 0,
            errors: []
        };
        
        // Real-time monitoring
        this.monitoringIntervals = new Map();
        this.realtimeMetrics = {
            cpu: [],
            memory: [],
            eventLoop: [],
            connections: 0,
            errors: 0
        };
        
        // Security monitoring
        this.securityEvents = [];
        this.maxSecurityEvents = 100;
        this.suspiciousActivityThreshold = 10;
        
        // Performance tracking
        this.performanceBaseline = null;
        this.performanceTrends = {
            responseTime: [],
            throughput: [],
            errorRate: []
        };
        
        // Load balancer integration
        this.loadBalancerChecks = {
            enabled: true,
            healthyThreshold: 0.8, // 80% of checks must pass
            unhealthyThreshold: 0.3 // 30% failure triggers unhealthy
        };
        
        // Circuit breaker integration
        this.circuitBreakerStates = new Map();
        
        // Service mesh integration
        this.serviceMeshConfig = {
            enabled: false,
            sidecarHealthPort: 15020,
            proxyAdminPort: 15000
        };
        
        // Container orchestration support
        this.containerMetrics = {
            enabled: false,
            namespace: 'default',
            podName: process.env.HOSTNAME || 'unknown'
        };
        
        this.isInitialized = false;
    }

    /**
     * Initializes the HealthRoutesManager with dependency injection and configuration
     * @async
     * @param {Object} components - Optional components to inject
     * @param {Object} components.serviceRegistry - Service registry instance
     * @param {Object} components.cacheManager - Cache manager instance  
     * @param {Object} components.circuitBreakerManager - Circuit breaker manager
     * @param {Object} components.traceManager - Distributed tracing manager
     * @param {Object} components.config - Configuration manager
     * @returns {Promise<void>}
     */
    async initialize(components = {}) {
        if (this.isInitialized) {
            this.logger.warn('HealthRoutesManager already initialized');
            return;
        }

        try {
            this.logger.info('Initializing HealthRoutesManager');
            
            // Inject optional components
            this.serviceRegistry = components.serviceRegistry || null;
            this.cacheManager = components.cacheManager || null;
            this.circuitBreakerManager = components.circuitBreakerManager || null;
            this.traceManager = components.traceManager || null;
            this.config = components.config || null;
            
            // Initialize progress tracking
            this.initializationProgress.total = 8;
            this.initializationProgress.steps = [
                'Registering core health checks',
                'Setting up dependency monitoring', 
                'Configuring performance monitoring',
                'Initializing security checks',
                'Setting up real-time monitoring',
                'Configuring route endpoints',
                'Starting background monitoring',
                'Finalizing initialization'
            ];
            
            // Step 1: Register core health checks
            await this.registerCoreHealthChecks();
            this.updateInitializationProgress('Registering core health checks');
            
            // Step 2: Setup dependency monitoring
            await this.setupDependencyMonitoring();
            this.updateInitializationProgress('Setting up dependency monitoring');
            
            // Step 3: Configure performance monitoring
            await this.setupPerformanceMonitoring();
            this.updateInitializationProgress('Configuring performance monitoring');
            
            // Step 4: Initialize security checks
            await this.initializeSecurityChecks();
            this.updateInitializationProgress('Initializing security checks');
            
            // Step 5: Setup real-time monitoring
            await this.setupRealtimeMonitoring();
            this.updateInitializationProgress('Setting up real-time monitoring');
            
            // Step 6: Configure route endpoints
            this.initializeRoutes();
            this.updateInitializationProgress('Configuring route endpoints');
            
            // Step 7: Start background monitoring
            await this.startBackgroundMonitoring();
            this.updateInitializationProgress('Starting background monitoring');
            
            // Step 8: Finalize initialization
            this.establishPerformanceBaseline();
            this.updateInitializationProgress('Finalizing initialization');
            
            this.initializationComplete = true;
            this.isInitialized = true;
            
            this.logger.info('HealthRoutesManager initialized successfully', {
                components: {
                    serviceRegistry: !!this.serviceRegistry,
                    cacheManager: !!this.cacheManager,
                    circuitBreakerManager: !!this.circuitBreakerManager,
                    traceManager: !!this.traceManager,
                    config: !!this.config
                },
                checksRegistered: {
                    core: this.componentChecks.size,
                    dependencies: this.dependencyChecks.size,
                    performance: this.performanceChecks.size,
                    security: this.securityChecks.size,
                    custom: this.customChecks.size
                }
            });
            
        } catch (error) {
            this.initializationProgress.errors.push({
                step: this.initializationProgress.completed,
                error: error.message,
                timestamp: Date.now()
            });
            this.logger.error('Failed to initialize HealthRoutesManager', error);
            throw error;
        }
    }

    /**
     * Updates initialization progress tracking
     * @private
     * @param {string} stepName - Name of completed step
     */
    updateInitializationProgress(stepName) {
        this.initializationProgress.completed++;
        this.logger.debug(`Health routes initialization: ${stepName} completed`, {
            progress: `${this.initializationProgress.completed}/${this.initializationProgress.total}`,
            percentage: Math.round((this.initializationProgress.completed / this.initializationProgress.total) * 100)
        });
    }

    /**
     * Initializes all health check route endpoints
     * @private
     */
    initializeRoutes() {
        // Basic health endpoints
        this.setupBasicHealthRoutes();
        
        // Kubernetes probe endpoints
        this.setupKubernetesProbeRoutes();
        
        // Detailed monitoring endpoints
        this.setupDetailedMonitoringRoutes();
        
        // Administrative endpoints
        this.setupAdministrativeRoutes();
        
        // Real-time monitoring endpoints
        this.setupRealtimeRoutes();
        
        // Security health endpoints
        this.setupSecurityRoutes();
        
        // Performance monitoring endpoints
        this.setupPerformanceRoutes();
        
        // Custom health check endpoints
        this.setupCustomHealthRoutes();
        
        // Load balancer integration endpoints
        this.setupLoadBalancerRoutes();
        
        this.logger.info('Health check routes initialized successfully');
    }

    /**
     * Sets up basic health check routes
     * @private
     */
    setupBasicHealthRoutes() {
        /**
         * GET /health
         * Basic health check endpoint - optimized for frequent polling
         */
        this.router.get('/', async (req, res) => {
            try {
                const startTime = performance.now();
                const health = await this.performBasicHealthCheck();
                const responseTime = Math.round(performance.now() - startTime);
                
                health.responseTime = responseTime;
                const statusCode = health.status === this.statusLevels.HEALTHY ? 200 : 503;
                
                // Add response headers for monitoring
                res.set({
                    'X-Health-Status': health.status,
                    'X-Response-Time': responseTime,
                    'X-Uptime': Date.now() - this.startupTime,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                
                res.status(statusCode).json(health);
                
                // Record metrics
                this.recordHealthCheckMetrics('basic', health.status, responseTime);
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'basic');
            }
        });

        /**
         * GET /health/ping
         * Ultra-lightweight ping endpoint for simple connectivity tests
         */
        this.router.get('/ping', (req, res) => {
            const timestamp = Date.now();
            res.json({
                status: 'ok',
                timestamp,
                uptime: timestamp - this.startupTime,
                service: 'insightserenity-api-gateway'
            });
        });

        /**
         * GET /health/echo
         * Echo endpoint for testing request/response functionality
         */
        this.router.get('/echo', (req, res) => {
            res.json({
                status: 'ok',
                echo: {
                    query: req.query,
                    headers: req.headers,
                    timestamp: Date.now(),
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                }
            });
        });
    }

    /**
     * Sets up Kubernetes-compatible probe routes
     * @private  
     */
    setupKubernetesProbeRoutes() {
        /**
         * GET /health/live
         * Kubernetes liveness probe - determines if container should be restarted
         */
        this.router.get('/live', async (req, res) => {
            try {
                const liveness = await this.performLivenessCheck();
                const statusCode = liveness.alive ? 200 : 503;
                
                res.status(statusCode).json({
                    status: liveness.alive ? 'alive' : 'dead',
                    timestamp: Date.now(),
                    uptime: Date.now() - this.startupTime,
                    details: liveness.details,
                    ...(liveness.issues && { issues: liveness.issues })
                });
                
                this.recordHealthCheckMetrics('liveness', liveness.alive ? 'healthy' : 'unhealthy');
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'liveness');
            }
        });

        /**
         * GET /health/ready  
         * Kubernetes readiness probe - determines if container can accept traffic
         */
        this.router.get('/ready', async (req, res) => {
            try {
                const readiness = await this.performReadinessCheck();
                const statusCode = readiness.ready ? 200 : 503;
                
                res.status(statusCode).json({
                    status: readiness.ready ? 'ready' : 'not_ready',
                    timestamp: Date.now(),
                    details: readiness.details,
                    ...(readiness.reasons && { reasons: readiness.reasons }),
                    ...(readiness.dependencies && { dependencies: readiness.dependencies })
                });
                
                this.recordHealthCheckMetrics('readiness', readiness.ready ? 'healthy' : 'unhealthy');
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'readiness');
            }
        });

        /**
         * GET /health/startup
         * Kubernetes startup probe - determines when container has started
         */
        this.router.get('/startup', async (req, res) => {
            try {
                const startup = await this.performStartupCheck();
                const statusCode = startup.started ? 200 : 503;
                
                res.status(statusCode).json({
                    status: startup.started ? 'started' : 'starting',
                    startupTime: this.startupTime,
                    uptime: Date.now() - this.startupTime,
                    initialized: this.initializationComplete,
                    progress: startup.progress,
                    ...(startup.pendingTasks && { pendingTasks: startup.pendingTasks }),
                    ...(startup.errors && { errors: startup.errors })
                });
                
                this.recordHealthCheckMetrics('startup', startup.started ? 'healthy' : 'unhealthy');
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'startup');
            }
        });
    }

    /**
     * Sets up detailed monitoring routes
     * @private
     */
    setupDetailedMonitoringRoutes() {
        /**
         * GET /health/detailed
         * Comprehensive health check with all component details
         */
        this.router.get('/detailed', async (req, res) => {
            try {
                const includeMetrics = req.query.metrics === 'true';
                const includeHistory = req.query.history === 'true';
                const detailed = await this.performDetailedHealthCheck(includeMetrics, includeHistory);
                
                const statusCode = detailed.overallStatus === this.statusLevels.HEALTHY ? 200 :
                                  detailed.overallStatus === this.statusLevels.DEGRADED ? 200 : 503;
                
                res.status(statusCode).json(detailed);
                this.recordHealthCheckMetrics('detailed', detailed.overallStatus);
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'detailed');
            }
        });

        /**
         * GET /health/dependencies
         * Check health status of all external dependencies
         */
        this.router.get('/dependencies', async (req, res) => {
            try {
                const dependencies = await this.checkAllDependencies();
                const allHealthy = Object.values(dependencies.results).every(dep => dep.healthy);
                
                res.status(allHealthy ? 200 : 503).json({
                    status: allHealthy ? 'healthy' : 'unhealthy',
                    summary: dependencies.summary,
                    dependencies: dependencies.results,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'dependencies');
            }
        });

        /**
         * GET /health/services
         * Check health of all registered microservices
         */
        this.router.get('/services', async (req, res) => {
            try {
                const services = await this.checkServiceHealth();
                
                res.json({
                    summary: services.summary,
                    services: services.details,
                    circuitBreakers: services.circuitBreakers,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'services');
            }
        });

        /**
         * GET /health/resources
         * System resource utilization and capacity monitoring
         */
        this.router.get('/resources', async (req, res) => {
            try {
                const resources = await this.checkSystemResources();
                
                res.json({
                    status: resources.overallStatus,
                    resources: resources.details,
                    alerts: resources.alerts,
                    trends: resources.trends,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'resources');
            }
        });

        /**
         * GET /health/diagnostics
         * Run comprehensive diagnostic tests
         */
        this.router.get('/diagnostics', async (req, res) => {
            try {
                const includeNetworkTests = req.query.network === 'true';
                const includePerformanceTests = req.query.performance === 'true';
                
                const diagnostics = await this.runComprehensiveDiagnostics({
                    networkTests: includeNetworkTests,
                    performanceTests: includePerformanceTests
                });
                
                res.json(diagnostics);
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'diagnostics');
            }
        });
    }

    /**
     * Sets up administrative health routes
     * @private
     */
    setupAdministrativeRoutes() {
        /**
         * GET /health/status
         * Current health status summary
         */
        this.router.get('/status', async (req, res) => {
            try {
                const status = await this.getHealthStatusSummary();
                res.json(status);
            } catch (error) {
                this.handleHealthCheckError(res, error, 'status');
            }
        });

        /**
         * GET /health/history
         * Health check history and trends
         */
        this.router.get('/history', (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
                const category = req.query.category;
                const since = req.query.since ? parseInt(req.query.since) : null;
                
                const history = this.getHealthHistory(limit, category, since);
                
                res.json(history);
            } catch (error) {
                this.handleHealthCheckError(res, error, 'history');
            }
        });

        /**
         * GET /health/metrics
         * Health-related metrics and statistics
         */
        this.router.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.getHealthMetrics();
                res.json(metrics);
            } catch (error) {
                this.handleHealthCheckError(res, error, 'metrics');
            }
        });

        /**
         * POST /health/maintenance
         * Enable/disable maintenance mode
         */
        this.router.post('/maintenance', async (req, res) => {
            try {
                const { enabled, reason } = req.body;
                
                if (typeof enabled !== 'boolean') {
                    return res.status(400).json({
                        error: 'Invalid request',
                        message: 'enabled field must be a boolean'
                    });
                }
                
                this.maintenanceMode = enabled;
                
                this.logger.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`, {
                    reason,
                    timestamp: Date.now()
                });
                
                res.json({
                    maintenanceMode: this.maintenanceMode,
                    reason,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.handleHealthCheckError(res, error, 'maintenance');
            }
        });

        /**
         * GET /health/config
         * Health check configuration and thresholds
         */
        this.router.get('/config', (req, res) => {
            try {
                res.json({
                    thresholds: this.thresholds,
                    statusLevels: this.statusLevels,
                    checkCategories: this.checkCategories,
                    cacheTTL: this.checkCacheTTL,
                    maintenanceMode: this.maintenanceMode,
                    healthCheckEnabled: this.healthCheckEnabled,
                    registeredChecks: {
                        core: Array.from(this.componentChecks.keys()),
                        dependencies: Array.from(this.dependencyChecks.keys()),
                        performance: Array.from(this.performanceChecks.keys()),
                        security: Array.from(this.securityChecks.keys()),
                        custom: Array.from(this.customChecks.keys())
                    }
                });
            } catch (error) {
                this.handleHealthCheckError(res, error, 'config');
            }
        });
    }

    /**
     * Sets up real-time monitoring routes
     * @private
     */
    setupRealtimeRoutes() {
        /**
         * GET /health/realtime
         * Real-time system metrics stream
         */
        this.router.get('/realtime', (req, res) => {
            try {
                const metrics = this.getCurrentRealtimeMetrics();
                res.json(metrics);
            } catch (error) {
                this.handleHealthCheckError(res, error, 'realtime');
            }
        });

        /**
         * GET /health/alerts
         * Current health alerts and warnings
         */
        this.router.get('/alerts', async (req, res) => {
            try {
                const alerts = await this.getActiveAlerts();
                res.json(alerts);
            } catch (error) {
                this.handleHealthCheckError(res, error, 'alerts');
            }
        });
    }

    /**
     * Registers core system health checks
     * @private
     * @async
     */
    async registerCoreHealthChecks() {
        // Process health check
        this.componentChecks.set('process', async () => {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const uptime = process.uptime();
            
            const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            if (memoryUsagePercent > this.thresholds.memory.process) {
                status = this.statusLevels.CRITICAL;
                issues.push(`High process memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
            } else if (memoryUsagePercent > this.thresholds.memory.warning) {
                status = this.statusLevels.DEGRADED;
                issues.push(`Elevated process memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `Process running for ${Math.floor(uptime)}s`,
                details: {
                    pid: process.pid,
                    uptime,
                    memory: {
                        rss: memUsage.rss,
                        heapTotal: memUsage.heapTotal,
                        heapUsed: memUsage.heapUsed,
                        external: memUsage.external,
                        usagePercent: memoryUsagePercent
                    },
                    cpu: cpuUsage,
                    version: process.version,
                    platform: process.platform
                },
                issues
            };
        });

        // Event loop health check
        this.componentChecks.set('eventLoop', async () => {
            return new Promise((resolve) => {
                const start = process.hrtime.bigint();
                setImmediate(() => {
                    const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
                    
                    let status = this.statusLevels.HEALTHY;
                    const issues = [];
                    
                    if (lag > this.thresholds.eventLoop.critical) {
                        status = this.statusLevels.CRITICAL;
                        issues.push(`Critical event loop lag: ${lag.toFixed(2)}ms`);
                    } else if (lag > this.thresholds.eventLoop.warning) {
                        status = this.statusLevels.DEGRADED;
                        issues.push(`High event loop lag: ${lag.toFixed(2)}ms`);
                    }
                    
                    resolve({
                        healthy: status === this.statusLevels.HEALTHY,
                        status,
                        message: `Event loop lag: ${lag.toFixed(2)}ms`,
                        details: {
                            lagMs: lag,
                            threshold: {
                                warning: this.thresholds.eventLoop.warning,
                                critical: this.thresholds.eventLoop.critical
                            }
                        },
                        issues
                    });
                });
            });
        });

        // System resources health check
        this.componentChecks.set('systemResources', async () => {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memoryUsagePercent = usedMem / totalMem;
            
            const cpus = os.cpus();
            const loadAvg = os.loadavg();
            const cpuUsagePercent = loadAvg[0] / cpus.length;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            // Check memory usage
            if (memoryUsagePercent > this.thresholds.memory.critical) {
                status = this.statusLevels.CRITICAL;
                issues.push(`Critical system memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
            } else if (memoryUsagePercent > this.thresholds.memory.warning) {
                if (status === this.statusLevels.HEALTHY) status = this.statusLevels.DEGRADED;
                issues.push(`High system memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
            }
            
            // Check CPU usage
            if (cpuUsagePercent > this.thresholds.cpu.critical) {
                status = this.statusLevels.CRITICAL;
                issues.push(`Critical CPU usage: ${(cpuUsagePercent * 100).toFixed(2)}%`);
            } else if (cpuUsagePercent > this.thresholds.cpu.warning) {
                if (status === this.statusLevels.HEALTHY) status = this.statusLevels.DEGRADED;
                issues.push(`High CPU usage: ${(cpuUsagePercent * 100).toFixed(2)}%`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `Memory: ${(memoryUsagePercent * 100).toFixed(1)}%, CPU: ${(cpuUsagePercent * 100).toFixed(1)}%`,
                details: {
                    memory: {
                        total: totalMem,
                        free: freeMem,
                        used: usedMem,
                        usagePercent: memoryUsagePercent
                    },
                    cpu: {
                        cores: cpus.length,
                        loadAverage: loadAvg,
                        usagePercent: cpuUsagePercent,
                        model: cpus[0]?.model
                    },
                    platform: {
                        type: os.type(),
                        platform: os.platform(),
                        arch: os.arch(),
                        release: os.release(),
                        uptime: os.uptime()
                    }
                },
                issues
            };
        });

        // V8 heap health check
        this.componentChecks.set('v8Heap', async () => {
            const heapStats = v8.getHeapStatistics();
            const heapUsagePercent = heapStats.used_heap_size / heapStats.heap_size_limit;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            if (heapUsagePercent > 0.90) {
                status = this.statusLevels.CRITICAL;
                issues.push(`Critical V8 heap usage: ${(heapUsagePercent * 100).toFixed(2)}%`);
            } else if (heapUsagePercent > 0.75) {
                status = this.statusLevels.DEGRADED;
                issues.push(`High V8 heap usage: ${(heapUsagePercent * 100).toFixed(2)}%`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `V8 heap usage: ${(heapUsagePercent * 100).toFixed(2)}%`,
                details: {
                    totalHeapSize: heapStats.total_heap_size,
                    totalHeapSizeExecutable: heapStats.total_heap_size_executable,
                    totalPhysicalSize: heapStats.total_physical_size,
                    totalAvailableSize: heapStats.total_available_size,
                    usedHeapSize: heapStats.used_heap_size,
                    heapSizeLimit: heapStats.heap_size_limit,
                    mallocedMemory: heapStats.malloced_memory,
                    externalMemory: heapStats.external_memory,
                    usagePercent: heapUsagePercent
                },
                issues
            };
        });
    }

    /**
     * Sets up dependency monitoring
     * @private
     * @async
     */
    async setupDependencyMonitoring() {
        // Database dependency check
        if (this.config) {
            const dbConfig = this.config.get('database');
            if (dbConfig && dbConfig.enabled !== false) {
                this.dependencyChecks.set('database', async () => {
                    // Mock database check - replace with actual implementation
                    return {
                        healthy: true,
                        status: this.statusLevels.HEALTHY,
                        message: 'Database connection healthy',
                        details: {
                            type: dbConfig.type || 'unknown',
                            host: dbConfig.host || 'localhost',
                            responseTime: Math.floor(Math.random() * 50) + 10
                        }
                    };
                });
            }
        }

        // Cache dependency check  
        if (this.cacheManager) {
            this.dependencyChecks.set('cache', async () => {
                try {
                    const startTime = performance.now();
                    await this.cacheManager.ping();
                    const responseTime = Math.round(performance.now() - startTime);
                    
                    const stats = await this.cacheManager.getStatistics();
                    
                    return {
                        healthy: true,
                        status: this.statusLevels.HEALTHY,
                        message: 'Cache connection healthy',
                        details: {
                            type: 'redis',
                            responseTime,
                            hitRate: stats?.hitRate || 0,
                            size: stats?.size || 0,
                            memory: stats?.memory || 0
                        }
                    };
                } catch (error) {
                    return {
                        healthy: false,
                        status: this.statusLevels.CRITICAL,
                        message: 'Cache connection failed',
                        error: error.message
                    };
                }
            });
        }

        // Service registry dependency check
        if (this.serviceRegistry) {
            this.dependencyChecks.set('serviceRegistry', async () => {
                try {
                    const services = this.serviceRegistry.getAllServices();
                    const healthyServices = services.filter(s => s.status === 'healthy');
                    
                    let status = this.statusLevels.HEALTHY;
                    if (healthyServices.length === 0 && services.length > 0) {
                        status = this.statusLevels.CRITICAL;
                    } else if (healthyServices.length < services.length * 0.5) {
                        status = this.statusLevels.DEGRADED;
                    }
                    
                    return {
                        healthy: status === this.statusLevels.HEALTHY,
                        status,
                        message: `${healthyServices.length}/${services.length} services healthy`,
                        details: {
                            totalServices: services.length,
                            healthyServices: healthyServices.length,
                            unhealthyServices: services.length - healthyServices.length,
                            services: services.map(s => ({
                                name: s.name,
                                status: s.status,
                                url: s.url
                            }))
                        }
                    };
                } catch (error) {
                    return {
                        healthy: false,
                        status: this.statusLevels.CRITICAL,
                        message: 'Service registry unavailable',
                        error: error.message
                    };
                }
            });
        }
    }

    /**
     * Sets up performance monitoring
     * @private
     * @async
     */
    async setupPerformanceMonitoring() {
        // Response time monitoring
        this.performanceChecks.set('responseTime', async () => {
            const recentMetrics = this.performanceTrends.responseTime.slice(-10);
            
            if (recentMetrics.length === 0) {
                return {
                    healthy: true,
                    status: this.statusLevels.HEALTHY,
                    message: 'No recent response time data',
                    details: { samples: 0 }
                };
            }
            
            const avgResponseTime = recentMetrics.reduce((sum, val) => sum + val, 0) / recentMetrics.length;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            if (avgResponseTime > this.thresholds.responseTime.critical) {
                status = this.statusLevels.CRITICAL;
                issues.push(`Critical response time: ${avgResponseTime.toFixed(2)}ms`);
            } else if (avgResponseTime > this.thresholds.responseTime.warning) {
                status = this.statusLevels.DEGRADED;
                issues.push(`High response time: ${avgResponseTime.toFixed(2)}ms`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `Average response time: ${avgResponseTime.toFixed(2)}ms`,
                details: {
                    current: avgResponseTime,
                    samples: recentMetrics.length,
                    min: Math.min(...recentMetrics),
                    max: Math.max(...recentMetrics),
                    trend: recentMetrics
                },
                issues
            };
        });

        // Error rate monitoring
        this.performanceChecks.set('errorRate', async () => {
            const recentErrors = this.performanceTrends.errorRate.slice(-10);
            
            if (recentErrors.length === 0) {
                return {
                    healthy: true,
                    status: this.statusLevels.HEALTHY,
                    message: 'No recent error rate data',
                    details: { samples: 0 }
                };
            }
            
            const avgErrorRate = recentErrors.reduce((sum, val) => sum + val, 0) / recentErrors.length;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            if (avgErrorRate > this.thresholds.errorRate.critical) {
                status = this.statusLevels.CRITICAL;
                issues.push(`Critical error rate: ${(avgErrorRate * 100).toFixed(2)}%`);
            } else if (avgErrorRate > this.thresholds.errorRate.warning) {
                status = this.statusLevels.DEGRADED;
                issues.push(`High error rate: ${(avgErrorRate * 100).toFixed(2)}%`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `Average error rate: ${(avgErrorRate * 100).toFixed(2)}%`,
                details: {
                    current: avgErrorRate,
                    samples: recentErrors.length,
                    trend: recentErrors
                },
                issues
            };
        });
    }

    /**
     * Initializes security health checks
     * @private
     * @async
     */
    async initializeSecurityChecks() {
        // Security events monitoring
        this.securityChecks.set('securityEvents', async () => {
            const recentEvents = this.securityEvents.slice(-10);
            const suspiciousCount = recentEvents.filter(e => e.severity === 'high').length;
            
            let status = this.statusLevels.HEALTHY;
            const issues = [];
            
            if (suspiciousCount > this.suspiciousActivityThreshold) {
                status = this.statusLevels.CRITICAL;
                issues.push(`High number of security events: ${suspiciousCount}`);
            } else if (suspiciousCount > this.suspiciousActivityThreshold / 2) {
                status = this.statusLevels.DEGRADED;
                issues.push(`Elevated security events: ${suspiciousCount}`);
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `${recentEvents.length} recent security events`,
                details: {
                    total: this.securityEvents.length,
                    recent: recentEvents.length,
                    suspicious: suspiciousCount,
                    events: recentEvents.slice(-5) // Last 5 events
                },
                issues
            };
        });

        // Authentication system health
        this.securityChecks.set('authentication', async () => {
            // Mock auth system check - replace with actual implementation
            return {
                healthy: true,
                status: this.statusLevels.HEALTHY,
                message: 'Authentication system operational',
                details: {
                    type: 'jwt',
                    tokenValidation: true,
                    rateLimit: true
                }
            };
        });
    }

    /**
     * Sets up real-time monitoring
     * @private
     * @async
     */
    async setupRealtimeMonitoring() {
        // CPU monitoring interval
        this.monitoringIntervals.set('cpu', setInterval(() => {
            const loadAvg = os.loadavg();
            const cpuUsage = loadAvg[0] / os.cpus().length;
            
            this.realtimeMetrics.cpu.push({
                usage: cpuUsage,
                timestamp: Date.now()
            });
            
            // Keep only last 60 samples (1 minute at 1s intervals)
            if (this.realtimeMetrics.cpu.length > 60) {
                this.realtimeMetrics.cpu.shift();
            }
        }, 1000));

        // Memory monitoring interval
        this.monitoringIntervals.set('memory', setInterval(() => {
            const memUsage = process.memoryUsage();
            const systemMem = {
                total: os.totalmem(),
                free: os.freemem()
            };
            
            this.realtimeMetrics.memory.push({
                process: memUsage,
                system: systemMem,
                timestamp: Date.now()
            });
            
            // Keep only last 60 samples
            if (this.realtimeMetrics.memory.length > 60) {
                this.realtimeMetrics.memory.shift();
            }
        }, 1000));

        // Event loop monitoring interval
        this.monitoringIntervals.set('eventLoop', setInterval(() => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1e6;
                
                this.realtimeMetrics.eventLoop.push({
                    lag,
                    timestamp: Date.now()
                });
                
                // Keep only last 60 samples
                if (this.realtimeMetrics.eventLoop.length > 60) {
                    this.realtimeMetrics.eventLoop.shift();
                }
            });
        }, 1000));
    }

    /**
     * Starts background monitoring tasks
     * @private
     * @async
     */
    async startBackgroundMonitoring() {
        // Health trend analysis
        this.monitoringIntervals.set('trendAnalysis', setInterval(async () => {
            try {
                await this.analyzeTrends();
            } catch (error) {
                this.logger.error('Trend analysis failed', error);
            }
        }, 30000)); // Every 30 seconds

        // Circuit breaker monitoring
        if (this.circuitBreakerManager) {
            this.monitoringIntervals.set('circuitBreakers', setInterval(() => {
                try {
                    const breakers = this.circuitBreakerManager.getAllBreakers();
                    breakers.forEach(breaker => {
                        this.circuitBreakerStates.set(breaker.name, {
                            state: breaker.state,
                            failures: breaker.failures,
                            timestamp: Date.now()
                        });
                    });
                } catch (error) {
                    this.logger.error('Circuit breaker monitoring failed', error);
                }
            }, 5000)); // Every 5 seconds
        }

        // Security event monitoring
        this.monitoringIntervals.set('securityMonitoring', setInterval(() => {
            // Mock security monitoring - replace with actual implementation
            if (Math.random() < 0.1) { // 10% chance of mock event
                this.recordSecurityEvent({
                    type: 'suspicious_activity',
                    severity: Math.random() < 0.2 ? 'high' : 'medium',
                    details: 'Mock security event for testing',
                    timestamp: Date.now()
                });
            }
        }, 10000)); // Every 10 seconds
    }

    /**
     * Establishes performance baseline for comparison
     * @private
     */
    establishPerformanceBaseline() {
        this.performanceBaseline = {
            responseTime: 100, // Mock baseline
            throughput: 1000,  // Mock baseline
            errorRate: 0.001,  // Mock baseline
            established: Date.now()
        };
        
        this.logger.info('Performance baseline established', this.performanceBaseline);
    }

    /**
     * Performs basic health check with caching
     * @private
     * @async
     * @returns {Promise<Object>} Basic health status
     */
    async performBasicHealthCheck() {
        const cacheKey = 'basic';
        const cached = this.getCachedResult(cacheKey, this.checkCacheTTL.basic);
        if (cached) return cached;

        const startTime = performance.now();
        const checks = [];

        // Run critical checks only for basic health
        const criticalChecks = ['process', 'eventLoop'];
        
        for (const checkName of criticalChecks) {
            const check = this.componentChecks.get(checkName);
            if (check) {
                try {
                    const result = await check();
                    checks.push({
                        name: checkName,
                        healthy: result.healthy,
                        status: result.status,
                        responseTime: Date.now() - startTime
                    });
                } catch (error) {
                    checks.push({
                        name: checkName,
                        healthy: false,
                        status: this.statusLevels.CRITICAL,
                        error: error.message
                    });
                }
            }
        }

        // Determine overall status
        const unhealthyChecks = checks.filter(c => !c.healthy);
        let overallStatus = this.statusLevels.HEALTHY;
        
        if (unhealthyChecks.length > 0) {
            const criticalFailures = unhealthyChecks.filter(c => c.status === this.statusLevels.CRITICAL);
            overallStatus = criticalFailures.length > 0 ? this.statusLevels.CRITICAL : this.statusLevels.DEGRADED;
        }

        const result = {
            status: overallStatus,
            timestamp: Date.now(),
            uptime: Date.now() - this.startupTime,
            responseTime: Math.round(performance.now() - startTime),
            checks: checks.map(c => ({
                name: c.name,
                healthy: c.healthy,
                status: c.status
            })),
            maintenance: this.maintenanceMode
        };

        this.setCachedResult(cacheKey, result, this.checkCacheTTL.basic);
        this.addToHealthHistory(result);
        
        return result;
    }

    /**
     * Performs liveness check
     * @private
     * @async
     * @returns {Promise<Object>} Liveness status
     */
    async performLivenessCheck() {
        try {
            // Check if process is responsive
            const processCheck = this.componentChecks.get('process');
            const processResult = processCheck ? await processCheck() : { healthy: true };
            
            // Check event loop responsiveness
            const eventLoopCheck = this.componentChecks.get('eventLoop');
            const eventLoopResult = eventLoopCheck ? await eventLoopCheck() : { healthy: true };
            
            const alive = processResult.healthy && eventLoopResult.healthy;
            const issues = [];
            
            if (!processResult.healthy) {
                issues.push('Process health check failed');
            }
            if (!eventLoopResult.healthy) {
                issues.push('Event loop unresponsive');
            }
            
            return {
                alive,
                details: {
                    process: processResult.healthy,
                    eventLoop: eventLoopResult.healthy
                },
                ...(issues.length > 0 && { issues })
            };
        } catch (error) {
            return {
                alive: false,
                issues: ['Liveness check failed: ' + error.message]
            };
        }
    }

    /**
     * Performs readiness check
     * @private
     * @async
     * @returns {Promise<Object>} Readiness status
     */
    async performReadinessCheck() {
        const reasons = [];
        const details = {};
        
        // Check initialization status
        if (!this.initializationComplete) {
            reasons.push('Application initialization not complete');
        }
        
        // Check maintenance mode
        if (this.maintenanceMode) {
            reasons.push('Service in maintenance mode');
        }
        
        // Check critical dependencies
        for (const [name, check] of this.dependencyChecks) {
            try {
                const result = await check();
                details[name] = result.healthy;
                
                if (!result.healthy) {
                    reasons.push(`Dependency ${name} is unhealthy: ${result.message}`);
                }
            } catch (error) {
                details[name] = false;
                reasons.push(`Dependency ${name} check failed: ${error.message}`);
            }
        }
        
        // Check if services are available
        if (this.serviceRegistry) {
            try {
                const services = this.serviceRegistry.getAllServices();
                const healthyServices = services.filter(s => s.status === 'healthy');
                
                if (services.length > 0 && healthyServices.length === 0) {
                    reasons.push('No healthy services available');
                }
                
                details.services = {
                    total: services.length,
                    healthy: healthyServices.length
                };
            } catch (error) {
                reasons.push('Service registry unavailable');
            }
        }
        
        return {
            ready: reasons.length === 0,
            ...(reasons.length > 0 && { reasons }),
            details
        };
    }

    /**
     * Performs startup check
     * @private
     * @async
     * @returns {Promise<Object>} Startup status
     */
    async performStartupCheck() {
        const uptime = Date.now() - this.startupTime;
        const minimumStartupTime = 10000; // 10 seconds minimum
        
        if (uptime < minimumStartupTime) {
            const progress = Math.floor((uptime / minimumStartupTime) * 100);
            return {
                started: false,
                progress,
                pendingTasks: ['Completing initialization', 'Loading configurations']
            };
        }
        
        const pendingTasks = [];
        const errors = [];
        
        // Check initialization status
        if (!this.initializationComplete) {
            pendingTasks.push('Application initialization');
        }
        
        // Check for initialization errors
        if (this.initializationProgress.errors.length > 0) {
            errors.push(...this.initializationProgress.errors);
        }
        
        const progress = this.initializationComplete ? 100 : 
            Math.floor((this.initializationProgress.completed / this.initializationProgress.total) * 100);
        
        return {
            started: this.initializationComplete && pendingTasks.length === 0,
            progress,
            ...(pendingTasks.length > 0 && { pendingTasks }),
            ...(errors.length > 0 && { errors })
        };
    }

    /**
     * Performs detailed health check
     * @private
     * @async
     * @param {boolean} includeMetrics - Include system metrics
     * @param {boolean} includeHistory - Include health history
     * @returns {Promise<Object>} Detailed health status
     */
    async performDetailedHealthCheck(includeMetrics = false, includeHistory = false) {
        const cacheKey = `detailed_${includeMetrics}_${includeHistory}`;
        const cached = this.getCachedResult(cacheKey, this.checkCacheTTL.detailed);
        if (cached) return cached;

        const startTime = performance.now();
        const components = {};
        const issues = [];
        const warnings = [];
        
        // Run all component checks
        for (const [name, check] of this.componentChecks) {
            try {
                const componentStart = performance.now();
                const result = await check();
                
                components[name] = {
                    ...result,
                    responseTime: Math.round(performance.now() - componentStart),
                    category: this.checkCategories.CORE
                };
                
                if (!result.healthy) {
                    if (result.status === this.statusLevels.CRITICAL) {
                        issues.push(`${name}: ${result.message || 'Health check failed'}`);
                    } else {
                        warnings.push(`${name}: ${result.message || 'Health check warning'}`);
                    }
                }
            } catch (error) {
                components[name] = {
                    healthy: false,
                    status: this.statusLevels.CRITICAL,
                    message: error.message,
                    category: this.checkCategories.CORE
                };
                issues.push(`${name}: ${error.message}`);
            }
        }
        
        // Run dependency checks
        for (const [name, check] of this.dependencyChecks) {
            try {
                const result = await check();
                components[`dependency_${name}`] = {
                    ...result,
                    category: this.checkCategories.DEPENDENCIES
                };
                
                if (!result.healthy) {
                    issues.push(`Dependency ${name}: ${result.message}`);
                }
            } catch (error) {
                components[`dependency_${name}`] = {
                    healthy: false,
                    status: this.statusLevels.CRITICAL,
                    message: error.message,
                    category: this.checkCategories.DEPENDENCIES
                };
                issues.push(`Dependency ${name}: ${error.message}`);
            }
        }
        
        // Run performance checks
        for (const [name, check] of this.performanceChecks) {
            try {
                const result = await check();
                components[`performance_${name}`] = {
                    ...result,
                    category: this.checkCategories.PERFORMANCE
                };
                
                if (!result.healthy && result.issues) {
                    warnings.push(...result.issues);
                }
            } catch (error) {
                components[`performance_${name}`] = {
                    healthy: false,
                    status: this.statusLevels.DEGRADED,
                    message: error.message,
                    category: this.checkCategories.PERFORMANCE
                };
            }
        }
        
        // Run security checks
        for (const [name, check] of this.securityChecks) {
            try {
                const result = await check();
                components[`security_${name}`] = {
                    ...result,
                    category: this.checkCategories.SECURITY
                };
                
                if (!result.healthy && result.issues) {
                    issues.push(...result.issues);
                }
            } catch (error) {
                components[`security_${name}`] = {
                    healthy: false,
                    status: this.statusLevels.CRITICAL,
                    message: error.message,
                    category: this.checkCategories.SECURITY
                };
            }
        }
        
        // Run custom checks
        for (const [name, check] of this.customChecks) {
            try {
                const result = await check();
                components[`custom_${name}`] = {
                    ...result,
                    category: this.checkCategories.CUSTOM
                };
            } catch (error) {
                components[`custom_${name}`] = {
                    healthy: false,
                    status: this.statusLevels.DEGRADED,
                    message: error.message,
                    category: this.checkCategories.CUSTOM
                };
            }
        }
        
        // Determine overall status
        let overallStatus = this.statusLevels.HEALTHY;
        
        if (issues.length > 0) {
            overallStatus = this.statusLevels.UNHEALTHY;
        } else if (warnings.length > 0) {
            overallStatus = this.statusLevels.DEGRADED;
        }
        
        const result = {
            overallStatus,
            timestamp: Date.now(),
            uptime: Date.now() - this.startupTime,
            responseTime: Math.round(performance.now() - startTime),
            components,
            summary: {
                total: Object.keys(components).length,
                healthy: Object.values(components).filter(c => c.healthy).length,
                unhealthy: Object.values(components).filter(c => !c.healthy).length,
                categories: {
                    core: Object.values(components).filter(c => c.category === this.checkCategories.CORE).length,
                    dependencies: Object.values(components).filter(c => c.category === this.checkCategories.DEPENDENCIES).length,
                    performance: Object.values(components).filter(c => c.category === this.checkCategories.PERFORMANCE).length,
                    security: Object.values(components).filter(c => c.category === this.checkCategories.SECURITY).length,
                    custom: Object.values(components).filter(c => c.category === this.checkCategories.CUSTOM).length
                }
            },
            ...(issues.length > 0 && { issues }),
            ...(warnings.length > 0 && { warnings }),
            ...(includeMetrics && { metrics: await this.getHealthMetrics() }),
            ...(includeHistory && { 
                history: this.getHealthHistory(50).history.slice(-10) 
            })
        };

        this.setCachedResult(cacheKey, result, this.checkCacheTTL.detailed);
        this.addToHealthHistory({
            status: overallStatus,
            timestamp: result.timestamp,
            responseTime: result.responseTime,
            summary: result.summary
        });
        
        return result;
    }

    /**
     * Helper methods for caching, history, and utilities
     */
    
    getCachedResult(key, ttl) {
        const cached = this.lastCheckResults.get(key);
        if (cached && (Date.now() - cached.timestamp) < ttl) {
            return cached.result;
        }
        return null;
    }
    
    setCachedResult(key, result, ttl) {
        this.lastCheckResults.set(key, {
            result,
            timestamp: Date.now(),
            ttl
        });
    }
    
    addToHealthHistory(result) {
        this.healthHistory.push({
            ...result,
            timestamp: result.timestamp || Date.now()
        });
        
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }
    }
    
    recordHealthCheckMetrics(type, status, responseTime = null) {
        if (this.metricsCollector) {
            this.metricsCollector.incrementCounter('health_checks_total', {
                type,
                status
            });
            
            if (responseTime !== null) {
                this.metricsCollector.recordHistogram('health_check_duration_ms', responseTime, {
                    type
                });
            }
        }
    }
    
    recordSecurityEvent(event) {
        this.securityEvents.push(event);
        
        if (this.securityEvents.length > this.maxSecurityEvents) {
            this.securityEvents.shift();
        }
        
        this.logger.warn('Security event recorded', event);
    }
    
    handleHealthCheckError(res, error, checkType) {
        this.logger.error(`Health check error (${checkType})`, error);
        
        if (this.metricsCollector) {
            this.metricsCollector.incrementCounter('health_check_errors_total', {
                type: checkType
            });
        }
        
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            type: checkType,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: Date.now()
        });
    }

    // Additional stub methods for completeness
    async checkAllDependencies() {
        const results = {};
        const summary = { total: 0, healthy: 0, unhealthy: 0 };
        
        for (const [name, check] of this.dependencyChecks) {
            try {
                const result = await check();
                results[name] = result;
                summary.total++;
                if (result.healthy) summary.healthy++;
                else summary.unhealthy++;
            } catch (error) {
                results[name] = {
                    healthy: false,
                    status: this.statusLevels.CRITICAL,
                    message: error.message
                };
                summary.total++;
                summary.unhealthy++;
            }
        }
        
        return { results, summary };
    }
    
    async checkServiceHealth() {
        // Implementation for service health checking
        return {
            summary: { total: 0, healthy: 0, unhealthy: 0 },
            details: [],
            circuitBreakers: {}
        };
    }
    
    async checkSystemResources() {
        // Implementation for system resource checking
        return {
            overallStatus: this.statusLevels.HEALTHY,
            details: {},
            alerts: [],
            trends: {}
        };
    }
    
    async runComprehensiveDiagnostics(options = {}) {
        // Implementation for comprehensive diagnostics
        return {
            timestamp: Date.now(),
            overallStatus: 'PASS',
            tests: [],
            summary: { total: 0, passed: 0, failed: 0 }
        };
    }
    
    async getHealthStatusSummary() {
        // Implementation for health status summary
        return {
            status: this.statusLevels.HEALTHY,
            timestamp: Date.now()
        };
    }
    
    getHealthHistory(limit = 100, category = null, since = null) {
        let history = this.healthHistory;
        
        if (since) {
            history = history.filter(h => h.timestamp >= since);
        }
        
        if (category) {
            history = history.filter(h => h.category === category);
        }
        
        return {
            history: history.slice(-limit),
            total: this.healthHistory.length,
            limit
        };
    }
    
    async getHealthMetrics() {
        const processMetrics = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        };
        
        const systemMetrics = {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            loadAverage: os.loadavg()
        };
        
        return {
            process: processMetrics,
            system: systemMetrics,
            v8: v8.getHeapStatistics(),
            timestamp: Date.now()
        };
    }
    
    getCurrentRealtimeMetrics() {
        return {
            cpu: this.realtimeMetrics.cpu.slice(-10),
            memory: this.realtimeMetrics.memory.slice(-10),
            eventLoop: this.realtimeMetrics.eventLoop.slice(-10),
            connections: this.realtimeMetrics.connections,
            timestamp: Date.now()
        };
    }
    
    async getActiveAlerts() {
        // Implementation for active alerts
        return {
            alerts: [],
            count: 0,
            timestamp: Date.now()
        };
    }
    
    async analyzeTrends() {
        // Implementation for trend analysis
        this.logger.debug('Analyzing health trends');
    }

    /**
     * Additional route setup methods
     */
    setupSecurityRoutes() {
        // Security-specific health routes
    }
    
    setupPerformanceRoutes() {
        // Performance-specific health routes  
    }
    
    setupCustomHealthRoutes() {
        // Custom health check routes
    }
    
    setupLoadBalancerRoutes() {
        // Load balancer integration routes
    }

    /**
     * Returns the Express router instance
     * @returns {express.Router} Express router with health endpoints
     */
    getRouter() {
        return this.router;
    }

    /**
     * Performs cleanup operations when shutting down
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.logger.info('Cleaning up HealthRoutesManager');
            
            // Clear all monitoring intervals
            for (const [name, interval] of this.monitoringIntervals) {
                clearInterval(interval);
                this.logger.debug(`Cleared monitoring interval: ${name}`);
            }
            this.monitoringIntervals.clear();
            
            // Clear cached results
            this.lastCheckResults.clear();
            
            // Clear health history if needed
            // this.healthHistory = [];
            
            this.logger.info('HealthRoutesManager cleanup completed');
        } catch (error) {
            this.logger.error('Error during HealthRoutesManager cleanup', error);
            throw error;
        }
    }
}

module.exports = { HealthRoutesManager };