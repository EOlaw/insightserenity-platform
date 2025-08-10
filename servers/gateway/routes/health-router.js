/**
 * Health Router
 * Provides health check endpoints for the gateway
 */

const express = require('express');

/**
 * Health Router Class
 */
class HealthRouter {
    constructor(healthMonitor, config) {
        this.healthMonitor = healthMonitor;
        this.config = config;
        this.router = express.Router();
        this.setupRoutes();
    }

    /**
     * Setup health check routes
     */
    setupRoutes() {
        // Main health check endpoint
        this.router.get('/', this.getHealth.bind(this));
        
        // Liveness probe (for Kubernetes)
        this.router.get('/live', this.getLiveness.bind(this));
        this.router.get('/liveness', this.getLiveness.bind(this));
        
        // Readiness probe (for Kubernetes)
        this.router.get('/ready', this.getReadiness.bind(this));
        this.router.get('/readiness', this.getReadiness.bind(this));
        
        // Detailed health check
        this.router.get('/detailed', this.getDetailedHealth.bind(this));
        
        // Service-specific health
        this.router.get('/services', this.getServicesHealth.bind(this));
        this.router.get('/services/:serviceName', this.getServiceHealth.bind(this));
        
        // Component health checks
        this.router.get('/components', this.getComponentsHealth.bind(this));
        this.router.get('/components/:component', this.getComponentHealth.bind(this));
        
        // Dependencies health
        this.router.get('/dependencies', this.getDependenciesHealth.bind(this));
        
        // Startup probe
        this.router.get('/startup', this.getStartup.bind(this));
        
        // Metrics endpoint (simple health metrics)
        this.router.get('/metrics', this.getHealthMetrics.bind(this));
    }

    /**
     * Get overall health status
     */
    async getHealth(req, res) {
        try {
            const health = this.healthMonitor.getOverallHealth();
            const statusCode = health.status === 'healthy' ? 200 : 
                              health.status === 'degraded' ? 200 : 503;
            
            res.status(statusCode).json({
                status: health.status,
                timestamp: health.timestamp,
                uptime: health.uptime
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get liveness status
     */
    async getLiveness(req, res) {
        try {
            const liveness = this.healthMonitor.getLiveness();
            res.status(200).json(liveness);
        } catch (error) {
            res.status(500).json({
                alive: false,
                error: error.message
            });
        }
    }

    /**
     * Get readiness status
     */
    async getReadiness(req, res) {
        try {
            const readiness = this.healthMonitor.getReadiness();
            const statusCode = readiness.ready ? 200 : 503;
            
            res.status(statusCode).json(readiness);
        } catch (error) {
            res.status(503).json({
                ready: false,
                error: error.message
            });
        }
    }

    /**
     * Get detailed health information
     */
    async getDetailedHealth(req, res) {
        try {
            const health = this.healthMonitor.getOverallHealth();
            const statusCode = health.status === 'healthy' ? 200 : 
                              health.status === 'degraded' ? 200 : 503;
            
            // Add additional details
            health.version = process.env.SERVICE_VERSION || '1.0.0';
            health.environment = process.env.NODE_ENV || 'development';
            health.hostname = process.env.HOSTNAME || require('os').hostname();
            health.pid = process.pid;
            health.memory = process.memoryUsage();
            health.cpu = process.cpuUsage();
            
            res.status(statusCode).json(health);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get all services health
     */
    async getServicesHealth(req, res) {
        try {
            const services = this.healthMonitor.serviceRegistry.getAllServices();
            const servicesHealth = {};
            
            for (const [name, service] of Object.entries(services)) {
                const health = await this.healthMonitor.getServiceHealth(name);
                servicesHealth[name] = health;
            }
            
            const allHealthy = Object.values(servicesHealth).every(s => s.status === 'healthy');
            const statusCode = allHealthy ? 200 : 503;
            
            res.status(statusCode).json({
                status: allHealthy ? 'healthy' : 'unhealthy',
                services: servicesHealth
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get specific service health
     */
    async getServiceHealth(req, res) {
        try {
            const { serviceName } = req.params;
            const health = await this.healthMonitor.getServiceHealth(serviceName);
            
            if (health.status === 'unknown') {
                return res.status(404).json(health);
            }
            
            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                service: req.params.serviceName,
                message: error.message
            });
        }
    }

    /**
     * Get components health
     */
    async getComponentsHealth(req, res) {
        try {
            const health = this.healthMonitor.getOverallHealth();
            const components = {};
            
            // Extract component health from checks
            for (const [name, check] of Object.entries(health.checks)) {
                components[name] = {
                    status: check.status,
                    lastCheck: check.lastCheck,
                    duration: check.duration,
                    details: check.details
                };
            }
            
            res.status(200).json({
                status: health.status,
                components: components
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get specific component health
     */
    async getComponentHealth(req, res) {
        try {
            const { component } = req.params;
            const health = this.healthMonitor.getCheckHealth(component);
            
            if (!health) {
                return res.status(404).json({
                    status: 'unknown',
                    component: component,
                    message: 'Component not found'
                });
            }
            
            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                component: req.params.component,
                message: error.message
            });
        }
    }

    /**
     * Get dependencies health
     */
    async getDependenciesHealth(req, res) {
        try {
            const dependencies = {
                database: this.healthMonitor.getCheckHealth('database'),
                cache: this.healthMonitor.getCheckHealth('cache'),
                services: await this.healthMonitor.getServiceHealth('admin-server')
            };
            
            const allHealthy = Object.values(dependencies).every(d => 
                d && (d.status === 'healthy' || d.status === 'degraded')
            );
            
            const statusCode = allHealthy ? 200 : 503;
            
            res.status(statusCode).json({
                status: allHealthy ? 'healthy' : 'unhealthy',
                dependencies: dependencies
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get startup status
     */
    async getStartup(req, res) {
        try {
            const uptime = this.healthMonitor.getUptime();
            const minimumUptime = 10; // 10 seconds
            
            const isReady = uptime >= minimumUptime;
            const statusCode = isReady ? 200 : 503;
            
            res.status(statusCode).json({
                started: isReady,
                uptime: uptime,
                minimumUptime: minimumUptime
            });
        } catch (error) {
            res.status(503).json({
                started: false,
                error: error.message
            });
        }
    }

    /**
     * Get health metrics
     */
    async getHealthMetrics(req, res) {
        try {
            const metrics = this.healthMonitor.getMetrics();
            res.status(200).json(metrics);
        } catch (error) {
            res.status(500).json({
                error: error.message
            });
        }
    }

    /**
     * Get router instance
     */
    getRouter() {
        return this.router;
    }

    /**
     * Initialize router
     */
    async initialize() {
        // Any initialization logic if needed
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Any cleanup logic if needed
    }
}

module.exports = { HealthRouter };