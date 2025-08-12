'use strict';

/**
 * @fileoverview Shutdown Handler - Graceful shutdown management for API Gateway
 * @module servers/gateway/utils/shutdown-handler
 * @requires events
 * @requires cluster
 * @requires os
 */

const { EventEmitter } = require('events');
const cluster = require('cluster');
const os = require('os');

/**
 * ShutdownHandler class implements comprehensive graceful shutdown for the API Gateway.
 * It manages connection draining, resource cleanup, health check updates, cluster coordination,
 * and ensures zero-downtime deployments with proper state persistence.
 */
class ShutdownHandler extends EventEmitter {
    /**
     * Creates an instance of ShutdownHandler
     * @constructor
     * @param {Object} config - Shutdown configuration
     * @param {Object} logger - Logger instance
     */
    constructor(config = {}, logger = console) {
        super();
        this.config = this.mergeConfig(config);
        this.logger = logger;
        
        // Shutdown state
        this.isShuttingDown = false;
        this.shutdownStartTime = null;
        this.shutdownReason = null;
        this.shutdownPhase = 'idle';
        
        // Resource tracking
        this.resources = new Map();
        this.connections = new Map();
        this.activeRequests = new Map();
        this.timers = new Map();
        this.intervals = new Map();
        this.streams = new Map();
        this.processes = new Map();
        
        // Server references
        this.servers = new Map();
        this.serverClosePromises = new Map();
        
        // Service dependencies
        this.services = new Map();
        this.serviceStopOrder = [];
        
        // Database connections
        this.databases = new Map();
        this.databaseClosePromises = new Map();
        
        // Message queues
        this.messageQueues = new Map();
        this.queueClosePromises = new Map();
        
        // Cleanup handlers
        this.cleanupHandlers = [];
        this.emergencyHandlers = [];
        this.finalHandlers = [];
        
        // Health check management
        this.healthCheckEndpoint = config.healthCheck?.endpoint;
        this.isHealthy = true;
        
        // Cluster coordination
        this.isClusterMode = cluster.isWorker || cluster.isMaster;
        this.workerId = cluster.worker?.id;
        this.workerShutdownStatus = new Map();
        
        // Shutdown phases
        this.phases = [
            'pre-shutdown',
            'stop-accepting',
            'drain-connections',
            'close-services',
            'close-databases',
            'close-queues',
            'cleanup-resources',
            'final-cleanup',
            'complete'
        ];
        
        // Phase handlers
        this.phaseHandlers = new Map();
        this.initializePhaseHandlers();
        
        // Metrics
        this.metrics = {
            shutdownCount: 0,
            averageShutdownTime: 0,
            lastShutdownDuration: 0,
            gracefulShutdowns: 0,
            forcedShutdowns: 0,
            connectionsDrained: 0,
            requestsCompleted: 0,
            resourcesCleaned: 0
        };
        
        // State persistence
        this.statePersistence = {
            enabled: config.statePersistence?.enabled || false,
            path: config.statePersistence?.path || './shutdown-state.json',
            interval: config.statePersistence?.interval || 5000
        };
        
        // Setup signal handlers
        this.setupSignalHandlers();
        
        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Merges configuration with defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(config) {
        return {
            gracefulTimeout: config.gracefulTimeout || 30000, // 30 seconds
            forceTimeout: config.forceTimeout || 60000, // 60 seconds
            drainTimeout: config.drainTimeout || 25000, // 25 seconds
            connectionTimeout: config.connectionTimeout || 5000, // 5 seconds per connection
            requestTimeout: config.requestTimeout || 10000, // 10 seconds per request
            
            signals: {
                graceful: config.signals?.graceful || ['SIGTERM', 'SIGINT'],
                immediate: config.signals?.immediate || ['SIGKILL'],
                reload: config.signals?.reload || ['SIGHUP'],
                status: config.signals?.status || ['SIGUSR1'],
                debug: config.signals?.debug || ['SIGUSR2']
            },
            
            healthCheck: {
                enabled: config.healthCheck?.enabled !== false,
                endpoint: config.healthCheck?.endpoint || '/health',
                gracePeriod: config.healthCheck?.gracePeriod || 5000,
                updateInterval: config.healthCheck?.updateInterval || 1000
            },
            
            cluster: {
                enabled: config.cluster?.enabled || false,
                staggerDelay: config.cluster?.staggerDelay || 2000,
                maxConcurrentShutdowns: config.cluster?.maxConcurrentShutdowns || 2,
                workerRestartDelay: config.cluster?.workerRestartDelay || 1000
            },
            
            notifications: {
                enabled: config.notifications?.enabled || false,
                webhooks: config.notifications?.webhooks || [],
                email: config.notifications?.email || null,
                slack: config.notifications?.slack || null
            },
            
            recovery: {
                enabled: config.recovery?.enabled !== false,
                maxRetries: config.recovery?.maxRetries || 3,
                retryDelay: config.recovery?.retryDelay || 1000,
                saveState: config.recovery?.saveState !== false
            },
            
            monitoring: {
                enabled: config.monitoring?.enabled !== false,
                metricsInterval: config.monitoring?.metricsInterval || 5000,
                logLevel: config.monitoring?.logLevel || 'info'
            },
            
            ...config
        };
    }

    /**
     * Initializes phase handlers
     * @private
     */
    initializePhaseHandlers() {
        // Pre-shutdown phase
        this.phaseHandlers.set('pre-shutdown', async () => {
            this.logger.info('Starting pre-shutdown phase');
            
            // Update health status
            this.isHealthy = false;
            
            // Notify external systems
            await this.notifyShutdown();
            
            // Save current state
            if (this.config.recovery.saveState) {
                await this.saveState();
            }
            
            // Execute pre-shutdown handlers
            await this.executeHandlers(this.cleanupHandlers.filter(h => h.phase === 'pre-shutdown'));
        });

        // Stop accepting new connections
        this.phaseHandlers.set('stop-accepting', async () => {
            this.logger.info('Stopping acceptance of new connections');
            
            // Close all server listeners
            const closePromises = [];
            
            for (const [name, server] of this.servers) {
                closePromises.push(this.stopAcceptingConnections(name, server));
            }
            
            await Promise.all(closePromises);
            
            // Wait for grace period
            await this.delay(this.config.healthCheck.gracePeriod);
        });

        // Drain existing connections
        this.phaseHandlers.set('drain-connections', async () => {
            this.logger.info('Draining existing connections');
            
            const startTime = Date.now();
            const timeout = this.config.drainTimeout;
            
            // Track active connections
            const activeConnections = Array.from(this.connections.values());
            this.logger.info(`Draining ${activeConnections.length} connections`);
            
            // Send connection close headers
            for (const conn of activeConnections) {
                this.sendCloseHeaders(conn);
            }
            
            // Wait for connections to close
            await this.waitForCondition(
                () => this.connections.size === 0,
                timeout,
                'connections to drain'
            );
            
            // Force close remaining connections
            if (this.connections.size > 0) {
                this.logger.warn(`Force closing ${this.connections.size} connections`);
                await this.forceCloseConnections();
            }
            
            this.metrics.connectionsDrained += activeConnections.length;
            this.logger.info(`Drained connections in ${Date.now() - startTime}ms`);
        });

        // Close services
        this.phaseHandlers.set('close-services', async () => {
            this.logger.info('Closing services');
            
            // Stop services in dependency order
            for (const serviceName of this.serviceStopOrder) {
                const service = this.services.get(serviceName);
                if (service) {
                    await this.stopService(serviceName, service);
                }
            }
            
            // Stop remaining services
            for (const [name, service] of this.services) {
                if (!this.serviceStopOrder.includes(name)) {
                    await this.stopService(name, service);
                }
            }
        });

        // Close database connections
        this.phaseHandlers.set('close-databases', async () => {
            this.logger.info('Closing database connections');
            
            const closePromises = [];
            
            for (const [name, db] of this.databases) {
                closePromises.push(this.closeDatabase(name, db));
            }
            
            await Promise.all(closePromises);
        });

        // Close message queues
        this.phaseHandlers.set('close-queues', async () => {
            this.logger.info('Closing message queues');
            
            const closePromises = [];
            
            for (const [name, queue] of this.messageQueues) {
                closePromises.push(this.closeQueue(name, queue));
            }
            
            await Promise.all(closePromises);
        });

        // Cleanup resources
        this.phaseHandlers.set('cleanup-resources', async () => {
            this.logger.info('Cleaning up resources');
            
            // Clear timers
            for (const [name, timer] of this.timers) {
                clearTimeout(timer);
                this.logger.debug(`Cleared timer: ${name}`);
            }
            
            // Clear intervals
            for (const [name, interval] of this.intervals) {
                clearInterval(interval);
                this.logger.debug(`Cleared interval: ${name}`);
            }
            
            // Close streams
            for (const [name, stream] of this.streams) {
                await this.closeStream(name, stream);
            }
            
            // Terminate child processes
            for (const [name, proc] of this.processes) {
                await this.terminateProcess(name, proc);
            }
            
            // Execute cleanup handlers
            await this.executeHandlers(this.cleanupHandlers.filter(h => h.phase === 'cleanup'));
            
            this.metrics.resourcesCleaned = 
                this.timers.size + this.intervals.size + 
                this.streams.size + this.processes.size;
        });

        // Final cleanup
        this.phaseHandlers.set('final-cleanup', async () => {
            this.logger.info('Performing final cleanup');
            
            // Execute final handlers
            await this.executeHandlers(this.finalHandlers);
            
            // Clear all remaining resources
            this.resources.clear();
            this.connections.clear();
            this.activeRequests.clear();
            
            // Save final state
            if (this.config.recovery.saveState) {
                await this.saveFinalState();
            }
        });

        // Shutdown complete
        this.phaseHandlers.set('complete', async () => {
            const duration = Date.now() - this.shutdownStartTime;
            
            this.logger.info(`Shutdown complete in ${duration}ms`);
            
            // Update metrics
            this.metrics.lastShutdownDuration = duration;
            this.metrics.averageShutdownTime = 
                (this.metrics.averageShutdownTime * this.metrics.shutdownCount + duration) / 
                (this.metrics.shutdownCount + 1);
            this.metrics.shutdownCount++;
            this.metrics.gracefulShutdowns++;
            
            // Emit completion event
            this.emit('shutdown:complete', {
                reason: this.shutdownReason,
                duration,
                metrics: this.metrics
            });
        });
    }

    /**
     * Main shutdown method
     * @param {string} reason - Shutdown reason
     * @param {Object} options - Shutdown options
     * @returns {Promise<void>}
     */
    async shutdown(reason = 'manual', options = {}) {
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown already in progress');
            return this.shutdownPromise;
        }
        
        this.isShuttingDown = true;
        this.shutdownStartTime = Date.now();
        this.shutdownReason = reason;
        
        this.logger.info(`Starting graceful shutdown: ${reason}`);
        
        // Create shutdown promise
        this.shutdownPromise = this.performShutdown(options);
        
        // Setup force timeout
        const forceTimer = setTimeout(() => {
            this.logger.error('Graceful shutdown timeout exceeded, forcing shutdown');
            this.forceShutdown();
        }, options.forceTimeout || this.config.forceTimeout);
        
        try {
            await this.shutdownPromise;
            clearTimeout(forceTimer);
        } catch (error) {
            clearTimeout(forceTimer);
            this.logger.error('Shutdown error:', error);
            throw error;
        }
        
        return this.shutdownPromise;
    }

