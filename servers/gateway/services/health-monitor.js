'use strict';

/**
 * @fileoverview Health Monitor Service - Comprehensive health monitoring for services and system components
 * @module servers/gateway/services/health-monitor
 * @requires events
 * @requires os
 * @requires fs
 * @requires axios
 * @requires perf_hooks
 */

const { EventEmitter } = require('events');
const os = require('os');
const fs = require('fs').promises;
const axios = require('axios');
const { performance } = require('perf_hooks');

/**
 * HealthMonitor class provides comprehensive health monitoring capabilities for the gateway
 * and all registered backend services. It performs periodic health checks, tracks system
 * resources, monitors dependencies, and provides detailed health status reporting for
 * Kubernetes probes, load balancers, and monitoring dashboards.
 * 
 * @class HealthMonitor
 * @extends EventEmitter
 */
class HealthMonitor extends EventEmitter {
    /**
     * Creates an instance of HealthMonitor
     * @constructor
     * @param {ServiceRegistry} serviceRegistry - Service registry instance for service health checks
     * @param {Object} config - Health monitoring configuration
     * @param {CircuitBreakerManager} circuitBreakerManager - Circuit breaker manager for fault tolerance
     */
    constructor(serviceRegistry, config, circuitBreakerManager) {
        super();
        this.serviceRegistry = serviceRegistry;
        this.config = config || {};
        this.circuitBreakerManager = circuitBreakerManager;

        // Health check state
        this.isRunning = false;
        this.startTime = Date.now();
        this.lastCheckTime = null;
        this.checkInterval = null;

        // Health status tracking
        this.healthStatus = {
            status: 'unknown',
            timestamp: null,
            uptime: 0,
            checks: {
                services: { status: 'unknown', details: {} },
                system: { status: 'unknown', details: {} },
                dependencies: { status: 'unknown', details: {} },
                custom: { status: 'unknown', details: {} }
            },
            metrics: {
                totalChecks: 0,
                failedChecks: 0,
                successRate: 100,
                averageResponseTime: 0
            }
        };

        // Component health tracking
        this.componentHealth = new Map();
        this.healthHistory = [];
        this.maxHistorySize = 100;

        // System thresholds
        this.thresholds = {
            cpu: {
                warning: config.thresholds?.cpu?.warning || 70,
                critical: config.thresholds?.cpu?.critical || 90
            },
            memory: {
                warning: config.thresholds?.memory?.warning || 80,
                critical: config.thresholds?.memory?.critical || 95
            },
            disk: {
                warning: config.thresholds?.disk?.warning || 80,
                critical: config.thresholds?.disk?.critical || 90
            },
            responseTime: {
                warning: config.thresholds?.responseTime?.warning || 1000,
                critical: config.thresholds?.responseTime?.critical || 5000
            },
            errorRate: {
                warning: config.thresholds?.errorRate?.warning || 5,
                critical: config.thresholds?.errorRate?.critical || 10
            }
        };

        // Health check strategies
        this.healthCheckStrategies = {
            'http': this.performHttpHealthCheck.bind(this),
            'tcp': this.performTcpHealthCheck.bind(this),
            'exec': this.performExecHealthCheck.bind(this),
            'grpc': this.performGrpcHealthCheck.bind(this)
        };

        // Dependency checks
        this.dependencies = new Map();
        this.registerDefaultDependencies();

        // Custom health checks
        this.customChecks = new Map();

        // Kubernetes probe handlers
        this.probeHandlers = {
            liveness: this.handleLivenessProbe.bind(this),
            readiness: this.handleReadinessProbe.bind(this),
            startup: this.handleStartupProbe.bind(this)
        };
    }

