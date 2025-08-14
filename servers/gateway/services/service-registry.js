'use strict';

/**
 * @fileoverview Service Registry - Service discovery and registration management
 * @module servers/gateway/services/service-registry
 * @requires events
 * @requires axios
 */

const { EventEmitter } = require('events');
const axios = require('axios');

/**
 * ServiceRegistry class manages service discovery, registration, and health monitoring.
 * It maintains a registry of available backend services and their health status.
 * Enhanced with independent service management and graceful degradation capabilities.
 * 
 * @class ServiceRegistry
 * @extends EventEmitter
 */
class ServiceRegistry extends EventEmitter {
    /**
     * Creates an instance of ServiceRegistry
     * @constructor
     * @param {Object} config - Service registry configuration
     */
    constructor(config) {
        super();
        this.config = config || {};
        this.services = new Map();
        this.healthChecks = new Map();
        this.serviceStates = new Map();
        this.discoveryInterval = null;
        this.isInitialized = false;
        this.discoveryMethods = {
            'static': this.discoverStaticServices.bind(this),
            'consul': this.discoverConsulServices.bind(this),
            'kubernetes': this.discoverKubernetesServices.bind(this),
            'eureka': this.discoverEurekaServices.bind(this)
        };

        // Enhanced logging configuration for independent service management
        this.loggingConfig = {
            maxConsecutiveWarnings: 3,
            errorEscalationThreshold: 5,
            silentPeriodAfterErrors: 10,
            successLogAfterFailures: true
        };
    }

    /**
     * Initializes the service registry
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Initializing Service Registry');

            // Load initial services based on discovery type
            await this.discoverServices();

            // Start periodic service discovery
            if (this.config.discovery && this.config.discovery.refreshInterval) {
                this.startDiscovery();
            }

            // Start health monitoring with independent service tracking
            this.startHealthMonitoring();

            this.isInitialized = true;
            console.log(`Service Registry initialized with ${this.services.size} services`);
        } catch (error) {
            console.error('Failed to initialize Service Registry:', error);
            throw error;
        }
    }

    /**
     * Discovers services based on configured discovery method
     * @async
     * @returns {Promise<void>}
     */
    async discoverServices() {
        const discoveryType = this.config.discovery?.type || 'static';
        const discoveryMethod = this.discoveryMethods[discoveryType];

        if (!discoveryMethod) {
            throw new Error(`Unknown discovery type: ${discoveryType}`);
        }

        try {
            await discoveryMethod();
            this.emit('services:discovered', Array.from(this.services.values()));
        } catch (error) {
            console.error(`Service discovery failed for type ${discoveryType}:`, error);
            this.emit('discovery:error', error);

            // Fall back to static configuration if available
            if (discoveryType !== 'static' && this.config.registry) {
                console.log('Falling back to static service configuration');
                await this.discoverStaticServices();
            }
        }
    }

    /**
     * Discovers services from static configuration
     * @async
     * @private
     */
    async discoverStaticServices() {
        if (!this.config.registry || !Array.isArray(this.config.registry)) {
            return;
        }

        for (const serviceConfig of this.config.registry) {
            const service = this.createServiceInstance(serviceConfig);
            await this.registerService(service);
        }
    }

    /**
     * Discovers services from Consul
     * @async
     * @private
     */
    async discoverConsulServices() {
        const consulUrl = this.config.discovery.consul?.url || 'http://localhost:8500';
        const datacenter = this.config.discovery.consul?.datacenter || 'dc1';

        try {
            const response = await axios.get(`${consulUrl}/v1/catalog/services`, {
                params: { dc: datacenter }
            });

            for (const serviceName of Object.keys(response.data)) {
                // Get service instances
                const instancesResponse = await axios.get(
                    `${consulUrl}/v1/health/service/${serviceName}`,
                    { params: { dc: datacenter, passing: true } }
                );

                for (const instance of instancesResponse.data) {
                    const service = {
                        name: instance.Service.Service,
                        id: instance.Service.ID,
                        url: `http://${instance.Service.Address}:${instance.Service.Port}`,
                        tags: instance.Service.Tags,
                        metadata: instance.Service.Meta,
                        health: 'healthy'
                    };

                    await this.registerService(this.createServiceInstance(service));
                }
            }
        } catch (error) {
            console.error('Consul service discovery failed:', error);
            throw error;
        }
    }