    /**
     * Performs the actual shutdown sequence
     * @private
     * @param {Object} options - Shutdown options
     * @returns {Promise<void>}
     */
    async performShutdown(options) {
        try {
            // Execute shutdown phases
            for (const phase of this.phases) {
                this.shutdownPhase = phase;
                this.emit('shutdown:phase', { phase });
                
                const handler = this.phaseHandlers.get(phase);
                if (handler) {
                    await this.executePhase(phase, handler, options);
                }
            }
            
        } catch (error) {
            this.logger.error(`Shutdown failed in phase ${this.shutdownPhase}:`, error);
            
            // Execute emergency handlers
            await this.executeEmergencyHandlers(error);
            
            throw error;
        }
    }

    /**
     * Executes a shutdown phase
     * @private
     * @param {string} phase - Phase name
     * @param {Function} handler - Phase handler
     * @param {Object} options - Options
     * @returns {Promise<void>}
     */
    async executePhase(phase, handler, options) {
        const startTime = Date.now();
        const timeout = options[`${phase}Timeout`] || this.config.gracefulTimeout;
        
        this.logger.info(`Executing phase: ${phase}`);
        
        try {
            await this.withTimeout(handler(), timeout, `Phase ${phase}`);
            
            const duration = Date.now() - startTime;
            this.logger.info(`Phase ${phase} completed in ${duration}ms`);
            
            this.emit('shutdown:phase:complete', { phase, duration });
            
        } catch (error) {
            this.logger.error(`Phase ${phase} failed:`, error);
            
            if (options.continueOnError) {
                this.emit('shutdown:phase:error', { phase, error });
            } else {
                throw error;
            }
        }
    }