    /**
     * Starts the health monitoring service
     * @async
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            console.log('Health monitor already running');
            return;
        }

        try {
            console.log('Starting Health Monitor');

            // Perform initial health check
            await this.performHealthCheck();

            // Start periodic health checks
            const interval = this.config.interval || 30000;
            this.checkInterval = setInterval(async () => {
                await this.performHealthCheck();
            }, interval);

            // Start resource monitoring
            this.startResourceMonitoring();

            // Register signal handlers for health status
            this.registerSignalHandlers();

            this.isRunning = true;
            this.emit('health-monitor:started');

            console.log(`Health Monitor started with interval: ${interval}ms`);
        } catch (error) {
            console.error('Failed to start Health Monitor:', error);
            throw error;
        }
    }

    /**
     * Stops the health monitoring service
     * @async
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping Health Monitor');

        // Clear check interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        // Clear resource monitoring
        this.stopResourceMonitoring();

        // Update status
        this.healthStatus.status = 'stopped';
        this.isRunning = false;

        this.emit('health-monitor:stopped');
        console.log('Health Monitor stopped');
    }

    /**
     * Performs comprehensive health check
     * @async
     * @returns {Promise<Object>} Health check results
     */
    async performHealthCheck() {
        const checkStartTime = performance.now();

        try {
            console.log('Performing health check');

            // Check all components in parallel
            const [servicesHealth, systemHealth, dependenciesHealth, customHealth] = await Promise.allSettled([
                this.checkServicesHealth(),
                this.checkSystemHealth(),
                this.checkDependenciesHealth(),
                this.checkCustomHealth()
            ]);

            // Update health status
            this.healthStatus.checks.services = this.processHealthResult(servicesHealth);
            this.healthStatus.checks.system = this.processHealthResult(systemHealth);
            this.healthStatus.checks.dependencies = this.processHealthResult(dependenciesHealth);
            this.healthStatus.checks.custom = this.processHealthResult(customHealth);

            // Calculate overall status
            this.healthStatus.status = this.calculateOverallStatus();
            this.healthStatus.timestamp = new Date().toISOString();
            this.healthStatus.uptime = Date.now() - this.startTime;

            // Update metrics
            const checkDuration = performance.now() - checkStartTime;
            this.updateHealthMetrics(checkDuration);

            // Store in history
            this.addToHistory(this.healthStatus);

            // Emit health status
            this.emit('health:checked', this.healthStatus);

            // Check for status changes
            this.checkForStatusChanges();

            this.lastCheckTime = Date.now();

            return this.healthStatus;
        } catch (error) {
            console.error('Health check failed:', error);
            this.healthStatus.status = 'error';
            this.healthStatus.error = error.message;
            this.emit('health:error', error);
            throw error;
        }
    }

