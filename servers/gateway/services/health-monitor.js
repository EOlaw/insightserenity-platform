/**
 * Health Monitor
 * Monitors the health of gateway and backend services
 */

const EventEmitter = require('events');

/**
 * Health Monitor Class
 */
class HealthMonitor extends EventEmitter {
    constructor(serviceRegistry, config) {
        super();
        this.serviceRegistry = serviceRegistry;
        this.config = config;
        this.healthChecks = new Map();
        this.healthStatus = new Map();
        this.checkInterval = null;
        this.isRunning = false;
        this.startTime = Date.now();
    }

    /**
     * Start health monitoring
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        console.info('Starting Health Monitor');
        this.isRunning = true;
        
        // Register default health checks
        this.registerDefaultChecks();
        
        // Perform initial health check
        await this.performHealthCheck();
        
        // Start periodic health checks
        this.checkInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.interval || 30000);
        
        console.info('Health Monitor started');
    }

    /**
     * Register default health checks
     */
    registerDefaultChecks() {
        // Gateway health check
        this.registerCheck('gateway', async () => {
            return {
                status: 'healthy',
                uptime: this.getUptime(),
                memory: this.getMemoryUsage(),
                cpu: await this.getCpuUsage(),
                timestamp: new Date().toISOString()
            };
        });

        // Service registry health check
        this.registerCheck('service-registry', async () => {
            const services = this.serviceRegistry.getAllServices();
            const totalServices = Object.keys(services).length;
            const healthyServices = Object.values(services).filter(s => 
                s.instances.some(i => i.healthy)
            ).length;

            return {
                status: healthyServices > 0 ? 'healthy' : 'unhealthy',
                totalServices,
                healthyServices,
                services: services
            };
        });

        // Database connectivity check (if configured)
        this.registerCheck('database', async () => {
            // This would check database connectivity
            return {
                status: 'healthy',
                responseTime: 5
            };
        });

        // Cache connectivity check
        this.registerCheck('cache', async () => {
            // This would check cache connectivity
            return {
                status: 'healthy',
                responseTime: 1
            };
        });
    }

    /**
     * Register a health check
     */
    registerCheck(name, checkFunction) {
        this.healthChecks.set(name, {
            name,
            check: checkFunction,
            lastCheck: null,
            consecutiveFailures: 0,
            enabled: true
        });
    }

    /**
     * Unregister a health check
     */
    unregisterCheck(name) {
        this.healthChecks.delete(name);
        this.healthStatus.delete(name);
    }

    /**
     * Perform health check
     */
    async performHealthCheck() {
        const results = new Map();
        const promises = [];

        for (const [name, healthCheck] of this.healthChecks) {
            if (!healthCheck.enabled) {
                continue;
            }

            promises.push(
                this.executeCheck(name, healthCheck)
                    .then(result => results.set(name, result))
            );
        }

        await Promise.allSettled(promises);

        // Update health status
        for (const [name, result] of results) {
            this.updateHealthStatus(name, result);
        }

        // Emit health status update
        this.emit('health-update', this.getOverallHealth());

        return this.getOverallHealth();
    }