    /**
     * Forces immediate shutdown
     * @private
     */
    async forceShutdown() {
        this.logger.warn('Forcing immediate shutdown');
        
        this.metrics.forcedShutdowns++;
        
        // Execute emergency handlers
        await this.executeEmergencyHandlers(new Error('Force shutdown'));
        
        // Kill all connections immediately
        for (const [name, conn] of this.connections) {
            try {
                conn.destroy();
            } catch (error) {
                this.logger.error(`Error destroying connection ${name}:`, error);
            }
        }
        
        // Force close all servers
        for (const [name, server] of this.servers) {
            try {
                server.close();
            } catch (error) {
                this.logger.error(`Error closing server ${name}:`, error);
            }
        }
        
        // Exit process
        process.exit(1);
    }

    /**
     * Resource management methods
     */
    
    registerServer(name, server) {
        this.servers.set(name, server);
        
        // Track connections
        server.on('connection', (socket) => {
            const connId = this.generateConnectionId();
            this.connections.set(connId, socket);
            
            socket.on('close', () => {
                this.connections.delete(connId);
            });
        });
        
        // Track requests
        server.on('request', (req, res) => {
            const reqId = this.generateRequestId();
            this.activeRequests.set(reqId, { req, res, startTime: Date.now() });
            
            res.on('finish', () => {
                this.activeRequests.delete(reqId);
                this.metrics.requestsCompleted++;
            });
        });
        
        this.logger.debug(`Registered server: ${name}`);
    }
    
