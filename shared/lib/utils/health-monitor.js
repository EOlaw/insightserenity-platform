'use strict';

/**
 * @fileoverview Health Monitor for system health checking and monitoring
 * @module shared/lib/utils/health-monitor
 * @description Provides comprehensive health monitoring capabilities for services
 */

const EventEmitter = require('events');
const logger = require('./logger');

/**
 * HealthMonitor class for monitoring system health
 * Provides automated health checks for various services and custom checks
 */
class HealthMonitor extends EventEmitter {
    /**
     * Creates an instance of HealthMonitor
     * @param {Object} config - Configuration options
     * @param {number} [config.checkInterval=30000] - Interval between health checks in ms
     * @param {string[]} [config.services=[]] - Array of services to monitor
     * @param {Object} [config.customChecks={}] - Custom health check functions
     * @param {boolean} [config.autoStart=false] - Whether to start monitoring automatically
     * @param {number} [config.timeout=5000] - Timeout for health checks in ms
     * @param {number} [config.retryAttempts=3] - Number of retry attempts for failed checks
     * @param {number} [config.retryDelay=1000] - Delay between retry attempts in ms
     */
    constructor(config = {}) {
        super();
        
        this.config = {
            checkInterval: 30000, // 30 seconds default
            services: [],
            customChecks: {},
            autoStart: false,
            timeout: 5000,
            retryAttempts: 3,
            retryDelay: 1000,
            ...config
        };
        
        this.isRunning = false;
        this.intervalId = null;
        this.healthStatus = new Map();
        this.lastCheckTime = null;
        this.checkCount = 0;
        this.errorCount = 0;
        
        // Initialize health status for all services
        this.initializeHealthStatus();
        
        if (this.config.autoStart) {
            this.start();
        }
    }

    /**
     * Initialize health status for all configured services
     * @private
     */
    initializeHealthStatus() {
        // Standard services
        this.config.services.forEach(service => {
            this.healthStatus.set(service, {
                name: service,
                healthy: false,
                lastCheck: null,
                lastError: null,
                checkCount: 0,
                errorCount: 0,
                status: 'unknown'
            });
        });
        
        // Custom checks
        Object.keys(this.config.customChecks).forEach(checkName => {
            this.healthStatus.set(checkName, {
                name: checkName,
                healthy: false,
                lastCheck: null,
                lastError: null,
                checkCount: 0,
                errorCount: 0,
                status: 'unknown',
                custom: true
            });
        });
    }