    /**
     * Discovers services from Kubernetes
     * @async
     * @private
     */
    async discoverKubernetesServices() {
        const k8sConfig = this.config.discovery.kubernetes || {};
        const namespace = k8sConfig.namespace || 'default';
        const labelSelector = k8sConfig.labelSelector || '';

        try {
            // In a real implementation, this would use the Kubernetes API
            // For now, we'll use environment variables set by Kubernetes
            const serviceName = process.env.KUBERNETES_SERVICE_NAME;
            const serviceHost = process.env.KUBERNETES_SERVICE_HOST;
            const servicePort = process.env.KUBERNETES_SERVICE_PORT;

            if (serviceName && serviceHost && servicePort) {
                const service = {
                    name: serviceName,
                    id: `${serviceName}-${namespace}`,
                    url: `http://${serviceHost}:${servicePort}`,
                    namespace,
                    health: 'healthy'
                };

                await this.registerService(this.createServiceInstance(service));
            }
        } catch (error) {
            console.error('Kubernetes service discovery failed:', error);
            throw error;
        }
    }

    /**
     * Discovers services from Eureka
     * @async
     * @private
     */
    async discoverEurekaServices() {
        const eurekaUrl = this.config.discovery.eureka?.url || 'http://localhost:8761';

        try {
            const response = await axios.get(`${eurekaUrl}/eureka/apps`, {
                headers: { 'Accept': 'application/json' }
            });

            const applications = response.data.applications.application || [];

            for (const app of applications) {
                for (const instance of app.instance) {
                    const service = {
                        name: app.name.toLowerCase(),
                        id: instance.instanceId,
                        url: `http://${instance.ipAddr}:${instance.port.$}`,
                        metadata: instance.metadata,
                        health: instance.status === 'UP' ? 'healthy' : 'unhealthy'
                    };

                    await this.registerService(this.createServiceInstance(service));
                }
            }
        } catch (error) {
            console.error('Eureka service discovery failed:', error);
            throw error;
        }
    }

    /**
     * Creates a service instance from configuration
     * @private
     * @param {Object} config - Service configuration
     * @returns {Object} Service instance
     */
    createServiceInstance(config) {
        return {
            id: config.id || `${config.name}-${Date.now()}`,
            name: config.name,
            url: config.url,
            path: config.path || '',
            version: config.version || 'v1',
            protocol: config.protocol || 'http',
            healthCheck: {
                enabled: config.healthCheck?.enabled !== false,
                path: config.healthCheck?.path || '/health',
                interval: config.healthCheck?.interval || 30000,
                timeout: config.healthCheck?.timeout || 5000,
                unhealthyThreshold: config.healthCheck?.unhealthyThreshold || 3,
                healthyThreshold: config.healthCheck?.healthyThreshold || 2
            },
            loadBalancing: {
                weight: config.weight || 1,
                maxConnections: config.maxConnections || 100
            },
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            requiresAuth: config.requiresAuth !== false,
            supportsWebSocket: config.supportsWebSocket || false,
            rateLimit: config.rateLimit,
            circuitBreaker: config.circuitBreaker,
            metadata: config.metadata || {},
            tags: config.tags || [],
            endpoints: config.endpoints || [],
            status: 'unknown',
            health: 'unknown',
            lastHealthCheck: null,
            metrics: {
                requests: 0,
                errors: 0,
                totalResponseTime: 0,
                averageResponseTime: 0
            },
            instances: []
        };
    }

    /**
     * Initializes service state tracking for independent management
     * @private
     * @param {Object} service - Service instance
     */
    initializeServiceState(service) {
        if (!this.serviceStates.has(service.name)) {
            this.serviceStates.set(service.name, {
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                totalFailures: 0,
                totalSuccesses: 0,
                firstFailureTime: null,
                lastSuccessTime: null,
                lastFailureTime: null,
                warningCount: 0,
                errorCount: 0,
                silentUntil: null,
                lastLogLevel: null,
                availabilityStartTime: Date.now(),
                cumulativeDowntime: 0
            });
        }
    }

    /**
     * Registers a service in the registry
     * @async
     * @param {Object} service - Service to register
     * @returns {Promise<void>}
     */
    async registerService(service) {
        if (!service.name || !service.url) {
            throw new Error('Service must have a name and URL');
        }

        const existingService = this.services.get(service.name);

        if (existingService) {
            // Update existing service
            Object.assign(existingService, service);
            console.log(`Service updated: ${service.name}`);
        } else {
            // Register new service
            this.services.set(service.name, service);
            console.log(`Service registered: ${service.name}`);
        }

        // Initialize independent service state tracking
        this.initializeServiceState(service);

        // Perform initial health check independently
        await this.checkServiceHealth(service);

        this.emit('service:registered', service);
    }