    registerService(name, service, dependencies = []) {
        this.services.set(name, service);
        
        // Update stop order based on dependencies
        this.updateServiceStopOrder(name, dependencies);
        
        this.logger.debug(`Registered service: ${name}`);
    }
    
    registerDatabase(name, connection) {
        this.databases.set(name, connection);
        this.logger.debug(`Registered database: ${name}`);
    }
    
    registerQueue(name, queue) {
        this.messageQueues.set(name, queue);
        this.logger.debug(`Registered queue: ${name}`);
    }
    
    registerTimer(name, timer) {
        this.timers.set(name, timer);
        return timer;
    }
    
    registerInterval(name, interval) {
        this.intervals.set(name, interval);
        return interval;
    }
    
    registerStream(name, stream) {
        this.streams.set(name, stream);
        return stream;
    }
    
    registerProcess(name, process) {
        this.processes.set(name, process);
        return process;
    }
    
    registerCleanupHandler(handler, options = {}) {
        const cleanupHandler = {
            handler,
            phase: options.phase || 'cleanup',
            priority: options.priority || 0,
            timeout: options.timeout || 5000,
            name: options.name || 'anonymous'
        };
        
        this.cleanupHandlers.push(cleanupHandler);
        this.cleanupHandlers.sort((a, b) => b.priority - a.priority);
        
        return () => this.unregisterCleanupHandler(cleanupHandler);
    }
    
    registerEmergencyHandler(handler) {
        this.emergencyHandlers.push(handler);
    }
    
    registerFinalHandler(handler) {
        this.finalHandlers.push(handler);
    }
    
    unregisterCleanupHandler(handler) {
        const index = this.cleanupHandlers.indexOf(handler);
        if (index !== -1) {
            this.cleanupHandlers.splice(index, 1);
        }
    }

    /**
     * Connection management
     */
    
    async stopAcceptingConnections(name, server) {
        return new Promise((resolve) => {
            this.logger.info(`Stopping new connections for server: ${name}`);
            
            // Stop accepting new connections
            server.close(() => {
                this.logger.info(`Server ${name} stopped accepting connections`);
                resolve();
            });
            
            // Don't wait forever
            setTimeout(() => {
                this.logger.warn(`Server ${name} close timeout`);
                resolve();
            }, this.config.connectionTimeout);
        });
    }
    
    sendCloseHeaders(connection) {
        try {
            if (connection.writable && !connection.destroyed) {
                // Send Connection: close header
                connection.write('Connection: close\r\n');
            }
        } catch (error) {
            this.logger.debug('Error sending close headers:', error);
        }
    }
    
    async forceCloseConnections() {
        const promises = [];
        
        for (const [id, conn] of this.connections) {
            promises.push(this.forceCloseConnection(id, conn));
        }
        
        await Promise.all(promises);
    }
    
