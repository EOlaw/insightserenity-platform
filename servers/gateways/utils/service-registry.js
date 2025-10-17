/**
 * @fileoverview Service Registry Implementation
 * @module servers/gateway/utils/service-registry
 */

const EventEmitter = require('events');
const { getLogger } = require('../../../shared/lib/utils/logger');

/**
 * Service Registry Class
 * @class ServiceRegistry
 * @extends EventEmitter
 */
class ServiceRegistry extends EventEmitter {
    constructor(options = {}) {
        super();

        this.services = new Map();
        this.healthCheckInterval = options.healthCheckInterval || 30000;
        this.healthCheckTimeout = options.healthCheckTimeout || 5000;
        this.logger = getLogger({ serviceName: 'service-registry' });
        this.healthCheckTimer = null;

        // Start health checks
        if (options.enableHealthCheck !== false) {
            this.startHealthChecks();
        }
    }

    /**
     * Register a service
     */
    async registerService(serviceConfig) {
        const service = {
            name: serviceConfig.name,
            url: serviceConfig.url,
            healthCheck: serviceConfig.healthCheck || `${serviceConfig.url}/health`,
            metadata: serviceConfig.metadata || {},
            healthy: true,
            lastCheck: null,
            registeredAt: Date.now()
        };

        this.services.set(service.name, service);

        // Perform initial health check
        await this.checkServiceHealth(service.name);

        this.logger.info('Service registered', {
            name: service.name,
            url: service.url
        });

        this.emit('service:registered', service);

        return service;
    }

    /**
     * Unregister a service
     */
    unregisterService(serviceName) {
        const service = this.services.get(serviceName);

        if (service) {
            this.services.delete(serviceName);

            this.logger.info('Service unregistered', {
                name: serviceName
            });

            this.emit('service:unregistered', service);

            return true;
        }

        return false;
    }

    /**
     * Get service by name
     */
    getService(serviceName) {
        return this.services.get(serviceName);
    }

    /**
     * Get all services
     */
    getServices() {
        return Array.from(this.services.values());
    }

    /**
     * Check service health
     */
    async checkServiceHealth(serviceName) {
        const service = this.services.get(serviceName);

        if (!service) {
            return null;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.healthCheckTimeout);

            const response = await fetch(service.healthCheck, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeout);

            service.healthy = response.ok;
            service.lastCheck = Date.now();
            service.status = response.ok ? 'healthy' : 'unhealthy';

            if (!response.ok) {
                this.logger.warn('Service unhealthy', {
                    name: serviceName,
                    status: response.status
                });
                this.emit('service:unhealthy', service);
            } else {
                this.emit('service:healthy', service);
            }

        } catch (error) {
            service.healthy = false;
            service.lastCheck = Date.now();
            service.status = 'unhealthy';
            service.error = error.message;

            this.logger.error('Service health check failed', {
                name: serviceName,
                error: error.message
            });

            this.emit('service:unhealthy', service);
        }

        return service.healthy;
    }

    /**
     * Check all services
     */
    async checkAllServices() {
        const checks = Array.from(this.services.keys()).map(name =>
            this.checkServiceHealth(name)
        );

        await Promise.allSettled(checks);

        return this.getServices();
    }

    /**
     * Start health checks
     */
    startHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(() => {
            this.checkAllServices();
        }, this.healthCheckInterval);

        // Perform initial check
        this.checkAllServices();
    }

    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Get healthy services
     */
    getHealthyServices(serviceName = null) {
        if (serviceName) {
            const service = this.services.get(serviceName);
            return service && service.healthy ? [service] : [];
        }

        return Array.from(this.services.values()).filter(s => s.healthy);
    }

    /**
     * Discover services (placeholder for service discovery)
     */
    async discoverServices() {
        // This could integrate with Consul, Etcd, or other service discovery tools
        this.logger.info('Service discovery not implemented');
        return [];
    }

    /**
     * Close registry
     */
    async close() {
        this.stopHealthChecks();
        this.services.clear();
        this.removeAllListeners();
    }
}

module.exports = { ServiceRegistry };