    /**
     * Execute individual health check
     */
    async executeCheck(name, healthCheck) {
        const startTime = Date.now();
        
        try {
            const timeout = this.config.timeout || 5000;
            const result = await this.withTimeout(healthCheck.check(), timeout);
            
            const duration = Date.now() - startTime;
            healthCheck.lastCheck = new Date();
            healthCheck.consecutiveFailures = 0;

            return {
                name,
                status: result.status || 'healthy',
                duration,
                details: result,
                lastCheck: healthCheck.lastCheck,
                error: null
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            healthCheck.lastCheck = new Date();
            healthCheck.consecutiveFailures++;

            const status = healthCheck.consecutiveFailures >= (this.config.unhealthyThreshold || 2) 
                ? 'unhealthy' 
                : 'degraded';

            return {
                name,
                status,
                duration,
                details: null,
                lastCheck: healthCheck.lastCheck,
                error: error.message,
                consecutiveFailures: healthCheck.consecutiveFailures
            };
        }
    }

    /**
     * Execute with timeout
     */
    withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Health check timeout')), timeout)
            )
        ]);
    }

    /**
     * Update health status
     */
    updateHealthStatus(name, result) {
        const previousStatus = this.healthStatus.get(name);
        this.healthStatus.set(name, result);

        // Check for status change
        if (previousStatus && previousStatus.status !== result.status) {
            this.emit('health-change', {
                check: name,
                previousStatus: previousStatus.status,
                currentStatus: result.status,
                details: result
            });

            console.info(`Health check status changed: ${name} - ${previousStatus.status} -> ${result.status}`);
        }
    }

    /**
     * Get overall health status
     */
    getOverallHealth() {
        const checks = Array.from(this.healthStatus.values());
        
        if (checks.length === 0) {
            return {
                status: 'unknown',
                checks: {},
                timestamp: new Date().toISOString()
            };
        }

        // Determine overall status
        let overallStatus = 'healthy';
        const unhealthyChecks = checks.filter(c => c.status === 'unhealthy');
        const degradedChecks = checks.filter(c => c.status === 'degraded');

        if (unhealthyChecks.length > 0) {
            overallStatus = 'unhealthy';
        } else if (degradedChecks.length > 0) {
            overallStatus = 'degraded';
        }

        // Build response
        const response = {
            status: overallStatus,
            uptime: this.getUptime(),
            timestamp: new Date().toISOString(),
            checks: {}
        };

        for (const check of checks) {
            response.checks[check.name] = {
                status: check.status,
                duration: check.duration,
                lastCheck: check.lastCheck,
                error: check.error,
                details: check.details
            };
        }

        return response;
    }

    /**
     * Get health status for specific check
     */
    getCheckHealth(name) {
        return this.healthStatus.get(name);
    }

    /**
     * Get service health
     */
    async getServiceHealth(serviceName) {
        const service = this.serviceRegistry.getService(serviceName);
        if (!service) {
            return {
                status: 'unknown',
                message: 'Service not found'
            };
        }

        const healthyInstances = service.instances.filter(i => i.healthy);
        const totalInstances = service.instances.length;

        return {
            status: healthyInstances.length > 0 ? 'healthy' : 'unhealthy',
            healthyInstances: healthyInstances.length,
            totalInstances: totalInstances,
            instances: service.instances.map(i => ({
                id: i.id,
                url: i.url,
                healthy: i.healthy,
                lastHealthCheck: i.lastHealthCheck
            }))
        };
    }

    /**
     * Get readiness status
     */
    getReadiness() {
        const health = this.getOverallHealth();
        
        return {
            ready: health.status !== 'unhealthy',
            status: health.status,
            checks: Object.keys(health.checks).reduce((acc, key) => {
                acc[key] = health.checks[key].status;
                return acc;
            }, {})
        };
    }

    /**
     * Get liveness status
     */
    getLiveness() {
        return {
            alive: true,
            uptime: this.getUptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get metrics
     */
    getMetrics() {
        const checks = Array.from(this.healthStatus.values());
        
        return {
            totalChecks: checks.length,
            healthyChecks: checks.filter(c => c.status === 'healthy').length,
            unhealthyChecks: checks.filter(c => c.status === 'unhealthy').length,
            degradedChecks: checks.filter(c => c.status === 'degraded').length,
            averageCheckDuration: checks.reduce((sum, c) => sum + (c.duration || 0), 0) / checks.length || 0,
            uptime: this.getUptime()
        };
    }

    /**
     * Get uptime in seconds
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    /**
     * Get memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024)
        };
    }

    /**
     * Get CPU usage
     */
    async getCpuUsage() {
        const startUsage = process.cpuUsage();
        const startTime = Date.now();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const endUsage = process.cpuUsage(startUsage);
        const endTime = Date.now();
        
        const userPercent = (endUsage.user / 1000 / (endTime - startTime)) * 100;
        const systemPercent = (endUsage.system / 1000 / (endTime - startTime)) * 100;
        
        return {
            user: Math.round(userPercent * 100) / 100,
            system: Math.round(systemPercent * 100) / 100,
            total: Math.round((userPercent + systemPercent) * 100) / 100
        };
    }

    /**
     * Enable a health check
     */
    enableCheck(name) {
        const check = this.healthChecks.get(name);
        if (check) {
            check.enabled = true;
        }
    }

    /**
     * Disable a health check
     */
    disableCheck(name) {
        const check = this.healthChecks.get(name);
        if (check) {
            check.enabled = false;
        }
    }

    /**
     * Force health check
     */
    async forceCheck(name = null) {
        if (name) {
            const healthCheck = this.healthChecks.get(name);
            if (healthCheck) {
                const result = await this.executeCheck(name, healthCheck);
                this.updateHealthStatus(name, result);
                return result;
            }
            return null;
        }
        
        return await this.performHealthCheck();
    }

    /**
     * Stop health monitoring
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.info('Stopping Health Monitor');
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        this.isRunning = false;
        this.healthChecks.clear();
        this.healthStatus.clear();
        this.removeAllListeners();
        
        console.info('Health Monitor stopped');
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await this.stop();
    }
}

module.exports = { HealthMonitor };