    async forceCloseConnection(id, connection) {
        return new Promise((resolve) => {
            try {
                connection.destroy();
                this.connections.delete(id);
                resolve();
            } catch (error) {
                this.logger.error(`Error force closing connection ${id}:`, error);
                resolve();
            }
        });
    }

    /**
     * Service management
     */
    
    async stopService(name, service) {
        try {
            this.logger.info(`Stopping service: ${name}`);
            
            if (typeof service.stop === 'function') {
                await this.withTimeout(
                    service.stop(),
                    this.config.connectionTimeout,
                    `Service ${name} stop`
                );
            } else if (typeof service.close === 'function') {
                await this.withTimeout(
                    service.close(),
                    this.config.connectionTimeout,
                    `Service ${name} close`
                );
            } else if (typeof service.shutdown === 'function') {
                await this.withTimeout(
                    service.shutdown(),
                    this.config.connectionTimeout,
                    `Service ${name} shutdown`
                );
            }
            
            this.services.delete(name);
            this.logger.info(`Service ${name} stopped`);
            
        } catch (error) {
            this.logger.error(`Error stopping service ${name}:`, error);
            throw error;
        }
    }
    
    updateServiceStopOrder(name, dependencies) {
        // Remove from current position if exists
        const index = this.serviceStopOrder.indexOf(name);
        if (index !== -1) {
            this.serviceStopOrder.splice(index, 1);
        }
        
        // Find the latest dependency position
        let position = 0;
        for (const dep of dependencies) {
            const depIndex = this.serviceStopOrder.indexOf(dep);
            if (depIndex !== -1) {
                position = Math.max(position, depIndex + 1);
            }
        }
        
        // Insert at correct position
        this.serviceStopOrder.splice(position, 0, name);
    }

    /**
     * Database management
     */
    
    async closeDatabase(name, connection) {
        try {
            this.logger.info(`Closing database: ${name}`);
            
            if (typeof connection.close === 'function') {
                await this.withTimeout(
                    connection.close(),
                    this.config.connectionTimeout,
                    `Database ${name} close`
                );
            } else if (typeof connection.end === 'function') {
                await this.withTimeout(
                    connection.end(),
                    this.config.connectionTimeout,
                    `Database ${name} end`
                );
            } else if (typeof connection.disconnect === 'function') {
                await this.withTimeout(
                    connection.disconnect(),
                    this.config.connectionTimeout,
                    `Database ${name} disconnect`
                );
            }
            
            this.databases.delete(name);
            this.logger.info(`Database ${name} closed`);
            
        } catch (error) {
            this.logger.error(`Error closing database ${name}:`, error);
            throw error;
        }
    }

    /**
     * Queue management
     */
    
    async closeQueue(name, queue) {
        try {
            this.logger.info(`Closing queue: ${name}`);
            
            if (typeof queue.close === 'function') {
                await this.withTimeout(
                    queue.close(),
                    this.config.connectionTimeout,
                    `Queue ${name} close`
                );
            } else if (typeof queue.disconnect === 'function') {
                await this.withTimeout(
                    queue.disconnect(),
                    this.config.connectionTimeout,
                    `Queue ${name} disconnect`
                );
            }
            
            this.messageQueues.delete(name);
            this.logger.info(`Queue ${name} closed`);
            
        } catch (error) {
            this.logger.error(`Error closing queue ${name}:`, error);
            throw error;
        }
    }

    /**
     * Stream management
     */
    
    async closeStream(name, stream) {
        return new Promise((resolve) => {
            try {
                if (stream.destroyed) {
                    resolve();
                    return;
                }
                
                stream.on('close', () => {
                    this.logger.debug(`Stream ${name} closed`);
                    resolve();
                });
                
                stream.on('error', (error) => {
                    this.logger.error(`Stream ${name} error:`, error);
                    resolve();
                });
                
                if (typeof stream.end === 'function') {
                    stream.end();
                } else if (typeof stream.destroy === 'function') {
                    stream.destroy();
                }
                
                // Timeout
                setTimeout(() => {
                    this.logger.warn(`Stream ${name} close timeout`);
                    resolve();
                }, 1000);
                
            } catch (error) {
                this.logger.error(`Error closing stream ${name}:`, error);
                resolve();
            }
        });
    }

    /**
     * Process management
     */
    