    /**
     * Checks health of all registered services
     * @async
     * @private
     * @returns {Promise<Object>} Services health status
     */
    async checkServicesHealth() {
        const services = this.serviceRegistry.getAllServices();
        const healthChecks = new Map();
        const results = {
            healthy: 0,
            unhealthy: 0,
            degraded: 0,
            services: {}
        };

        for (const service of services) {
            try {
                const health = await this.checkServiceHealth(service);
                healthChecks.set(service.name, health);
                results.services[service.name] = health;

                if (health.status === 'healthy') {
                    results.healthy++;
                } else if (health.status === 'degraded') {
                    results.degraded++;
                } else {
                    results.unhealthy++;
                }
            } catch (error) {
                console.error(`Health check failed for service ${service.name}:`, error);
                results.services[service.name] = {
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.unhealthy++;
            }
        }

        // Determine overall services health
        let status = 'healthy';
        if (results.unhealthy > 0) {
            status = results.unhealthy === services.length ? 'unhealthy' : 'degraded';
        } else if (results.degraded > 0) {
            status = 'degraded';
        }

        return {
            status,
            details: results,
            totalServices: services.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Checks health of a specific service
     * @async
     * @private
     * @param {Object} service - Service to check
     * @returns {Promise<Object>} Service health status
     */
    async checkServiceHealth(service) {
        const startTime = performance.now();
        const strategy = service.healthCheck?.type || 'http';
        const healthCheckFn = this.healthCheckStrategies[strategy];

        if (!healthCheckFn) {
            throw new Error(`Unknown health check strategy: ${strategy}`);
        }

        try {
            const result = await healthCheckFn(service);
            const responseTime = performance.now() - startTime;

            // Check if circuit breaker is open
            const circuitBreakerStatus = this.circuitBreakerManager?.getStatus(service.name);

            return {
                status: result.success ? 'healthy' : 'unhealthy',
                responseTime,
                details: result.details,
                circuitBreaker: circuitBreakerStatus,
                lastCheck: new Date().toISOString(),
                consecutiveFailures: result.consecutiveFailures || 0
            };
        } catch (error) {
            const responseTime = performance.now() - startTime;

            return {
                status: 'unhealthy',
                responseTime,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
 * Performs HTTP health check
 * @async
 * @private
 * @param {Object} service - Service configuration
 * @returns {Promise<Object>} Health check result
 */
    async performHttpHealthCheck(service) {
        const url = `${service.url}${service.healthCheck?.path || '/health'}`;
        const timeout = service.healthCheck?.timeout || 5000;

        try {
            const axiosConfig = {
                timeout,
                validateStatus: (status) => status >= 200 && status < 300,
                headers: {
                    'User-Agent': 'Gateway-Health-Monitor/1.0'
                }
            };

            // Apply SSL configuration for HTTPS requests with development support
            if (url.startsWith('https://')) {
                const https = require('https');

                // Determine SSL security based on environment and configuration
                let rejectUnauthorized = true;

                // Check for explicit proxy configuration
                if (this.config && this.config.proxy && typeof this.config.proxy.secure === 'boolean') {
                    rejectUnauthorized = this.config.proxy.secure;
                } else {
                    // Default behavior: strict in production, relaxed in development
                    rejectUnauthorized = process.env.NODE_ENV === 'production';
                }

                // Allow override via environment variable for development flexibility
                if (process.env.GATEWAY_REJECT_UNAUTHORIZED === 'false') {
                    rejectUnauthorized = false;
                }

                axiosConfig.httpsAgent = new https.Agent({
                    rejectUnauthorized: rejectUnauthorized,
                    // Additional options for development environments
                    ...(process.env.NODE_ENV !== 'production' && {
                        checkServerIdentity: () => undefined // Bypass hostname verification in development
                    })
                });

                // Log SSL configuration for debugging in development
                if (process.env.NODE_ENV === 'development') {
                    console.log(`Health Monitor SSL config for ${service.name}: rejectUnauthorized=${rejectUnauthorized}`);
                }
            }

            const response = await axios.get(url, axiosConfig);

            return {
                success: true,
                details: {
                    statusCode: response.status,
                    body: response.data,
                    headers: response.headers
                }
            };
        } catch (error) {
            return {
                success: false,
                details: {
                    error: error.message,
                    code: error.code,
                    statusCode: error.response?.status
                }
            };
        }
    }

    /**
     * Performs TCP health check
     * @async
     * @private
     * @param {Object} service - Service configuration
     * @returns {Promise<Object>} Health check result
     */
    async performTcpHealthCheck(service) {
        const net = require('net');
        const timeout = service.healthCheck?.timeout || 5000;
        const [host, port] = service.url.replace(/^tcp:\/\//, '').split(':');

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let connected = false;

            socket.setTimeout(timeout);

            socket.on('connect', () => {
                connected = true;
                socket.end();
                resolve({
                    success: true,
                    details: { connected: true, host, port }
                });
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve({
                    success: false,
                    details: { error: 'Connection timeout', host, port }
                });
            });

            socket.on('error', (error) => {
                resolve({
                    success: false,
                    details: { error: error.message, host, port }
                });
            });

            socket.connect(parseInt(port), host);
        });
    }

    /**
     * Performs exec health check (command execution)
     * @async
     * @private
     * @param {Object} service - Service configuration
     * @returns {Promise<Object>} Health check result
     */
    async performExecHealthCheck(service) {
        const { exec } = require('child_process');
        const command = service.healthCheck?.command;

        if (!command) {
            throw new Error('Exec health check requires a command');
        }

        return new Promise((resolve) => {
            exec(command, { timeout: service.healthCheck?.timeout || 5000 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        details: { error: error.message, stderr }
                    });
                } else {
                    resolve({
                        success: true,
                        details: { stdout, stderr }
                    });
                }
            });
        });
    }

    /**
     * Performs gRPC health check
     * @async
     * @private
     * @param {Object} service - Service configuration
     * @returns {Promise<Object>} Health check result
     */
    async performGrpcHealthCheck(service) {
        // In a real implementation, this would use the gRPC health checking protocol
        // For now, we'll simulate it
        return {
            success: true,
            details: {
                service: service.name,
                status: 'SERVING'
            }
        };
    }

    /**
     * Checks system health (CPU, memory, disk)
     * @async
     * @private
     * @returns {Promise<Object>} System health status
     */
    async checkSystemHealth() {
        const cpuUsage = await this.getCpuUsage();
        const memoryUsage = this.getMemoryUsage();
        const diskUsage = await this.getDiskUsage();
        const networkStats = this.getNetworkStats();
        const processHealth = this.getProcessHealth();

        const details = {
            cpu: {
                usage: cpuUsage,
                status: this.getStatusByThreshold(cpuUsage, this.thresholds.cpu),
                cores: os.cpus().length
            },
            memory: {
                usage: memoryUsage.percentage,
                status: this.getStatusByThreshold(memoryUsage.percentage, this.thresholds.memory),
                used: memoryUsage.used,
                total: memoryUsage.total,
                free: memoryUsage.free
            },
            disk: {
                usage: diskUsage.percentage,
                status: this.getStatusByThreshold(diskUsage.percentage, this.thresholds.disk),
                used: diskUsage.used,
                total: diskUsage.total,
                free: diskUsage.free
            },
            network: networkStats,
            process: processHealth,
            uptime: os.uptime(),
            loadAverage: os.loadavg(),
            platform: os.platform(),
            hostname: os.hostname()
        };

        // Calculate overall system health
        const statuses = [
            details.cpu.status,
            details.memory.status,
            details.disk.status
        ];

        let status = 'healthy';
        if (statuses.includes('critical')) {
            status = 'critical';
        } else if (statuses.includes('warning')) {
            status = 'warning';
        }

        return {
            status,
            details,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Gets CPU usage percentage
     * @async
     * @private
     * @returns {Promise<number>} CPU usage percentage
     */
    async getCpuUsage() {
        return new Promise((resolve) => {
            const startMeasure = this.cpuAverage();

            setTimeout(() => {
                const endMeasure = this.cpuAverage();
                const idleDiff = endMeasure.idle - startMeasure.idle;
                const totalDiff = endMeasure.total - startMeasure.total;
                const percentageCpu = 100 - ~~(100 * idleDiff / totalDiff);
                resolve(percentageCpu);
            }, 100);
        });
    }

    /**
     * Calculates CPU average
     * @private
     * @returns {Object} CPU timing averages
     */
    cpuAverage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        return {
            idle: totalIdle / cpus.length,
            total: totalTick / cpus.length
        };
    }

    /**
     * Gets memory usage information
     * @private
     * @returns {Object} Memory usage details
     */
    getMemoryUsage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const percentage = (usedMemory / totalMemory) * 100;

        // Also get process memory usage
        const processMemory = process.memoryUsage();

        return {
            percentage: Math.round(percentage * 100) / 100,
            total: totalMemory,
            free: freeMemory,
            used: usedMemory,
            process: {
                rss: processMemory.rss,
                heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed,
                external: processMemory.external,
                arrayBuffers: processMemory.arrayBuffers
            }
        };
    }

    /**
     * Gets disk usage information
     * @async
     * @private
     * @returns {Promise<Object>} Disk usage details
     */
    async getDiskUsage() {
        // This is a simplified implementation
        // In production, you'd use a library like diskusage or node-disk-info
        try {
            const { statfs } = require('fs').promises;
            const stats = await statfs('/');

            const total = stats.blocks * stats.bsize;
            const free = stats.bavail * stats.bsize;
            const used = total - free;
            const percentage = (used / total) * 100;

            return {
                percentage: Math.round(percentage * 100) / 100,
                total,
                free,
                used
            };
        } catch (error) {
            // Fallback for systems without statfs
            return {
                percentage: 0,
                total: 0,
                free: 0,
                used: 0,
                error: 'Disk usage not available'
            };
        }
    }

    /**
     * Gets network statistics
     * @private
     * @returns {Object} Network statistics
     */
    getNetworkStats() {
        const interfaces = os.networkInterfaces();
        const stats = {
            interfaces: {},
            totalInterfaces: 0,
            activeInterfaces: 0
        };

        for (const [name, addresses] of Object.entries(interfaces)) {
            stats.totalInterfaces++;
            const activeAddresses = addresses.filter(addr => !addr.internal);

            if (activeAddresses.length > 0) {
                stats.activeInterfaces++;
                stats.interfaces[name] = activeAddresses.map(addr => ({
                    family: addr.family,
                    address: addr.address,
                    netmask: addr.netmask
                }));
            }
        }

        return stats;
    }

    /**
     * Gets process health information
     * @private
     * @returns {Object} Process health details
     */
    getProcessHealth() {
        return {
            pid: process.pid,
            ppid: process.ppid,
            uptime: process.uptime(),
            version: process.version,
            execPath: process.execPath,
            cwd: process.cwd(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            resourceUsage: process.resourceUsage ? process.resourceUsage() : null
        };
    }

    /**
     * Checks dependencies health
     * @async
     * @private
     * @returns {Promise<Object>} Dependencies health status
     */
    async checkDependenciesHealth() {
        const results = {
            healthy: 0,
            unhealthy: 0,
            dependencies: {}
        };

        for (const [name, dependency] of this.dependencies) {
            try {
                const health = await dependency.check();
                results.dependencies[name] = health;

                if (health.status === 'healthy') {
                    results.healthy++;
                } else {
                    results.unhealthy++;
                }
            } catch (error) {
                console.error(`Dependency check failed for ${name}:`, error);
                results.dependencies[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
                results.unhealthy++;
            }
        }

        const status = results.unhealthy > 0 ?
            (results.healthy === 0 ? 'unhealthy' : 'degraded') :
            'healthy';

        return {
            status,
            details: results,
            totalDependencies: this.dependencies.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Registers default dependencies
     * @private
     */
    registerDefaultDependencies() {
        // Redis dependency
        this.registerDependency('redis', {
            check: async () => {
                if (!this.config.dependencies?.redis) {
                    return { status: 'skipped', message: 'Redis not configured' };
                }

                try {
                    // Check Redis connection
                    // This would use the actual Redis client in production
                    return { status: 'healthy', message: 'Redis is accessible' };
                } catch (error) {
                    return { status: 'unhealthy', error: error.message };
                }
            }
        });

        // Database dependency
        this.registerDependency('database', {
            check: async () => {
                if (!this.config.dependencies?.database) {
                    return { status: 'skipped', message: 'Database not configured' };
                }

                try {
                    // Check database connection
                    // This would use the actual database client in production
                    return { status: 'healthy', message: 'Database is accessible' };
                } catch (error) {
                    return { status: 'unhealthy', error: error.message };
                }
            }
        });

        // External API dependency
        this.registerDependency('external-api', {
            check: async () => {
                if (!this.config.dependencies?.externalApi) {
                    return { status: 'skipped', message: 'External API not configured' };
                }

                try {
                    const response = await axios.get(this.config.dependencies.externalApi.url, {
                        timeout: 5000
                    });

                    return {
                        status: 'healthy',
                        message: 'External API is accessible',
                        responseTime: response.headers['x-response-time']
                    };
                } catch (error) {
                    return { status: 'unhealthy', error: error.message };
                }
            }
        });
    }

    /**
     * Registers a custom dependency
     * @param {string} name - Dependency name
     * @param {Object} dependency - Dependency configuration with check function
     */
    registerDependency(name, dependency) {
        if (!dependency.check || typeof dependency.check !== 'function') {
            throw new Error('Dependency must have a check function');
        }

        this.dependencies.set(name, dependency);
        console.log(`Dependency registered: ${name}`);
    }

    /**
     * Checks custom health checks
     * @async
     * @private
     * @returns {Promise<Object>} Custom health check results
     */
    async checkCustomHealth() {
        if (this.customChecks.size === 0) {
            return {
                status: 'healthy',
                details: {},
                message: 'No custom checks configured'
            };
        }

        const results = {
            passed: 0,
            failed: 0,
            checks: {}
        };

        for (const [name, check] of this.customChecks) {
            try {
                const result = await check();
                results.checks[name] = result;

                if (result.passed) {
                    results.passed++;
                } else {
                    results.failed++;
                }
            } catch (error) {
                console.error(`Custom check failed for ${name}:`, error);
                results.checks[name] = {
                    passed: false,
                    error: error.message
                };
                results.failed++;
            }
        }

        const status = results.failed > 0 ?
            (results.passed === 0 ? 'unhealthy' : 'degraded') :
            'healthy';

        return {
            status,
            details: results,
            totalChecks: this.customChecks.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Registers a custom health check
     * @param {string} name - Check name
     * @param {Function} checkFn - Check function that returns {passed: boolean, ...}
     */
    registerCustomCheck(name, checkFn) {
        if (typeof checkFn !== 'function') {
            throw new Error('Check must be a function');
        }

        this.customChecks.set(name, checkFn);
        console.log(`Custom health check registered: ${name}`);
    }

    /**
     * Processes health check result from Promise.allSettled
     * @private
     * @param {Object} result - Promise result
     * @returns {Object} Processed health result
     */
    processHealthResult(result) {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            return {
                status: 'error',
                error: result.reason?.message || 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Calculates overall health status
     * @private
     * @returns {string} Overall status
     */
    calculateOverallStatus() {
        const checks = Object.values(this.healthStatus.checks);
        const statuses = checks.map(check => check.status);

        if (statuses.includes('critical') || statuses.includes('error')) {
            return 'unhealthy';
        } else if (statuses.includes('unhealthy')) {
            return 'degraded';
        } else if (statuses.includes('warning') || statuses.includes('degraded')) {
            return 'degraded';
        } else if (statuses.every(status => status === 'healthy')) {
            return 'healthy';
        } else {
            return 'unknown';
        }
    }

    /**
     * Gets status by threshold comparison
     * @private
     * @param {number} value - Current value
     * @param {Object} threshold - Threshold configuration
     * @returns {string} Status based on threshold
     */
    getStatusByThreshold(value, threshold) {
        if (value >= threshold.critical) {
            return 'critical';
        } else if (value >= threshold.warning) {
            return 'warning';
        } else {
            return 'healthy';
        }
    }

    /**
     * Updates health metrics
     * @private
     * @param {number} checkDuration - Duration of health check in ms
     */
    updateHealthMetrics(checkDuration) {
        this.healthStatus.metrics.totalChecks++;

        if (this.healthStatus.status === 'unhealthy' || this.healthStatus.status === 'error') {
            this.healthStatus.metrics.failedChecks++;
        }

        this.healthStatus.metrics.successRate =
            ((this.healthStatus.metrics.totalChecks - this.healthStatus.metrics.failedChecks) /
                this.healthStatus.metrics.totalChecks) * 100;

        // Update average response time
        const currentAvg = this.healthStatus.metrics.averageResponseTime;
        const totalChecks = this.healthStatus.metrics.totalChecks;
        this.healthStatus.metrics.averageResponseTime =
            (currentAvg * (totalChecks - 1) + checkDuration) / totalChecks;
    }

    /**
     * Adds health status to history
     * @private
     * @param {Object} status - Health status to add
     */
    addToHistory(status) {
        this.healthHistory.push({
            ...status,
            timestamp: new Date().toISOString()
        });

        // Trim history if needed
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }
    }

    /**
     * Checks for health status changes and emits events
     * @private
     */
    checkForStatusChanges() {
        if (this.healthHistory.length < 2) {
            return;
        }

        const current = this.healthHistory[this.healthHistory.length - 1];
        const previous = this.healthHistory[this.healthHistory.length - 2];

        if (current.status !== previous.status) {
            this.emit('health:status-changed', {
                from: previous.status,
                to: current.status,
                timestamp: new Date().toISOString()
            });

            // Emit specific events for status changes
            if (current.status === 'healthy' && previous.status !== 'healthy') {
                this.emit('health:recovered', current);
            } else if (current.status === 'unhealthy' && previous.status !== 'unhealthy') {
                this.emit('health:degraded', current);
            }
        }
    }

    /**
     * Starts resource monitoring
     * @private
     */
    startResourceMonitoring() {
        // Monitor CPU and memory every 30 seconds
        this.resourceMonitorInterval = setInterval(() => {
            const memoryUsage = this.getMemoryUsage();

            // Check for resource alerts
            if (memoryUsage.percentage > this.thresholds.memory.critical) {
                this.emit('resource:critical', {
                    type: 'memory',
                    usage: memoryUsage.percentage,
                    threshold: this.thresholds.memory.critical
                });
            } else if (memoryUsage.percentage > this.thresholds.memory.warning) {
                this.emit('resource:warning', {
                    type: 'memory',
                    usage: memoryUsage.percentage,
                    threshold: this.thresholds.memory.warning
                });
            }
        }, 30000);
    }

    /**
     * Stops resource monitoring
     * @private
     */
    stopResourceMonitoring() {
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
            this.resourceMonitorInterval = null;
        }
    }

    /**
     * Registers signal handlers for health status updates
     * @private
     */
    registerSignalHandlers() {
        process.on('SIGTERM', () => {
            this.healthStatus.status = 'terminating';
            this.emit('health:terminating');
        });

        process.on('uncaughtException', (error) => {
            console.error('Uncaught exception in health monitor:', error);
            this.healthStatus.status = 'error';
            this.healthStatus.error = error.message;
        });
    }

    /**
     * Handles Kubernetes liveness probe
     * @returns {Object} Liveness probe response
     */
    handleLivenessProbe() {
        const isAlive = this.isRunning && this.healthStatus.status !== 'error';

        return {
            status: isAlive ? 'ok' : 'error',
            timestamp: new Date().toISOString(),
            uptime: this.healthStatus.uptime
        };
    }

    /**
     * Handles Kubernetes readiness probe
     * @returns {Object} Readiness probe response
     */
    handleReadinessProbe() {
        const isReady = this.isRunning &&
            (this.healthStatus.status === 'healthy' ||
                this.healthStatus.status === 'degraded');

        return {
            status: isReady ? 'ok' : 'not_ready',
            checks: this.healthStatus.checks,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Handles Kubernetes startup probe
     * @returns {Object} Startup probe response
     */
    handleStartupProbe() {
        const startupTime = 60000; // 1 minute startup grace period
        const isStarted = this.isRunning &&
            (Date.now() - this.startTime) > startupTime;

        return {
            status: isStarted ? 'started' : 'starting',
            startTime: this.startTime,
            uptime: Date.now() - this.startTime,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Gets system health status
     * @returns {Object} Current health status
     */
    getSystemHealth() {
        return { ...this.healthStatus };
    }

    /**
     * Gets health history
     * @param {number} limit - Number of history entries to return
     * @returns {Array} Health history entries
     */
    getHealthHistory(limit = 10) {
        const start = Math.max(0, this.healthHistory.length - limit);
        return this.healthHistory.slice(start);
    }

    /**
     * Gets component health status
     * @param {string} componentName - Component name
     * @returns {Object|null} Component health status
     */
    getComponentHealth(componentName) {
        return this.componentHealth.get(componentName) || null;
    }

    /**
     * Sets component health status
     * @param {string} componentName - Component name
     * @param {Object} health - Health status
     */
    setComponentHealth(componentName, health) {
        this.componentHealth.set(componentName, {
            ...health,
            timestamp: new Date().toISOString()
        });

        this.emit('component:health-updated', {
            component: componentName,
            health
        });
    }

    /**
     * Exports health metrics for Prometheus
     * @returns {string} Prometheus formatted metrics
     */
    exportPrometheusMetrics() {
        const metrics = [];

        // Overall health status
        metrics.push(`# HELP gateway_health_status Gateway health status (1=healthy, 0=unhealthy)`);
        metrics.push(`# TYPE gateway_health_status gauge`);
        metrics.push(`gateway_health_status ${this.healthStatus.status === 'healthy' ? 1 : 0}`);

        // Service health
        if (this.healthStatus.checks.services?.details?.services) {
            metrics.push(`# HELP gateway_service_health Service health status`);
            metrics.push(`# TYPE gateway_service_health gauge`);

            for (const [name, health] of Object.entries(this.healthStatus.checks.services.details.services)) {
                const value = health.status === 'healthy' ? 1 : 0;
                metrics.push(`gateway_service_health{service="${name}"} ${value}`);
            }
        }

        // System metrics
        if (this.healthStatus.checks.system?.details) {
            const system = this.healthStatus.checks.system.details;

            metrics.push(`# HELP gateway_cpu_usage CPU usage percentage`);
            metrics.push(`# TYPE gateway_cpu_usage gauge`);
            metrics.push(`gateway_cpu_usage ${system.cpu?.usage || 0}`);

            metrics.push(`# HELP gateway_memory_usage Memory usage percentage`);
            metrics.push(`# TYPE gateway_memory_usage gauge`);
            metrics.push(`gateway_memory_usage ${system.memory?.usage || 0}`);

            metrics.push(`# HELP gateway_disk_usage Disk usage percentage`);
            metrics.push(`# TYPE gateway_disk_usage gauge`);
            metrics.push(`gateway_disk_usage ${system.disk?.usage || 0}`);
        }

        // Health check metrics
        metrics.push(`# HELP gateway_health_checks_total Total health checks performed`);
        metrics.push(`# TYPE gateway_health_checks_total counter`);
        metrics.push(`gateway_health_checks_total ${this.healthStatus.metrics.totalChecks}`);

        metrics.push(`# HELP gateway_health_checks_failed_total Failed health checks`);
        metrics.push(`# TYPE gateway_health_checks_failed_total counter`);
        metrics.push(`gateway_health_checks_failed_total ${this.healthStatus.metrics.failedChecks}`);

        metrics.push(`# HELP gateway_health_check_duration_ms Average health check duration`);
        metrics.push(`# TYPE gateway_health_check_duration_ms gauge`);
        metrics.push(`gateway_health_check_duration_ms ${this.healthStatus.metrics.averageResponseTime}`);

        return metrics.join('\n');
    }
}

module.exports = { HealthMonitor };