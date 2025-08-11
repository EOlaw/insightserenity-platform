'use strict';

/**
 * @fileoverview Health Routes - Health check and monitoring endpoints
 * @module servers/gateway/routes/health-routes
 * @requires express
 * @requires os
 * @requires v8
 */

const express = require('express');
const os = require('os');
const v8 = require('v8');
const router = express.Router();

/**
 * HealthRoutes class provides comprehensive health check and monitoring endpoints
 * for the API Gateway. It implements various health check levels (shallow, deep),
 * readiness and liveness probes, dependency checks, performance monitoring,
 * resource utilization tracking, and detailed diagnostics.
 */
class HealthRoutes {
    /**
     * Creates an instance of HealthRoutes
     * @constructor
     * @param {Object} healthMonitor - Health monitor service
     * @param {Object} serviceRegistry - Service registry
     * @param {Object} cacheManager - Cache manager
     * @param {Object} databaseManager - Database manager
     * @param {Object} metricsCollector - Metrics collector
     * @param {Object} circuitBreakerManager - Circuit breaker manager
     * @param {Object} logger - Logger instance
     */
    constructor(
        healthMonitor,
        serviceRegistry,
        cacheManager,
        databaseManager,
        metricsCollector,
        circuitBreakerManager,
        logger
    ) {
        this.healthMonitor = healthMonitor;
        this.serviceRegistry = serviceRegistry;
        this.cacheManager = cacheManager;
        this.databaseManager = databaseManager;
        this.metricsCollector = metricsCollector;
        this.circuitBreakerManager = circuitBreakerManager;
        this.logger = logger;
        
        // Health check thresholds
        this.thresholds = {
            memory: {
                warning: 0.7,  // 70% memory usage
                critical: 0.9  // 90% memory usage
            },
            cpu: {
                warning: 0.7,  // 70% CPU usage
                critical: 0.9  // 90% CPU usage
            },
            diskSpace: {
                warning: 0.8,  // 80% disk usage
                critical: 0.95 // 95% disk usage
            },
            responseTime: {
                warning: 1000,  // 1 second
                critical: 5000  // 5 seconds
            },
            errorRate: {
                warning: 0.01,  // 1% error rate
                critical: 0.05  // 5% error rate
            }
        };
        
        // Health status levels
        this.statusLevels = {
            HEALTHY: 'healthy',
            DEGRADED: 'degraded',
            UNHEALTHY: 'unhealthy',
            CRITICAL: 'critical'
        };
        
        // Component health checks
        this.componentChecks = new Map();
        this.customChecks = new Map();
        
        // Health history
        this.healthHistory = [];
        this.maxHistorySize = 100;
        
        // Startup time
        this.startupTime = Date.now();
        
        // Last check results cache
        this.lastCheckResults = null;
        this.lastCheckTime = null;
        this.checkCacheTTL = 5000; // 5 seconds
        
        // Initialize routes
        this.initializeRoutes();
        
        // Register default component checks
        this.registerDefaultChecks();
    }