    /**
     * Deregisters a service from the registry
     * @param {string} serviceName - Name of service to deregister
     */
    deregisterService(serviceName) {
        const service = this.services.get(serviceName);

        if (service) {
            this.services.delete(serviceName);

            // Clear health check interval
            const healthCheckInterval = this.healthChecks.get(serviceName);
            if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
                this.healthChecks.delete(serviceName);
            }

            // Clean up service state tracking
            this.serviceStates.delete(serviceName);

            console.log(`Service deregistered: ${serviceName}`);
            this.emit('service:deregistered', service);
        }
    }

    /**
     * Gets a service by name
     * @param {string} serviceName - Service name
     * @returns {Object|null} Service instance or null
     */
    getService(serviceName) {
        return this.services.get(serviceName) || null;
    }

    /**
     * Gets all registered services
     * @returns {Array} Array of services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }

    /**
     * Gets healthy services
     * @returns {Array} Array of healthy services
     */
    getHealthyServices() {
        return this.getAllServices().filter(service => service.health === 'healthy');
    }

    /**
     * Gets services by tag
     * @param {string} tag - Tag to filter by
     * @returns {Array} Array of services with tag
     */
    getServicesByTag(tag) {
        return this.getAllServices().filter(service =>
            service.tags && service.tags.includes(tag)
        );
    }

    /**
     * Selects a service instance using load balancing
     * @param {string} serviceName - Service name
     * @param {string} algorithm - Load balancing algorithm
     * @returns {Object|null} Selected service instance
     */
    selectServiceInstance(serviceName, algorithm = 'round-robin') {
        const service = this.getService(serviceName);

        if (!service) {
            return null;
        }

        // For single instance services
        if (!service.instances || service.instances.length <= 1) {
            return service;
        }

        // Get healthy instances
        const healthyInstances = service.instances.filter(i => i.health === 'healthy');

        if (healthyInstances.length === 0) {
            return null;
        }

        switch (algorithm) {
            case 'round-robin':
                service.lastSelectedIndex = (service.lastSelectedIndex || 0) + 1;
                return healthyInstances[service.lastSelectedIndex % healthyInstances.length];

            case 'least-connections':
                return healthyInstances.reduce((min, instance) =>
                    instance.connections < min.connections ? instance : min
                );

            case 'random':
                return healthyInstances[Math.floor(Math.random() * healthyInstances.length)];

            case 'weighted':
                const totalWeight = healthyInstances.reduce((sum, i) => sum + i.weight, 0);
                let random = Math.random() * totalWeight;

                for (const instance of healthyInstances) {
                    random -= instance.weight;
                    if (random <= 0) {
                        return instance;
                    }
                }
                return healthyInstances[0];

            default:
                return healthyInstances[0];
        }
    }

    /**
     * Starts periodic service discovery
     * @private
     */
    startDiscovery() {
        const interval = this.config.discovery.refreshInterval;

        this.discoveryInterval = setInterval(async () => {
            try {
                await this.discoverServices();
            } catch (error) {
                console.error('Periodic service discovery failed:', error);
                this.emit('discovery:error', error);
            }
        }, interval);

        console.log(`Service discovery started with interval: ${interval}ms`);
    }

    /**
     * Starts health monitoring for all services with independent tracking
     * @private
     */
    startHealthMonitoring() {
        for (const [serviceName, service] of this.services) {
            if (service.healthCheck && service.healthCheck.enabled) {
                this.startServiceHealthCheck(serviceName);
            }
        }
    }

    /**
     * Starts health check for a specific service with independent management
     * @private
     * @param {string} serviceName - Service name
     */
    startServiceHealthCheck(serviceName) {
        const service = this.services.get(serviceName);

        if (!service || !service.healthCheck.enabled) {
            return;
        }

        // Clear existing health check if any
        const existingInterval = this.healthChecks.get(serviceName);
        if (existingInterval) {
            clearInterval(existingInterval);
        }

        // Setup periodic health check with independent error handling
        const interval = setInterval(async () => {
            await this.checkServiceHealth(service);
        }, service.healthCheck.interval);

        this.healthChecks.set(serviceName, interval);
    }

    /**
     * Determines appropriate log level based on service failure patterns
     * @private
     * @param {Object} service - Service instance
     * @param {boolean} isSuccess - Whether the current check was successful
     * @returns {string} Log level (info, warn, error, silent)
     */
    determineLogLevel(service, isSuccess) {
        const state = this.serviceStates.get(service.name);
        const now = Date.now();

        // Check if we're in a silent period
        if (state.silentUntil && now < state.silentUntil) {
            return 'silent';
        }

        if (isSuccess) {
            // Log success if recovering from failures
            if (state.consecutiveFailures > 0 && this.loggingConfig.successLogAfterFailures) {
                return 'info';
            }
            return 'silent'; // Don't log routine successful checks
        }

        // Handle failure logging
        if (state.consecutiveFailures <= this.loggingConfig.maxConsecutiveWarnings) {
            return 'warn';
        }

        if (state.consecutiveFailures === this.loggingConfig.errorEscalationThreshold) {
            // Set silent period after escalating to error
            state.silentUntil = now + (this.loggingConfig.silentPeriodAfterErrors * service.healthCheck.interval);
            return 'error';
        }

        if (state.consecutiveFailures > this.loggingConfig.errorEscalationThreshold) {
            return 'silent'; // Avoid log spam after initial error
        }

        return 'warn';
    }

    /**
     * Logs service health status with appropriate level and context
     * @private
     * @param {Object} service - Service instance
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} details - Additional details
     */
    logServiceHealth(service, level, message, details = {}) {
        const state = this.serviceStates.get(service.name);
        const contextInfo = {
            service: service.name,
            consecutiveFailures: state.consecutiveFailures,
            totalFailures: state.totalFailures,
            uptime: this.calculateServiceUptime(service.name),
            ...details
        };

        switch (level) {
            case 'info':
                console.log(`Service ${service.name}: ${message}`, contextInfo);
                break;
            case 'warn':
                console.warn(`Service ${service.name}: ${message}`, contextInfo);
                break;
            case 'error':
                console.error(`Service ${service.name}: ${message}`, contextInfo);
                break;
            case 'silent':
                // No logging for silent level
                break;
        }

        state.lastLogLevel = level;
    }

    /**
     * Calculates service uptime percentage
     * @private
     * @param {string} serviceName - Service name
     * @returns {number} Uptime percentage
     */
    calculateServiceUptime(serviceName) {
        const state = this.serviceStates.get(serviceName);
        if (!state) return 0;

        const totalTime = Date.now() - state.availabilityStartTime;
        const uptime = totalTime - state.cumulativeDowntime;
        return totalTime > 0 ? ((uptime / totalTime) * 100).toFixed(2) : 0;
    }

    /**
 * Checks health of a service with enhanced SSL support and independent error handling
 * @async
 * @param {Object} service - Service to check
 * @returns {Promise<boolean>} Health status
 */
    async checkServiceHealth(service) {
        if (!service.healthCheck || !service.healthCheck.enabled) {
            return true;
        }

        const healthUrl = `${service.url}${service.healthCheck.path}`;
        const previousHealth = service.health;
        const state = this.serviceStates.get(service.name);
        const startTime = Date.now();

        try {
            const axiosConfig = {
                timeout: service.healthCheck.timeout,
                validateStatus: (status) => status === 200
            };

            // Apply SSL configuration for HTTPS requests with development support
            if (healthUrl.startsWith('https://')) {
                const https = require('https');

                // Determine SSL security based on environment and configuration
                let rejectUnauthorized = true;

                // Check for explicit proxy configuration
                if (this.config.proxy && typeof this.config.proxy.secure === 'boolean') {
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
                    console.log(`SSL config for ${service.name}: rejectUnauthorized=${rejectUnauthorized}`);
                }
            }

            const response = await axios.get(healthUrl, axiosConfig);

            // Update service health information
            service.lastHealthCheck = new Date();
            service.healthCheckResponse = response.data;

            // Update state tracking for success
            state.consecutiveFailures = 0;
            state.consecutiveSuccesses += 1;
            state.totalSuccesses += 1;
            state.lastSuccessTime = Date.now();

            // Calculate and update downtime if recovering from failure
            if (state.firstFailureTime) {
                state.cumulativeDowntime += Date.now() - state.firstFailureTime;
                state.firstFailureTime = null;
            }

            // Determine health status based on thresholds
            if (service.health !== 'healthy') {
                if (state.consecutiveSuccesses >= service.healthCheck.healthyThreshold) {
                    service.health = 'healthy';
                    service.status = 'active';

                    if (previousHealth !== 'healthy') {
                        const logLevel = this.determineLogLevel(service, true);
                        this.logServiceHealth(service, logLevel, 'Service recovered and is now healthy', {
                            responseTime: Date.now() - startTime,
                            recoveryTime: state.lastFailureTime ? Date.now() - state.lastFailureTime : 0
                        });
                        this.emit('service:healthy', service);
                    }
                }
            } else {
                service.health = 'healthy';
                service.status = 'active';
            }

            return true;

        } catch (error) {
            // Update service health information for failure
            service.lastHealthCheck = new Date();
            service.healthCheckError = error.message;

            // Update state tracking for failure
            state.consecutiveFailures += 1;
            state.consecutiveSuccesses = 0;
            state.totalFailures += 1;
            state.lastFailureTime = Date.now();

            // Mark first failure time for downtime calculation
            if (!state.firstFailureTime) {
                state.firstFailureTime = Date.now();
            }

            // Determine if service should be marked as unhealthy
            if (state.consecutiveFailures >= service.healthCheck.unhealthyThreshold) {
                service.health = 'unhealthy';
                service.status = 'inactive';

                if (previousHealth !== 'unhealthy') {
                    const logLevel = this.determineLogLevel(service, false);
                    this.logServiceHealth(service, logLevel, 'Service is now unhealthy', {
                        error: error.message,
                        errorCode: error.code,
                        responseTime: Date.now() - startTime,
                        threshold: service.healthCheck.unhealthyThreshold
                    });
                    this.emit('service:unhealthy', service);
                }
            } else {
                // Log intermediate failures with appropriate level
                const logLevel = this.determineLogLevel(service, false);
                if (logLevel !== 'silent') {
                    this.logServiceHealth(service, logLevel, 'Health check failed', {
                        error: error.message,
                        errorCode: error.code,
                        responseTime: Date.now() - startTime,
                        attemptsRemaining: service.healthCheck.unhealthyThreshold - state.consecutiveFailures
                    });
                }
            }

            return false;
        }
    }

    /**
     * Updates service metrics
     * @param {string} serviceName - Service name
     * @param {Object} metrics - Metrics to update
     */
    updateServiceMetrics(serviceName, metrics) {
        const service = this.services.get(serviceName);

        if (service) {
            if (metrics.requestCount !== undefined) {
                service.metrics.requests += metrics.requestCount;
            }

            if (metrics.errorCount !== undefined) {
                service.metrics.errors += metrics.errorCount;
            }

            if (metrics.responseTime !== undefined) {
                service.metrics.totalResponseTime += metrics.responseTime;
                service.metrics.averageResponseTime =
                    service.metrics.totalResponseTime / service.metrics.requests;
            }

            this.emit('service:metrics', { service: serviceName, metrics: service.metrics });
        }
    }

    /**
     * Gets service statistics including uptime and failure information
     * @param {string} serviceName - Service name
     * @returns {Object} Service statistics
     */
    getServiceStatistics(serviceName) {
        const service = this.services.get(serviceName);
        const state = this.serviceStates.get(serviceName);

        if (!service || !state) {
            return null;
        }

        return {
            name: serviceName,
            health: service.health,
            status: service.status,
            uptime: this.calculateServiceUptime(serviceName),
            totalSuccesses: state.totalSuccesses,
            totalFailures: state.totalFailures,
            consecutiveFailures: state.consecutiveFailures,
            consecutiveSuccesses: state.consecutiveSuccesses,
            lastSuccessTime: state.lastSuccessTime,
            lastFailureTime: state.lastFailureTime,
            lastHealthCheck: service.lastHealthCheck,
            metrics: service.metrics
        };
    }

    /**
     * Gets service count
     * @returns {number} Number of registered services
     */
    getServiceCount() {
        return this.services.size;
    }

    /**
     * Deregisters from service discovery
     * @async
     * @returns {Promise<void>}
     */
    async deregister() {
        // In a real implementation, this would deregister from Consul/Eureka/etc
        console.log('Deregistering from service discovery');

        // Clear all services
        for (const serviceName of this.services.keys()) {
            this.deregisterService(serviceName);
        }
    }

    /**
     * Disconnects and cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async disconnect() {
        console.log('Disconnecting Service Registry');

        // Stop discovery
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }

        // Stop all health checks
        for (const [serviceName, interval] of this.healthChecks) {
            clearInterval(interval);
        }
        this.healthChecks.clear();

        // Clear services and state tracking
        this.services.clear();
        this.serviceStates.clear();

        this.isInitialized = false;
        this.removeAllListeners();

        console.log('Service Registry disconnected');
    }
}

module.exports = { ServiceRegistry };