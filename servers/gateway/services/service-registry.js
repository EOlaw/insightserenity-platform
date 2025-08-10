/**
 * Service Registry
 * Manages service discovery and registration
 */

const axios = require('axios');
const Consul = require('consul');
const { Etcd3 } = require('etcd3');
const EventEmitter = require('events');

/**
 * Service Registry Class
 */
class ServiceRegistry extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.services = new Map();
        this.discoveryClient = null;
        this.refreshInterval = null;
        this.healthCheckers = new Map();
    }

    /**
     * Initialize service registry
     */
    async initialize() {
        // Load static services from configuration
        await this.loadStaticServices();

        // Initialize service discovery if enabled
        if (this.config.discovery?.enabled) {
            await this.initializeDiscovery();
        }

        // Start service refresh
        this.startServiceRefresh();
    }

    /**
     * Load static services from configuration
     */
    async loadStaticServices() {
        // Admin Server
        if (this.config.adminServer) {
            this.registerService('admin-server', {
                name: 'admin-server',
                instances: [{
                    id: 'admin-server-1',
                    url: this.config.adminServer.url,
                    host: this.parseHost(this.config.adminServer.url),
                    port: this.parsePort(this.config.adminServer.url),
                    weight: this.config.adminServer.weight || 1,
                    healthy: true,
                    metadata: {
                        version: '1.0.0',
                        region: 'default'
                    }
                }],
                healthPath: this.config.adminServer.healthPath || '/health',
                timeout: this.config.adminServer.timeout || 30000,
                retries: this.config.adminServer.retries || 3
            });
        }

        // Customer Services
        if (this.config.customerServices) {
            this.registerService('customer-services', {
                name: 'customer-services',
                instances: [{
                    id: 'customer-services-1',
                    url: this.config.customerServices.url,
                    host: this.parseHost(this.config.customerServices.url),
                    port: this.parsePort(this.config.customerServices.url),
                    weight: this.config.customerServices.weight || 1,
                    healthy: true,
                    metadata: {
                        version: '1.0.0',
                        region: 'default'
                    }
                }],
                healthPath: this.config.customerServices.healthPath || '/health',
                timeout: this.config.customerServices.timeout || 30000,
                retries: this.config.customerServices.retries || 3
            });
        }
    }

    /**
     * Initialize service discovery
     */
    async initializeDiscovery() {
        const discoveryConfig = this.config.discovery;
        
        switch (discoveryConfig.type) {
            case 'consul':
                await this.initializeConsul();
                break;
            case 'etcd':
                await this.initializeEtcd();
                break;
            case 'static':
            default:
                // Static discovery, no initialization needed
                break;
        }
    }

    /**
     * Initialize Consul discovery
     */
    async initializeConsul() {
        const consulConfig = this.config.discovery.consul;
        
        this.discoveryClient = new Consul({
            host: consulConfig.host || 'localhost',
            port: consulConfig.port || 8500,
            secure: consulConfig.secure || false,
            promisify: true
        });

        // Watch for service changes
        await this.watchConsulServices();
    }

    /**
     * Initialize etcd discovery
     */
    async initializeEtcd() {
        const etcdConfig = this.config.discovery.etcd;
        
        this.discoveryClient = new Etcd3({
            hosts: etcdConfig.hosts || ['localhost:2379'],
            credentials: etcdConfig.credentials
        });

        // Watch for service changes
        await this.watchEtcdServices();
    }

    /**
     * Watch Consul services
     */
    async watchConsulServices() {
        if (!this.discoveryClient) return;

        try {
            // Get all services
            const services = await this.discoveryClient.catalog.service.list();
            
            for (const [serviceName, tags] of Object.entries(services)) {
                // Get service instances
                const instances = await this.discoveryClient.health.service(serviceName);
                
                const healthyInstances = instances
                    .filter(inst => inst.Checks.every(check => check.Status === 'passing'))
                    .map(inst => ({
                        id: inst.Service.ID,
                        url: `http://${inst.Service.Address}:${inst.Service.Port}`,
                        host: inst.Service.Address,
                        port: inst.Service.Port,
                        weight: inst.Service.Weights?.Passing || 1,
                        healthy: true,
                        metadata: inst.Service.Meta || {},
                        tags: inst.Service.Tags || []
                    }));

                if (healthyInstances.length > 0) {
                    this.registerService(serviceName, {
                        name: serviceName,
                        instances: healthyInstances,
                        tags: tags
                    });
                }
            }

            this.emit('services-updated', this.getAllServices());
        } catch (error) {
            console.error('Error watching Consul services:', error);
        }
    }

    /**
     * Watch etcd services
     */
    async watchEtcdServices() {
        if (!this.discoveryClient) return;

        try {
            const watcher = await this.discoveryClient.watch()
                .prefix('/services/')
                .create();

            watcher.on('put', async (res) => {
                const serviceName = res.key.toString().split('/').pop();
                const serviceData = JSON.parse(res.value.toString());
                
                this.registerService(serviceName, serviceData);
                this.emit('service-added', serviceName, serviceData);
            });

            watcher.on('delete', async (res) => {
                const serviceName = res.key.toString().split('/').pop();
                this.deregisterService(serviceName);
                this.emit('service-removed', serviceName);
            });

            // Load existing services
            const services = await this.discoveryClient.getAll()
                .prefix('/services/')
                .strings();

            for (const [key, value] of Object.entries(services)) {
                const serviceName = key.split('/').pop();
                const serviceData = JSON.parse(value);
                this.registerService(serviceName, serviceData);
            }

            this.emit('services-updated', this.getAllServices());
        } catch (error) {
            console.error('Error watching etcd services:', error);
        }
    }

    /**
     * Register a service
     */
    registerService(name, serviceData) {
        const service = {
            name: name,
            instances: serviceData.instances || [],
            healthPath: serviceData.healthPath || '/health',
            timeout: serviceData.timeout || 30000,
            retries: serviceData.retries || 3,
            metadata: serviceData.metadata || {},
            tags: serviceData.tags || [],
            lastUpdated: new Date()
        };

        this.services.set(name, service);
        
        // Setup health checker for service
        this.setupHealthChecker(name, service);
        
        console.info(`Service registered: ${name} with ${service.instances.length} instances`);
        return service;
    }

    /**
     * Deregister a service
     */
    deregisterService(name) {
        // Stop health checker
        const healthChecker = this.healthCheckers.get(name);
        if (healthChecker) {
            clearInterval(healthChecker);
            this.healthCheckers.delete(name);
        }

        // Remove service
        const removed = this.services.delete(name);
        
        if (removed) {
            console.info(`Service deregistered: ${name}`);
        }
        
        return removed;
    }

    /**
     * Get a service
     */
    getService(name) {
        return this.services.get(name);
    }

    /**
     * Get all services
     */
    getAllServices() {
        const services = {};
        for (const [name, service] of this.services) {
            services[name] = {
                ...service,
                healthyInstances: service.instances.filter(i => i.healthy).length,
                totalInstances: service.instances.length
            };
        }
        return services;
    }

    /**
     * Get healthy instances for a service
     */
    getHealthyInstances(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) {
            return [];
        }
        return service.instances.filter(instance => instance.healthy);
    }

    /**
     * Get all instances for a service
     */
    getAllInstances(serviceName) {
        const service = this.services.get(serviceName);
        return service ? service.instances : [];
    }

    /**
     * Setup health checker for service
     */
    setupHealthChecker(name, service) {
        // Clear existing health checker
        const existingChecker = this.healthCheckers.get(name);
        if (existingChecker) {
            clearInterval(existingChecker);
        }

        // Create new health checker
        const checker = setInterval(async () => {
            await this.checkServiceHealth(name, service);
        }, 30000); // Check every 30 seconds

        this.healthCheckers.set(name, checker);

        // Perform initial health check
        this.checkServiceHealth(name, service);
    }

    /**
     * Check service health
     */
    async checkServiceHealth(name, service) {
        for (const instance of service.instances) {
            try {
                const healthUrl = `${instance.url}${service.healthPath}`;
                const response = await axios.get(healthUrl, {
                    timeout: 5000,
                    validateStatus: (status) => status === 200
                });

                const wasHealthy = instance.healthy;
                instance.healthy = response.status === 200;
                instance.lastHealthCheck = new Date();
                instance.healthData = response.data;

                if (wasHealthy !== instance.healthy) {
                    this.emit('instance-health-changed', name, instance.id, instance.healthy);
                    console.info(`Instance health changed: ${name}/${instance.id} - ${instance.healthy ? 'UP' : 'DOWN'}`);
                }
            } catch (error) {
                const wasHealthy = instance.healthy;
                instance.healthy = false;
                instance.lastHealthCheck = new Date();
                instance.healthError = error.message;

                if (wasHealthy !== instance.healthy) {
                    this.emit('instance-health-changed', name, instance.id, instance.healthy);
                    console.warn(`Instance health check failed: ${name}/${instance.id} - ${error.message}`);
                }
            }
        }
    }

    /**
     * Start service refresh
     */
    startServiceRefresh() {
        const refreshInterval = this.config.discovery?.refreshInterval || 30000;
        
        this.refreshInterval = setInterval(async () => {
            await this.refreshServices();
        }, refreshInterval);
    }

    /**
     * Refresh services
     */
    async refreshServices() {
        if (this.config.discovery?.enabled) {
            switch (this.config.discovery.type) {
                case 'consul':
                    await this.watchConsulServices();
                    break;
                case 'etcd':
                    // etcd uses watchers, no need to refresh
                    break;
            }
        }
    }

    /**
     * Parse host from URL
     */
    parseHost(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname;
        } catch {
            return 'localhost';
        }
    }

    /**
     * Parse port from URL
     */
    parsePort(url) {
        try {
            const parsed = new URL(url);
            return parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
        } catch {
            return 80;
        }
    }

    /**
     * Update instance weight
     */
    updateInstanceWeight(serviceName, instanceId, weight) {
        const service = this.services.get(serviceName);
        if (service) {
            const instance = service.instances.find(i => i.id === instanceId);
            if (instance) {
                instance.weight = weight;
                return true;
            }
        }
        return false;
    }

    /**
     * Mark instance as unhealthy
     */
    markInstanceUnhealthy(serviceName, instanceId) {
        const service = this.services.get(serviceName);
        if (service) {
            const instance = service.instances.find(i => i.id === instanceId);
            if (instance) {
                instance.healthy = false;
                instance.lastHealthCheck = new Date();
                this.emit('instance-health-changed', serviceName, instanceId, false);
                return true;
            }
        }
        return false;
    }

    /**
     * Mark instance as healthy
     */
    markInstanceHealthy(serviceName, instanceId) {
        const service = this.services.get(serviceName);
        if (service) {
            const instance = service.instances.find(i => i.id === instanceId);
            if (instance) {
                instance.healthy = true;
                instance.lastHealthCheck = new Date();
                this.emit('instance-health-changed', serviceName, instanceId, true);
                return true;
            }
        }
        return false;
    }

    /**
     * Get service metrics
     */
    getServiceMetrics() {
        const metrics = {};
        
        for (const [name, service] of this.services) {
            const healthyCount = service.instances.filter(i => i.healthy).length;
            const totalCount = service.instances.length;
            
            metrics[name] = {
                healthy: healthyCount,
                unhealthy: totalCount - healthyCount,
                total: totalCount,
                healthPercentage: totalCount > 0 ? (healthyCount / totalCount) * 100 : 0,
                lastUpdated: service.lastUpdated
            };
        }
        
        return metrics;
    }

    /**
     * Disconnect from service discovery
     */
    async disconnect() {
        // Clear refresh interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // Clear health checkers
        for (const [name, checker] of this.healthCheckers) {
            clearInterval(checker);
        }
        this.healthCheckers.clear();

        // Disconnect from discovery client
        if (this.discoveryClient) {
            if (this.discoveryClient.close) {
                await this.discoveryClient.close();
            }
            this.discoveryClient = null;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await this.disconnect();
        this.services.clear();
        this.removeAllListeners();
    }
}

module.exports = { ServiceRegistry };