    async terminateProcess(name, proc) {
        return new Promise((resolve) => {
            try {
                if (proc.killed) {
                    resolve();
                    return;
                }
                
                let killed = false;
                
                proc.on('exit', () => {
                    if (!killed) {
                        killed = true;
                        this.logger.debug(`Process ${name} terminated`);
                        resolve();
                    }
                });
                
                // Send SIGTERM
                proc.kill('SIGTERM');
                
                // Force kill after timeout
                setTimeout(() => {
                    if (!killed) {
                        this.logger.warn(`Force killing process ${name}`);
                        proc.kill('SIGKILL');
                        killed = true;
                        resolve();
                    }
                }, 5000);
                
            } catch (error) {
                this.logger.error(`Error terminating process ${name}:`, error);
                resolve();
            }
        });
    }

    /**
     * Handler execution
     */
    
    async executeHandlers(handlers) {
        for (const handler of handlers) {
            try {
                await this.withTimeout(
                    handler.handler(),
                    handler.timeout,
                    `Handler ${handler.name}`
                );
            } catch (error) {
                this.logger.error(`Handler ${handler.name} failed:`, error);
                // Continue with other handlers
            }
        }
    }
    
    async executeEmergencyHandlers(error) {
        this.logger.info('Executing emergency handlers');
        
        for (const handler of this.emergencyHandlers) {
            try {
                await handler(error);
            } catch (handlerError) {
                this.logger.error('Emergency handler failed:', handlerError);
            }
        }
    }

    /**
     * Signal handling
     */
    