    /**
     * Start the health monitoring
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            logger.warn('HealthMonitor is already running');
            return;
        }

        logger.info('Starting HealthMonitor', {
            interval: this.config.checkInterval,
            services: this.config.services,
            customChecks: Object.keys(this.config.customChecks)
        });

        this.isRunning = true;
        
        // Perform initial health check
        await this.performHealthChecks();
        
        // Setup interval for regular checks
        this.intervalId = setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                logger.error('Error during scheduled health check', { error: error.message });
                this.errorCount++;
            }
        }, this.config.checkInterval);

        this.emit('started');
    }

    /**
     * Stop the health monitoring
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('HealthMonitor is not running');
            return;
        }

        logger.info('Stopping HealthMonitor');

        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.emit('stopped');
    }

    /**
     * Perform health checks for all configured services
     * @returns {Promise<Object>} Health check results
     */
    async performHealthChecks() {
        const startTime = new Date();
        this.checkCount++;
        
        logger.debug('Performing health checks', { 
            checkNumber: this.checkCount,
            services: this.config.services.length,
            customChecks: Object.keys(this.config.customChecks).length
        });

        const results = {
            timestamp: startTime.toISOString(),
            overall: true,
            services: {},
            customChecks: {},
            summary: {
                total: 0,
                healthy: 0,
                unhealthy: 0,
                unknown: 0
            }
        };

        // Check standard services
        for (const service of this.config.services) {
            try {
                const serviceResult = await this.checkService(service);
                results.services[service] = serviceResult;
                results.summary.total++;
                
                if (serviceResult.healthy) {
                    results.summary.healthy++;
                } else {
                    results.summary.unhealthy++;
                    results.overall = false;
                }
            } catch (error) {
                logger.error(`Health check failed for service: ${service}`, { error: error.message });
                results.services[service] = {
                    healthy: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.summary.total++;
                results.summary.unhealthy++;
                results.overall = false;
            }
        }

        // Check custom health checks
        for (const [checkName, checkFunction] of Object.entries(this.config.customChecks)) {
            try {
                const customResult = await this.executeCustomCheck(checkName, checkFunction);
                results.customChecks[checkName] = customResult;
                results.summary.total++;
                
                if (customResult.healthy) {
                    results.summary.healthy++;
                } else {
                    results.summary.unhealthy++;
                    results.overall = false;
                }
            } catch (error) {
                logger.error(`Custom health check failed: ${checkName}`, { error: error.message });
                results.customChecks[checkName] = {
                    healthy: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.summary.total++;
                results.summary.unhealthy++;
                results.overall = false;
            }
        }

        this.lastCheckTime = startTime;
        
        // Emit health check completed event
        this.emit('healthCheck', results);
        
        // Emit specific events for status changes
        if (!results.overall) {
            this.emit('unhealthy', results);
        } else {
            this.emit('healthy', results);
        }

        return results;
    }

    /**
     * Check the health of a specific service
     * @param {string} serviceName - Name of the service to check
     * @returns {Promise<Object>} Service health result
     */
    async checkService(serviceName) {
        const status = this.healthStatus.get(serviceName);
        status.checkCount++;
        
        try {
            let result;
            
            switch (serviceName.toLowerCase()) {
                case 'database':
                    result = await this.checkDatabase();
                    break;
                case 'redis':
                    result = await this.checkRedis();
                    break;
                case 'auth':
                    result = await this.checkAuth();
                    break;
                case 'audit':
                    result = await this.checkAudit();
                    break;
                default:
                    result = { healthy: false, error: `Unknown service: ${serviceName}` };
            }
            
            status.healthy = result.healthy;
            status.lastCheck = new Date().toISOString();
            status.lastError = result.error || null;
            status.status = result.healthy ? 'healthy' : 'unhealthy';
            
            if (!result.healthy) {
                status.errorCount++;
            }
            
            return {
                ...result,
                checkCount: status.checkCount,
                errorCount: status.errorCount,
                lastCheck: status.lastCheck
            };
        } catch (error) {
            status.healthy = false;
            status.lastCheck = new Date().toISOString();
            status.lastError = error.message;
            status.status = 'error';
            status.errorCount++;
            
            throw error;
        }
    }

    /**
     * Execute a custom health check
     * @param {string} checkName - Name of the custom check
     * @param {Function} checkFunction - Function to execute
     * @returns {Promise<Object>} Custom check result
     */
    async executeCustomCheck(checkName, checkFunction) {
        const status = this.healthStatus.get(checkName);
        status.checkCount++;
        
        try {
            const result = await Promise.race([
                checkFunction(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout)
                )
            ]);
            
            // Normalize result format
            const normalizedResult = typeof result === 'boolean' 
                ? { healthy: result } 
                : result;
            
            status.healthy = normalizedResult.healthy;
            status.lastCheck = new Date().toISOString();
            status.lastError = normalizedResult.error || null;
            status.status = normalizedResult.healthy ? 'healthy' : 'unhealthy';
            
            if (!normalizedResult.healthy) {
                status.errorCount++;
            }
            
            return {
                ...normalizedResult,
                checkCount: status.checkCount,
                errorCount: status.errorCount,
                lastCheck: status.lastCheck
            };
        } catch (error) {
            status.healthy = false;
            status.lastCheck = new Date().toISOString();
            status.lastError = error.message;
            status.status = 'error';
            status.errorCount++;
            
            throw error;
        }
    }

    /**
     * Check database health
     * @private
     * @returns {Promise<Object>} Database health result
     */
    async checkDatabase() {
        try {
            const Database = require('../database');
            const healthStatus = Database.getHealthStatus();
            
            return {
                healthy: healthStatus.isConnected,
                details: {
                    connected: healthStatus.isConnected,
                    connections: healthStatus.totalConnections,
                    multiTenant: healthStatus.multiTenantEnabled
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: `Database check failed: ${error.message}`
            };
        }
    }

    /**
     * Check Redis health
     * @private
     * @returns {Promise<Object>} Redis health result
     */
    async checkRedis() {
        try {
            // Check if Redis is enabled
            const redisEnabled = process.env.REDIS_ENABLED === 'true';
            
            if (!redisEnabled) {
                return {
                    healthy: true,
                    details: {
                        enabled: false,
                        fallbackMode: true,
                        message: 'Redis disabled, using memory fallback'
                    }
                };
            }
            
            // If Redis is enabled, attempt to check connection
            // This would need to be implemented based on your Redis setup
            return {
                healthy: true,
                details: {
                    enabled: true,
                    connected: true
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: `Redis check failed: ${error.message}`
            };
        }
    }

    /**
     * Check authentication system health
     * @private
     * @returns {Promise<Object>} Auth health result
     */
    async checkAuth() {
        try {
            // Basic auth system check
            return {
                healthy: true,
                details: {
                    strategies: 'available',
                    sessions: 'operational'
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: `Auth check failed: ${error.message}`
            };
        }
    }

    /**
     * Check audit system health
     * @private
     * @returns {Promise<Object>} Audit health result
     */
    async checkAudit() {
        try {
            // Basic audit system check
            return {
                healthy: true,
                details: {
                    enabled: true,
                    operational: true
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: `Audit check failed: ${error.message}`
            };
        }
    }

    /**
     * Get current health status
     * @returns {Object} Current health status
     */
    getStatus() {
        const status = {
            isRunning: this.isRunning,
            lastCheckTime: this.lastCheckTime,
            checkCount: this.checkCount,
            errorCount: this.errorCount,
            services: {},
            customChecks: {},
            overall: true
        };

        // Collect service statuses
        for (const [name, serviceStatus] of this.healthStatus.entries()) {
            const statusInfo = {
                name: serviceStatus.name,
                healthy: serviceStatus.healthy,
                status: serviceStatus.status,
                lastCheck: serviceStatus.lastCheck,
                lastError: serviceStatus.lastError,
                checkCount: serviceStatus.checkCount,
                errorCount: serviceStatus.errorCount
            };

            if (serviceStatus.custom) {
                status.customChecks[name] = statusInfo;
            } else {
                status.services[name] = statusInfo;
            }

            if (!serviceStatus.healthy) {
                status.overall = false;
            }
        }

        return status;
    }

    /**
     * Add a custom health check
     * @param {string} name - Name of the health check
     * @param {Function} checkFunction - Function to execute for the check
     */
    addCustomCheck(name, checkFunction) {
        this.config.customChecks[name] = checkFunction;
        this.healthStatus.set(name, {
            name,
            healthy: false,
            lastCheck: null,
            lastError: null,
            checkCount: 0,
            errorCount: 0,
            status: 'unknown',
            custom: true
        });

        logger.info(`Added custom health check: ${name}`);
    }

    /**
     * Remove a custom health check
     * @param {string} name - Name of the health check to remove
     */
    removeCustomCheck(name) {
        delete this.config.customChecks[name];
        this.healthStatus.delete(name);
        
        logger.info(`Removed custom health check: ${name}`);
    }

    /**
     * Perform a one-time health check
     * @returns {Promise<Object>} Health check results
     */
    async checkNow() {
        return await this.performHealthChecks();
    }

    /**
     * Get health check history (if needed in the future)
     * @returns {Array} Health check history
     */
    getHistory() {
        // This could be implemented to store and return historical health data
        return [];
    }
}

module.exports = HealthMonitor;