    /**
     * Initializes health check routes
     * @private
     */
    initializeRoutes() {
        /**
         * GET /health
         * Basic health check endpoint
         */
        router.get('/', async (req, res) => {
            try {
                const health = await this.performBasicHealthCheck();
                
                const statusCode = health.status === this.statusLevels.HEALTHY ? 200 : 503;
                
                res.status(statusCode).json(health);
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/live
         * Kubernetes liveness probe endpoint
         */
        router.get('/live', async (req, res) => {
            try {
                const isLive = await this.performLivenessCheck();
                
                if (isLive) {
                    res.status(200).json({
                        status: 'live',
                        timestamp: Date.now()
                    });
                } else {
                    res.status(503).json({
                        status: 'dead',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/ready
         * Kubernetes readiness probe endpoint
         */
        router.get('/ready', async (req, res) => {
            try {
                const readiness = await this.performReadinessCheck();
                
                if (readiness.ready) {
                    res.status(200).json({
                        status: 'ready',
                        timestamp: Date.now(),
                        details: readiness.details
                    });
                } else {
                    res.status(503).json({
                        status: 'not_ready',
                        timestamp: Date.now(),
                        reasons: readiness.reasons
                    });
                }
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/startup
         * Kubernetes startup probe endpoint
         */
        router.get('/startup', async (req, res) => {
            try {
                const startup = await this.performStartupCheck();
                
                if (startup.started) {
                    res.status(200).json({
                        status: 'started',
                        startupTime: this.startupTime,
                        uptime: Date.now() - this.startupTime
                    });
                } else {
                    res.status(503).json({
                        status: 'starting',
                        progress: startup.progress,
                        pendingTasks: startup.pendingTasks
                    });
                }
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/detailed
         * Detailed health check with all components
         */
        router.get('/detailed', async (req, res) => {
            try {
                const detailed = await this.performDetailedHealthCheck();
                
                const statusCode = detailed.overallStatus === this.statusLevels.HEALTHY ? 200 : 
                                  detailed.overallStatus === this.statusLevels.DEGRADED ? 200 : 503;
                
                res.status(statusCode).json(detailed);
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/dependencies
         * Check health of all dependencies
         */
        router.get('/dependencies', async (req, res) => {
            try {
                const dependencies = await this.checkDependencies();
                
                const allHealthy = Object.values(dependencies).every(dep => dep.healthy);
                
                res.status(allHealthy ? 200 : 503).json({
                    status: allHealthy ? 'healthy' : 'unhealthy',
                    dependencies,
                    timestamp: Date.now()
                });
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/services
         * Check health of all registered services
         */
        router.get('/services', async (req, res) => {
            try {
                const services = await this.checkServices();
                
                res.json({
                    total: services.total,
                    healthy: services.healthy,
                    unhealthy: services.unhealthy,
                    services: services.details,
                    timestamp: Date.now()
                });
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/metrics
         * Get health-related metrics
         */
        router.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.getHealthMetrics();
                
                res.json(metrics);
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/resources
         * Check resource utilization
         */
        router.get('/resources', async (req, res) => {
            try {
                const resources = await this.checkResources();
                
                res.json(resources);
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/diagnostics
         * Run diagnostic checks
         */
        router.get('/diagnostics', async (req, res) => {
            try {
                const diagnostics = await this.runDiagnostics();
                
                res.json(diagnostics);
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * GET /health/history
         * Get health check history
         */
        router.get('/history', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const history = this.healthHistory.slice(-limit);
                
                res.json({
                    history,
                    total: this.healthHistory.length,
                    limit
                });
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * POST /health/custom/:name
         * Register custom health check
         */
        router.post('/custom/:name', (req, res) => {
            try {
                const { name } = req.params;
                const { check } = req.body;
                
                if (!check || typeof check !== 'string') {
                    return res.status(400).json({
                        error: 'Invalid check function'
                    });
                }
                
                // Convert string to function (be careful with this in production)
                const checkFunction = new Function('return ' + check)();
                
                this.registerCustomCheck(name, checkFunction);
                
                res.json({
                    message: `Custom health check '${name}' registered successfully`
                });
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });

        /**
         * DELETE /health/custom/:name
         * Remove custom health check
         */
        router.delete('/custom/:name', (req, res) => {
            try {
                const { name } = req.params;
                
                if (this.customChecks.delete(name)) {
                    res.json({
                        message: `Custom health check '${name}' removed successfully`
                    });
                } else {
                    res.status(404).json({
                        error: `Custom health check '${name}' not found`
                    });
                }
            } catch (error) {
                this.handleHealthCheckError(res, error);
            }
        });
    }

    /**
     * Registers default component health checks
     * @private
     */
    registerDefaultChecks() {
        // Database check
        this.componentChecks.set('database', async () => {
            try {
                if (this.databaseManager) {
                    await this.databaseManager.ping();
                    return { healthy: true, message: 'Database connection is healthy' };
                }
                return { healthy: true, message: 'Database not configured' };
            } catch (error) {
                return { 
                    healthy: false, 
                    message: 'Database connection failed',
                    error: error.message 
                };
            }
        });

        // Cache check
        this.componentChecks.set('cache', async () => {
            try {
                if (this.cacheManager) {
                    await this.cacheManager.ping();
                    const stats = await this.cacheManager.getStatistics();
                    return { 
                        healthy: true, 
                        message: 'Cache is operational',
                        stats: {
                            hitRate: stats.hitRate,
                            size: stats.size
                        }
                    };
                }
                return { healthy: true, message: 'Cache not configured' };
            } catch (error) {
                return { 
                    healthy: false, 
                    message: 'Cache connection failed',
                    error: error.message 
                };
            }
        });

        // Service registry check
        this.componentChecks.set('serviceRegistry', async () => {
            try {
                const services = this.serviceRegistry.getAllServices();
                const healthyServices = services.filter(s => s.status === 'healthy');
                
                return {
                    healthy: healthyServices.length > 0,
                    message: `${healthyServices.length}/${services.length} services healthy`,
                    details: {
                        total: services.length,
                        healthy: healthyServices.length,
                        unhealthy: services.length - healthyServices.length
                    }
                };
            } catch (error) {
                return {
                    healthy: false,
                    message: 'Service registry check failed',
                    error: error.message
                };
            }
        });

        // Circuit breaker check
        this.componentChecks.set('circuitBreakers', async () => {
            try {
                if (this.circuitBreakerManager) {
                    const breakers = this.circuitBreakerManager.getAllBreakers();
                    const openBreakers = breakers.filter(b => b.state === 'open');
                    
                    return {
                        healthy: openBreakers.length === 0,
                        message: openBreakers.length > 0 ? 
                            `${openBreakers.length} circuit breakers are open` :
                            'All circuit breakers are closed',
                        details: {
                            total: breakers.length,
                            open: openBreakers.length,
                            closed: breakers.filter(b => b.state === 'closed').length,
                            halfOpen: breakers.filter(b => b.state === 'half-open').length
                        }
                    };
                }
                return { healthy: true, message: 'Circuit breakers not configured' };
            } catch (error) {
                return {
                    healthy: false,
                    message: 'Circuit breaker check failed',
                    error: error.message
                };
            }
        });

        // Memory check
        this.componentChecks.set('memory', async () => {
            const memUsage = process.memoryUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memoryUsagePercent = usedMem / totalMem;
            
            let status = this.statusLevels.HEALTHY;
            if (memoryUsagePercent > this.thresholds.memory.critical) {
                status = this.statusLevels.CRITICAL;
            } else if (memoryUsagePercent > this.thresholds.memory.warning) {
                status = this.statusLevels.DEGRADED;
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `Memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`,
                details: {
                    rss: memUsage.rss,
                    heapTotal: memUsage.heapTotal,
                    heapUsed: memUsage.heapUsed,
                    external: memUsage.external,
                    systemTotal: totalMem,
                    systemFree: freeMem,
                    systemUsedPercent: memoryUsagePercent
                }
            };
        });

        // CPU check
        this.componentChecks.set('cpu', async () => {
            const cpus = os.cpus();
            const loadAvg = os.loadavg();
            const cpuCount = cpus.length;
            const loadPercent = loadAvg[0] / cpuCount;
            
            let status = this.statusLevels.HEALTHY;
            if (loadPercent > this.thresholds.cpu.critical) {
                status = this.statusLevels.CRITICAL;
            } else if (loadPercent > this.thresholds.cpu.warning) {
                status = this.statusLevels.DEGRADED;
            }
            
            return {
                healthy: status === this.statusLevels.HEALTHY,
                status,
                message: `CPU load: ${(loadPercent * 100).toFixed(2)}%`,
                details: {
                    cores: cpuCount,
                    loadAverage: loadAvg,
                    loadPercent,
                    model: cpus[0].model
                }
            };
        });

        // Disk space check
        this.componentChecks.set('diskSpace', async () => {
            // This would need a proper disk space check library in production
            // For now, return a mock healthy status
            return {
                healthy: true,
                message: 'Disk space check not implemented',
                details: {
                    available: 'N/A',
                    used: 'N/A',
                    total: 'N/A'
                }
            };
        });
    }

    /**
     * Performs basic health check
     * @private
     * @async
     * @returns {Promise<Object>} Health status
     */
    async performBasicHealthCheck() {
        // Check cache first
        if (this.lastCheckResults && 
            this.lastCheckTime && 
            (Date.now() - this.lastCheckTime) < this.checkCacheTTL) {
            return this.lastCheckResults;
        }
        
        const startTime = Date.now();
        const checks = [];
        
        // Check if process is responsive
        checks.push({
            name: 'process',
            healthy: true,
            responseTime: 0
        });
        
        // Check critical components
        const criticalComponents = ['database', 'cache', 'serviceRegistry'];
        
        for (const component of criticalComponents) {
            const check = this.componentChecks.get(component);
            if (check) {
                const componentStart = Date.now();
                const result = await check();
                checks.push({
                    name: component,
                    ...result,
                    responseTime: Date.now() - componentStart
                });
            }
        }
        
        // Determine overall status
        const unhealthyChecks = checks.filter(c => !c.healthy);
        let status = this.statusLevels.HEALTHY;
        
        if (unhealthyChecks.length > 0) {
            status = unhealthyChecks.some(c => criticalComponents.includes(c.name)) ?
                this.statusLevels.UNHEALTHY : this.statusLevels.DEGRADED;
        }
        
        const result = {
            status,
            timestamp: Date.now(),
            uptime: Date.now() - this.startupTime,
            responseTime: Date.now() - startTime,
            checks: checks.map(c => ({
                name: c.name,
                healthy: c.healthy,
                responseTime: c.responseTime
            }))
        };
        
        // Cache results
        this.lastCheckResults = result;
        this.lastCheckTime = Date.now();
        
        // Add to history
        this.addToHistory(result);
        
        return result;
    }

    /**
     * Performs liveness check
     * @private
     * @async
     * @returns {Promise<boolean>} Liveness status
     */
    async performLivenessCheck() {
        try {
            // Simple check - can the process respond?
            return true;
        } catch (error) {
            this.log('error', 'Liveness check failed', error);
            return false;
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
        
        // Check if startup is complete
        if ((Date.now() - this.startupTime) < 10000) { // 10 seconds startup grace period
            reasons.push('Still in startup phase');
        }
        
        // Check critical dependencies
        const criticalChecks = ['database', 'serviceRegistry'];
        
        for (const checkName of criticalChecks) {
            const check = this.componentChecks.get(checkName);
            if (check) {
                const result = await check();
                details[checkName] = result.healthy;
                
                if (!result.healthy) {
                    reasons.push(`${checkName} is not ready: ${result.message}`);
                }
            }
        }
        
        // Check if we have healthy services
        const services = this.serviceRegistry.getAllServices();
        const healthyServices = services.filter(s => s.status === 'healthy');
        
        if (healthyServices.length === 0) {
            reasons.push('No healthy services available');
        }
        
        return {
            ready: reasons.length === 0,
            reasons,
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
        const minimumStartupTime = 5000; // 5 seconds
        
        if (uptime < minimumStartupTime) {
            return {
                started: false,
                progress: Math.floor((uptime / minimumStartupTime) * 100),
                pendingTasks: ['Initializing services', 'Loading configurations']
            };
        }
        
        // Check if all components are initialized
        const pendingTasks = [];
        
        if (!this.serviceRegistry.isInitialized) {
            pendingTasks.push('Service registry initialization');
        }
        
        if (this.healthMonitor && !this.healthMonitor.isInitialized) {
            pendingTasks.push('Health monitor initialization');
        }
        
        return {
            started: pendingTasks.length === 0,
            progress: pendingTasks.length === 0 ? 100 : 90,
            pendingTasks
        };
    }

    /**
     * Performs detailed health check
     * @private
     * @async
     * @returns {Promise<Object>} Detailed health status
     */
    async performDetailedHealthCheck() {
        const startTime = Date.now();
        const components = {};
        const issues = [];
        const warnings = [];
        
        // Check all components
        for (const [name, check] of this.componentChecks) {
            const componentStart = Date.now();
            const result = await check();
            
            components[name] = {
                ...result,
                responseTime: Date.now() - componentStart
            };
            
            if (!result.healthy) {
                if (result.status === this.statusLevels.CRITICAL) {
                    issues.push(`${name}: ${result.message}`);
                } else {
                    warnings.push(`${name}: ${result.message}`);
                }
            }
        }
        
        // Check custom checks
        for (const [name, check] of this.customChecks) {
            try {
                const result = await check();
                components[`custom_${name}`] = result;
            } catch (error) {
                components[`custom_${name}`] = {
                    healthy: false,
                    message: error.message
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
        
        return {
            overallStatus,
            timestamp: Date.now(),
            uptime: Date.now() - this.startupTime,
            responseTime: Date.now() - startTime,
            components,
            issues,
            warnings,
            metrics: await this.getHealthMetrics()
        };
    }

    /**
     * Checks all dependencies
     * @private
     * @async
     * @returns {Promise<Object>} Dependencies status
     */
    async checkDependencies() {
        const dependencies = {};
        
        // Check database
        if (this.databaseManager) {
            try {
                await this.databaseManager.ping();
                dependencies.database = {
                    healthy: true,
                    responseTime: 10, // Mock response time
                    version: await this.databaseManager.getVersion()
                };
            } catch (error) {
                dependencies.database = {
                    healthy: false,
                    error: error.message
                };
            }
        }
        
        // Check cache
        if (this.cacheManager) {
            try {
                await this.cacheManager.ping();
                dependencies.cache = {
                    healthy: true,
                    responseTime: 5,
                    type: 'redis',
                    stats: await this.cacheManager.getStatistics()
                };
            } catch (error) {
                dependencies.cache = {
                    healthy: false,
                    error: error.message
                };
            }
        }
        
        // Check external services
        const services = this.serviceRegistry.getAllServices();
        
        for (const service of services) {
            dependencies[`service_${service.name}`] = {
                healthy: service.status === 'healthy',
                url: service.url,
                lastCheck: service.lastHealthCheck
            };
        }
        
        return dependencies;
    }

    /**
     * Checks all services
     * @private
     * @async
     * @returns {Promise<Object>} Services status
     */
    async checkServices() {
        const services = this.serviceRegistry.getAllServices();
        const details = [];
        
        for (const service of services) {
            const health = await this.serviceRegistry.checkServiceHealth(service.name);
            
            details.push({
                name: service.name,
                url: service.url,
                status: health.status,
                healthy: health.healthy,
                responseTime: health.responseTime,
                lastCheck: health.timestamp,
                circuitBreaker: this.circuitBreakerManager ? 
                    this.circuitBreakerManager.getBreakerStatus(service.name) : 
                    'N/A'
            });
        }
        
        const healthyCount = details.filter(s => s.healthy).length;
        
        return {
            total: services.length,
            healthy: healthyCount,
            unhealthy: services.length - healthyCount,
            details
        };
    }

    /**
     * Gets health metrics
     * @private
     * @async
     * @returns {Promise<Object>} Health metrics
     */
    async getHealthMetrics() {
        const metrics = {};
        
        // Process metrics
        const memUsage = process.memoryUsage();
        metrics.process = {
            uptime: process.uptime(),
            pid: process.pid,
            version: process.version,
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            cpu: process.cpuUsage()
        };
        
        // System metrics
        metrics.system = {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            loadAverage: os.loadavg(),
            uptime: os.uptime()
        };
        
        // V8 metrics
        metrics.v8 = v8.getHeapStatistics();
        
        // Gateway metrics
        if (this.metricsCollector) {
            metrics.gateway = await this.metricsCollector.getSummary();
        }
        
        // Cache metrics
        if (this.cacheManager) {
            metrics.cache = await this.cacheManager.getStatistics();
        }
        
        return metrics;
    }

    /**
     * Checks resource utilization
     * @private
     * @async
     * @returns {Promise<Object>} Resource utilization
     */
    async checkResources() {
        const resources = {};
        
        // Memory utilization
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        resources.memory = {
            total: totalMem,
            free: freeMem,
            used: usedMem,
            percentage: (usedMem / totalMem) * 100,
            status: this.getResourceStatus(usedMem / totalMem, this.thresholds.memory)
        };
        
        // CPU utilization
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        
        resources.cpu = {
            cores: cpus.length,
            model: cpus[0].model,
            speed: cpus[0].speed,
            loadAverage: {
                '1min': loadAvg[0],
                '5min': loadAvg[1],
                '15min': loadAvg[2]
            },
            percentage: (loadAvg[0] / cpus.length) * 100,
            status: this.getResourceStatus(loadAvg[0] / cpus.length, this.thresholds.cpu)
        };
        
        // File descriptors (Unix-like systems)
        if (process.platform !== 'win32') {
            try {
                const exec = require('util').promisify(require('child_process').exec);
                const { stdout } = await exec('ulimit -n');
                const maxFd = parseInt(stdout.trim());
                
                resources.fileDescriptors = {
                    max: maxFd,
                    used: process._getActiveHandles().length,
                    percentage: (process._getActiveHandles().length / maxFd) * 100
                };
            } catch (error) {
                resources.fileDescriptors = { error: 'Unable to check file descriptors' };
            }
        }
        
        // Event loop lag
        const lagStart = Date.now();
        setImmediate(() => {
            resources.eventLoopLag = Date.now() - lagStart;
        });
        
        return resources;
    }

    /**
     * Runs diagnostic checks
     * @private
     * @async
     * @returns {Promise<Object>} Diagnostic results
     */
    async runDiagnostics() {
        const diagnostics = {
            timestamp: Date.now(),
            tests: []
        };
        
        // Test database connectivity
        diagnostics.tests.push(await this.testDatabaseConnectivity());
        
        // Test cache operations
        diagnostics.tests.push(await this.testCacheOperations());
        
        // Test service discovery
        diagnostics.tests.push(await this.testServiceDiscovery());
        
        // Test circuit breakers
        diagnostics.tests.push(await this.testCircuitBreakers());
        
        // Test network connectivity
        diagnostics.tests.push(await this.testNetworkConnectivity());
        
        // Calculate overall diagnostic status
        const failedTests = diagnostics.tests.filter(t => !t.passed);
        diagnostics.overallStatus = failedTests.length === 0 ? 'PASS' : 'FAIL';
        diagnostics.summary = {
            total: diagnostics.tests.length,
            passed: diagnostics.tests.filter(t => t.passed).length,
            failed: failedTests.length
        };
        
        return diagnostics;
    }

    /**
     * Diagnostic test methods
     */
    
    async testDatabaseConnectivity() {
        const test = {
            name: 'Database Connectivity',
            timestamp: Date.now()
        };
        
        try {
            if (this.databaseManager) {
                const start = Date.now();
                await this.databaseManager.ping();
                test.responseTime = Date.now() - start;
                test.passed = true;
                test.message = 'Database connection successful';
            } else {
                test.passed = true;
                test.message = 'Database not configured';
            }
        } catch (error) {
            test.passed = false;
            test.error = error.message;
            test.message = 'Database connection failed';
        }
        
        return test;
    }
    
    async testCacheOperations() {
        const test = {
            name: 'Cache Operations',
            timestamp: Date.now()
        };
        
        try {
            if (this.cacheManager) {
                const testKey = 'health-check-test';
                const testValue = { test: true, timestamp: Date.now() };
                
                // Test write
                await this.cacheManager.set(testKey, testValue, 10);
                
                // Test read
                const retrieved = await this.cacheManager.get(testKey);
                
                // Test delete
                await this.cacheManager.delete(testKey);
                
                test.passed = JSON.stringify(retrieved) === JSON.stringify(testValue);
                test.message = test.passed ? 'Cache operations successful' : 'Cache read/write mismatch';
            } else {
                test.passed = true;
                test.message = 'Cache not configured';
            }
        } catch (error) {
            test.passed = false;
            test.error = error.message;
            test.message = 'Cache operations failed';
        }
        
        return test;
    }
    
    async testServiceDiscovery() {
        const test = {
            name: 'Service Discovery',
            timestamp: Date.now()
        };
        
        try {
            const services = this.serviceRegistry.getAllServices();
            test.passed = services.length > 0;
            test.message = `Found ${services.length} registered services`;
            test.details = {
                total: services.length,
                healthy: services.filter(s => s.status === 'healthy').length
            };
        } catch (error) {
            test.passed = false;
            test.error = error.message;
            test.message = 'Service discovery failed';
        }
        
        return test;
    }
    
    async testCircuitBreakers() {
        const test = {
            name: 'Circuit Breakers',
            timestamp: Date.now()
        };
        
        try {
            if (this.circuitBreakerManager) {
                const breakers = this.circuitBreakerManager.getAllBreakers();
                const openBreakers = breakers.filter(b => b.state === 'open');
                
                test.passed = true;
                test.message = `${breakers.length} circuit breakers configured`;
                test.details = {
                    total: breakers.length,
                    open: openBreakers.length,
                    closed: breakers.filter(b => b.state === 'closed').length
                };
                
                if (openBreakers.length > 0) {
                    test.warning = `${openBreakers.length} circuit breakers are open`;
                }
            } else {
                test.passed = true;
                test.message = 'Circuit breakers not configured';
            }
        } catch (error) {
            test.passed = false;
            test.error = error.message;
            test.message = 'Circuit breaker test failed';
        }
        
        return test;
    }
    
    async testNetworkConnectivity() {
        const test = {
            name: 'Network Connectivity',
            timestamp: Date.now()
        };
        
        try {
            // Test DNS resolution
            const dns = require('dns').promises;
            await dns.resolve4('google.com');
            
            test.passed = true;
            test.message = 'Network connectivity test passed';
        } catch (error) {
            test.passed = false;
            test.error = error.message;
            test.message = 'Network connectivity test failed';
        }
        
        return test;
    }

    /**
     * Helper methods
     */
    
    getResourceStatus(usage, thresholds) {
        if (usage > thresholds.critical) {
            return this.statusLevels.CRITICAL;
        } else if (usage > thresholds.warning) {
            return this.statusLevels.DEGRADED;
        }
        return this.statusLevels.HEALTHY;
    }
    
    addToHistory(result) {
        this.healthHistory.push({
            timestamp: result.timestamp,
            status: result.status,
            responseTime: result.responseTime
        });
        
        // Limit history size
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }
    }
    
    registerCustomCheck(name, checkFunction) {
        this.customChecks.set(name, checkFunction);
        this.log('info', `Custom health check registered: ${name}`);
    }
    
    handleHealthCheckError(res, error) {
        this.log('error', 'Health check error', error);
        
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: Date.now()
        });
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

module.exports = HealthRoutes;