    setupSignalHandlers() {
        // Graceful shutdown signals
        for (const signal of this.config.signals.graceful) {
            process.on(signal, () => {
                this.logger.info(`Received ${signal} signal`);
                this.shutdown(`signal:${signal}`);
            });
        }
        
        // Reload signal
        for (const signal of this.config.signals.reload) {
            process.on(signal, () => {
                this.logger.info(`Received ${signal} signal`);
                this.emit('reload', signal);
            });
        }
        
        // Status signal
        for (const signal of this.config.signals.status) {
            process.on(signal, () => {
                this.logger.info(`Received ${signal} signal`);
                this.logStatus();
            });
        }
        
        // Debug signal
        for (const signal of this.config.signals.debug) {
            process.on(signal, () => {
                this.logger.info(`Received ${signal} signal`);
                this.logDebugInfo();
            });
        }
        
        // Process events
        process.on('beforeExit', (code) => {
            if (!this.isShuttingDown) {
                this.logger.info(`Process about to exit with code ${code}`);
                this.shutdown('beforeExit');
            }
        });
        
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception:', error);
            this.shutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection:', reason);
            // Don't shutdown on unhandled rejection by default
        });
    }

    /**
     * Cluster coordination
     */
    
    async coordinateClusterShutdown() {
        if (!this.isClusterMode) return;
        
        if (cluster.isMaster) {
            await this.coordinateMasterShutdown();
        } else {
            await this.coordinateWorkerShutdown();
        }
    }
    
    async coordinateMasterShutdown() {
        this.logger.info('Coordinating master shutdown');
        
        const workers = Object.values(cluster.workers);
        const workerCount = workers.length;
        
        // Stagger worker shutdowns
        for (let i = 0; i < workerCount; i += this.config.cluster.maxConcurrentShutdowns) {
            const batch = workers.slice(i, i + this.config.cluster.maxConcurrentShutdowns);
            
            await Promise.all(batch.map(worker => this.shutdownWorker(worker)));
            
            // Delay before next batch
            if (i + this.config.cluster.maxConcurrentShutdowns < workerCount) {
                await this.delay(this.config.cluster.staggerDelay);
            }
        }
    }
    
    async shutdownWorker(worker) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.logger.warn(`Worker ${worker.id} shutdown timeout, killing`);
                worker.kill();
                resolve();
            }, this.config.gracefulTimeout);
            
            worker.on('exit', () => {
                clearTimeout(timeout);
                this.logger.info(`Worker ${worker.id} exited`);
                resolve();
            });
            
            worker.send('shutdown');
        });
    }
    
    async coordinateWorkerShutdown() {
        this.logger.info(`Worker ${this.workerId} coordinating shutdown`);
        
        // Notify master
        if (process.send) {
            process.send({ type: 'shutting-down', workerId: this.workerId });
        }
        
        // Perform worker shutdown
        await this.performShutdown({});
        
        // Notify completion
        if (process.send) {
            process.send({ type: 'shutdown-complete', workerId: this.workerId });
        }
    }

    /**
     * State persistence
     */
    
    async saveState() {
        if (!this.statePersistence.enabled) return;
        
        const state = {
            timestamp: Date.now(),
            phase: this.shutdownPhase,
            connections: this.connections.size,
            requests: this.activeRequests.size,
            services: Array.from(this.services.keys()),
            databases: Array.from(this.databases.keys()),
            queues: Array.from(this.messageQueues.keys()),
            metrics: this.metrics
        };
        
        try {
            const fs = require('fs').promises;
            await fs.writeFile(
                this.statePersistence.path,
                JSON.stringify(state, null, 2)
            );
            
            this.logger.debug('State saved');
        } catch (error) {
            this.logger.error('Error saving state:', error);
        }
    }
    
    async saveFinalState() {
        const finalState = {
            timestamp: Date.now(),
            duration: Date.now() - this.shutdownStartTime,
            reason: this.shutdownReason,
            metrics: this.metrics,
            success: true
        };
        
        try {
            const fs = require('fs').promises;
            await fs.writeFile(
                `${this.statePersistence.path}.final`,
                JSON.stringify(finalState, null, 2)
            );
        } catch (error) {
            this.logger.error('Error saving final state:', error);
        }
    }

    /**
     * Notifications
     */
    
    async notifyShutdown() {
        if (!this.config.notifications.enabled) return;
        
        const notification = {
            event: 'shutdown',
            timestamp: Date.now(),
            reason: this.shutdownReason,
            hostname: os.hostname(),
            service: 'api-gateway'
        };
        
        const promises = [];
        
        // Webhooks
        for (const webhook of this.config.notifications.webhooks) {
            promises.push(this.sendWebhook(webhook, notification));
        }
        
        // Email
        if (this.config.notifications.email) {
            promises.push(this.sendEmail(notification));
        }
        
        // Slack
        if (this.config.notifications.slack) {
            promises.push(this.sendSlack(notification));
        }
        
        await Promise.allSettled(promises);
    }
    
    async sendWebhook(url, data) {
        // Implementation would send actual webhook
        this.logger.debug(`Sending webhook to ${url}`);
    }
    
    async sendEmail(data) {
        // Implementation would send actual email
        this.logger.debug('Sending email notification');
    }
    
    async sendSlack(data) {
        // Implementation would send actual Slack message
        this.logger.debug('Sending Slack notification');
    }

    /**
     * Monitoring and debugging
     */
    
    startMonitoring() {
        if (!this.config.monitoring.enabled) return;
        
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
        }, this.config.monitoring.metricsInterval);
    }
    
    collectMetrics() {
        const metrics = {
            connections: this.connections.size,
            requests: this.activeRequests.size,
            services: this.services.size,
            databases: this.databases.size,
            queues: this.messageQueues.size,
            timers: this.timers.size,
            intervals: this.intervals.size,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
        
        this.emit('metrics', metrics);
    }
    
    logStatus() {
        const status = {
            isShuttingDown: this.isShuttingDown,
            phase: this.shutdownPhase,
            connections: this.connections.size,
            activeRequests: this.activeRequests.size,
            services: Array.from(this.services.keys()),
            databases: Array.from(this.databases.keys()),
            queues: Array.from(this.messageQueues.keys()),
            metrics: this.metrics
        };
        
        this.logger.info('Shutdown handler status:', status);
    }
    
    logDebugInfo() {
        const debug = {
            config: this.config,
            handlers: {
                cleanup: this.cleanupHandlers.length,
                emergency: this.emergencyHandlers.length,
                final: this.finalHandlers.length
            },
            resources: {
                servers: Array.from(this.servers.keys()),
                services: Array.from(this.services.keys()),
                databases: Array.from(this.databases.keys()),
                queues: Array.from(this.messageQueues.keys()),
                timers: Array.from(this.timers.keys()),
                intervals: Array.from(this.intervals.keys()),
                streams: Array.from(this.streams.keys()),
                processes: Array.from(this.processes.keys())
            }
        };
        
        this.logger.debug('Shutdown handler debug info:', debug);
    }

    /**
     * Utility methods
     */
    
    withTimeout(promise, timeout, operation) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`${operation} timeout after ${timeout}ms`));
            }, timeout);
            
            promise
                .then(resolve)
                .catch(reject)
                .finally(() => clearTimeout(timer));
        });
    }
    
    waitForCondition(condition, timeout, description) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`Timeout waiting for ${description}`));
                } else {
                    setTimeout(check, 100);
                }
            };
            
            check();
        });
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    generateConnectionId() {
        return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Gets shutdown metrics
     * @returns {Object} Shutdown metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            isShuttingDown: this.isShuttingDown,
            currentPhase: this.shutdownPhase,
            activeConnections: this.connections.size,
            activeRequests: this.activeRequests.size,
            resources: {
                servers: this.servers.size,
                services: this.services.size,
                databases: this.databases.size,
                queues: this.messageQueues.size
            }
        };
    }
}

// Global shutdown handler instance for module-level graceful shutdown
let globalShutdownHandler = null;
let globalShutdownRegistered = false;

/**
 * Creates and configures a graceful shutdown handler for the application
 * @param {Object} config - Shutdown configuration
 * @param {Object} logger - Logger instance
 * @returns {Object} Shutdown management interface
 */
function gracefulShutdown(config = {}, logger = console) {
    // Create shutdown handler if not exists
    if (!globalShutdownHandler) {
        globalShutdownHandler = new ShutdownHandler(config, logger);
        
        // Register global signal handlers once
        if (!globalShutdownRegistered) {
            const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
            
            signals.forEach(signal => {
                process.on(signal, async () => {
                    logger.info(`Received ${signal} signal - initiating graceful shutdown`);
                    try {
                        await globalShutdownHandler.shutdown(`signal:${signal}`);
                        process.exit(0);
                    } catch (error) {
                        logger.error('Graceful shutdown failed:', error);
                        process.exit(1);
                    }
                });
            });
            
            globalShutdownRegistered = true;
        }
    }
    
    // Return interface for managing shutdown
    return {
        /**
         * Register a server for graceful shutdown
         * @param {string} name - Server name
         * @param {Object} server - Server instance
         */
        registerServer: (name, server) => {
            globalShutdownHandler.registerServer(name, server);
        },
        
        /**
         * Register a service for graceful shutdown
         * @param {string} name - Service name
         * @param {Object} service - Service instance
         * @param {Array} dependencies - Service dependencies
         */
        registerService: (name, service, dependencies = []) => {
            globalShutdownHandler.registerService(name, service, dependencies);
        },
        
        /**
         * Register a database connection for graceful shutdown
         * @param {string} name - Database name
         * @param {Object} connection - Database connection
         */
        registerDatabase: (name, connection) => {
            globalShutdownHandler.registerDatabase(name, connection);
        },
        
        /**
         * Register a message queue for graceful shutdown
         * @param {string} name - Queue name
         * @param {Object} queue - Queue instance
         */
        registerQueue: (name, queue) => {
            globalShutdownHandler.registerQueue(name, queue);
        },
        
        /**
         * Register a timer for cleanup
         * @param {string} name - Timer name
         * @param {Object} timer - Timer reference
         */
        registerTimer: (name, timer) => {
            return globalShutdownHandler.registerTimer(name, timer);
        },
        
        /**
         * Register an interval for cleanup
         * @param {string} name - Interval name
         * @param {Object} interval - Interval reference
         */
        registerInterval: (name, interval) => {
            return globalShutdownHandler.registerInterval(name, interval);
        },
        
        /**
         * Register a cleanup handler
         * @param {Function} handler - Cleanup function
         * @param {Object} options - Handler options
         */
        registerCleanupHandler: (handler, options = {}) => {
            return globalShutdownHandler.registerCleanupHandler(handler, options);
        },
        
        /**
         * Register an emergency handler
         * @param {Function} handler - Emergency handler function
         */
        registerEmergencyHandler: (handler) => {
            globalShutdownHandler.registerEmergencyHandler(handler);
        },
        
        /**
         * Manually trigger graceful shutdown
         * @param {string} reason - Shutdown reason
         * @param {Object} options - Shutdown options
         */
        shutdown: (reason = 'manual', options = {}) => {
            return globalShutdownHandler.shutdown(reason, options);
        },
        
        /**
         * Get shutdown metrics
         * @returns {Object} Shutdown metrics
         */
        getMetrics: () => {
            return globalShutdownHandler.getMetrics();
        },
        
        /**
         * Check if shutdown is in progress
         * @returns {boolean} Shutdown status
         */
        isShuttingDown: () => {
            return globalShutdownHandler.isShuttingDown;
        },
        
        /**
         * Get the shutdown handler instance for advanced usage
         * @returns {ShutdownHandler} Shutdown handler instance
         */
        getHandler: () => {
            return globalShutdownHandler;
        }
    };
}

module.exports = ShutdownHandler;
module.exports.gracefulShutdown = gracefulShutdown;