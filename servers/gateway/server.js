'use strict';

/**
 * @fileoverview Enterprise API Gateway Server - Main entry point for the InsightSerenity Platform Gateway
 * @module servers/gateway/server
 * @requires dotenv
 * @requires cluster
 * @requires os
 * @requires module:servers/gateway/app
 * @requires module:servers/gateway/config
 * @requires module:servers/gateway/services/service-registry
 * @requires module:servers/gateway/services/health-monitor
 * @requires module:servers/gateway/services/metrics-collector
 * @requires module:servers/gateway/services/trace-manager
 * @requires module:servers/gateway/services/cache-manager
 * @requires module:servers/gateway/services/circuit-breaker-manager
 * @requires module:servers/gateway/utils/logger
 * @requires module:servers/gateway/utils/shutdown-handler
 */

require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const { GatewayApplication } = require('./app');
const { ConfigManager } = require('./config');
const { Logger } = require('./utils/logger');
const { ServiceRegistry } = require('./services/service-registry');
const { HealthMonitor } = require('./services/health-monitor');
const { MetricsCollector } = require('./services/metrics-collector');
const { TraceManager } = require('./services/trace-manager');
const { CacheManager } = require('./services/cache-manager');
const { CircuitBreakerManager } = require('./services/circuit-breaker-manager');
// const { gracefulShutdown } = require('./utils/shutdown-handler');

/**
 * GatewayServer class orchestrates the entire gateway lifecycle including initialization,
 * startup, monitoring, and graceful shutdown. It manages all critical components required
 * for enterprise-grade API gateway functionality including service discovery, health monitoring,
 * distributed tracing, caching, and circuit breaking capabilities.
 * 
 * @class GatewayServer
 * @property {GatewayApplication} app - Express application instance
 * @property {Object} server - HTTP server instance
 * @property {ConfigManager} config - Configuration management instance
 * @property {Logger} logger - Centralized logging instance
 * @property {ServiceRegistry} serviceRegistry - Service discovery and registration
 * @property {HealthMonitor} healthMonitor - Service health monitoring
 * @property {MetricsCollector} metricsCollector - Metrics collection and aggregation
 * @property {TraceManager} traceManager - Distributed tracing management
 * @property {CacheManager} cacheManager - Centralized cache management
 * @property {CircuitBreakerManager} circuitBreakerManager - Circuit breaker pattern implementation
 * @property {boolean} isShuttingDown - Shutdown state flag
 */
class GatewayServer {
    /**
     * Creates an instance of GatewayServer
     * @constructor
     */
    constructor() {
        this.app = null;
        this.server = null;
        this.config = null;
        this.logger = null;
        this.serviceRegistry = null;
        this.healthMonitor = null;
        this.metricsCollector = null;
        this.traceManager = null;
        this.cacheManager = null;
        this.circuitBreakerManager = null;
        this.isShuttingDown = false;
        this.startTime = Date.now();
    }

    /**
     * Initializes all server components in the correct dependency order.
     * This method ensures all services are properly configured before server startup.
     * 
     * @async
     * @throws {Error} Throws error if any component fails to initialize
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Initialize configuration first as other components depend on it
            this.config = new ConfigManager();
            await this.config.load();
            await this.config.validateConfiguration();

            // Initialize logger with configuration
            this.logger = new Logger(this.config.get('logging'));
            this.logger.info('Gateway Server Initialization Started', {
                environment: process.env.NODE_ENV,
                nodeVersion: process.version,
                pid: process.pid,
                platform: process.platform,
                architecture: process.arch,
                memory: {
                    total: os.totalmem(),
                    free: os.freemem()
                }
            });

            // Initialize distributed tracing for request correlation
            this.traceManager = new TraceManager(this.config.get('tracing'));
            await this.traceManager.initialize();
            this.logger.info('Distributed tracing initialized');

            // Initialize cache manager for response caching and session management
            this.cacheManager = new CacheManager(this.config.get('cache'));
            await this.cacheManager.connect();
            this.logger.info('Cache manager connected');

            // Initialize service registry for service discovery
            this.serviceRegistry = new ServiceRegistry(this.config.get('services'));
            await this.serviceRegistry.initialize();
            await this.serviceRegistry.discoverServices();
            this.logger.info('Service registry initialized', {
                registeredServices: this.serviceRegistry.getServiceCount()
            });

            // Initialize circuit breaker manager for fault tolerance
            this.circuitBreakerManager = new CircuitBreakerManager(
                this.config.get('circuitBreaker'),
                this.serviceRegistry,
                this.logger
            );
            await this.circuitBreakerManager.initialize();
            this.logger.info('Circuit breaker manager initialized');

            // Initialize health monitor for service health checks
            this.healthMonitor = new HealthMonitor(
                this.serviceRegistry,
                this.config.get('healthCheck'),
                this.circuitBreakerManager
            );
            await this.healthMonitor.start();
            this.logger.info('Health monitor started');

            // Initialize metrics collector for monitoring
            this.metricsCollector = new MetricsCollector(this.config.get('metrics'));
            await this.metricsCollector.initialize();
            this.registerSystemMetrics();
            this.logger.info('Metrics collector initialized');

            // Create and configure the main application
            this.app = new GatewayApplication({
                config: this.config,
                logger: this.logger,
                serviceRegistry: this.serviceRegistry,
                healthMonitor: this.healthMonitor,
                metricsCollector: this.metricsCollector,
                traceManager: this.traceManager,
                cacheManager: this.cacheManager,
                circuitBreakerManager: this.circuitBreakerManager
            });

            await this.app.initialize();
            this.logger.info('Gateway application initialized');

            // Validate all components are operational
            await this.performStartupHealthCheck();

            this.logger.info('Gateway Server Initialization Completed Successfully', {
                initializationTime: Date.now() - this.startTime
            });
        } catch (error) {
            console.error('FATAL: Failed to initialize gateway server:', error);
            await this.emergencyShutdown(error);
            process.exit(1);
        }
    }

    /**
     * Registers system-level metrics for monitoring
     * @private
     */
    registerSystemMetrics() {
        // Register memory metrics
        setInterval(() => {
            const memUsage = process.memoryUsage();
            this.metricsCollector.registerGauge('gateway_memory_heap_used_bytes', memUsage.heapUsed);
            this.metricsCollector.registerGauge('gateway_memory_heap_total_bytes', memUsage.heapTotal);
            this.metricsCollector.registerGauge('gateway_memory_rss_bytes', memUsage.rss);
            this.metricsCollector.registerGauge('gateway_memory_external_bytes', memUsage.external);
        }, 30000);

        // Register CPU metrics
        setInterval(() => {
            const cpuUsage = process.cpuUsage();
            this.metricsCollector.registerGauge('gateway_cpu_user_seconds', cpuUsage.user);
            this.metricsCollector.registerGauge('gateway_cpu_system_seconds', cpuUsage.system);
        }, 30000);

        // Register uptime metric
        setInterval(() => {
            this.metricsCollector.registerGauge('gateway_uptime_seconds', process.uptime());
        }, 60000);
    }

    /**
     * Performs comprehensive health check before server startup
     * @private
     * @async
     * @throws {Error} Throws error if critical components are unhealthy
     */
    async performStartupHealthCheck() {
        const healthStatus = await this.healthMonitor.getSystemHealth();
        
        if (healthStatus.status === 'unhealthy') {
            const unhealthyComponents = Object.entries(healthStatus.components)
                .filter(([, status]) => status === 'unhealthy')
                .map(([name]) => name);
            
            throw new Error(`Critical components unhealthy: ${unhealthyComponents.join(', ')}`);
        }

        this.logger.info('Startup health check passed', healthStatus);
    }

    /**
     * Starts the HTTP server and begins accepting connections
     * @async
     * @returns {Promise<void>}
     */
    async start() {
        const port = this.config.get('server.port') || 3000;
        const host = this.config.get('server.host') || '0.0.0.0';
        const backlog = this.config.get('server.backlog') || 511;

        return new Promise((resolve, reject) => {
            this.server = this.app.getExpressApp().listen(port, host, backlog, (error) => {
                if (error) {
                    this.logger.error('Failed to start server', error);
                    reject(error);
                    return;
                }

                const serverInfo = {
                    host,
                    port,
                    environment: process.env.NODE_ENV,
                    pid: process.pid,
                    workerId: cluster.worker?.id || 'master',
                    startupTime: Date.now() - this.startTime,
                    nodeVersion: process.version,
                    platform: process.platform
                };

                this.logger.info('Gateway Server Started Successfully', serverInfo);

                // Register server status metrics
                this.metricsCollector.registerGauge('gateway_server_status', 1, {
                    host,
                    port,
                    environment: process.env.NODE_ENV
                });

                // Emit server ready event
                process.emit('gateway:ready', serverInfo);

                resolve();
            });

            // Configure server timeouts for production readiness
            this.configureServerTimeouts();

            // Setup server event handlers
            this.setupServerEventHandlers();

            // Enable keep-alive for better connection management
            this.server.on('connection', (socket) => {
                socket.setKeepAlive(true, 60000);
                socket.setNoDelay(true);
            });
        });
    }

    /**
     * Configures server timeout settings for production environment
     * @private
     */
    configureServerTimeouts() {
        const timeoutConfig = this.config.get('server.timeouts') || {};
        
        this.server.timeout = timeoutConfig.request || 120000;
        this.server.keepAliveTimeout = timeoutConfig.keepAlive || 65000;
        this.server.headersTimeout = timeoutConfig.headers || 66000;
        this.server.requestTimeout = timeoutConfig.request || 120000;
        
        this.logger.info('Server timeouts configured', timeoutConfig);
    }

    /**
     * Sets up server event handlers for error management
     * @private
     */
    setupServerEventHandlers() {
        this.server.on('error', this.handleServerError.bind(this));
        this.server.on('clientError', this.handleClientError.bind(this));
        this.server.on('close', this.handleServerClose.bind(this));
        this.server.on('listening', this.handleServerListening.bind(this));
    }

    /**
     * Handles server-level errors
     * @private
     * @param {Error} error - Server error object
     */
    handleServerError(error) {
        if (error.syscall !== 'listen') {
            this.logger.error('Unexpected server error', error);
            throw error;
        }

        const port = this.config.get('server.port');
        const errorHandlers = {
            'EACCES': () => {
                this.logger.error(`Port ${port} requires elevated privileges`);
                process.exit(1);
            },
            'EADDRINUSE': () => {
                this.logger.error(`Port ${port} is already in use`);
                process.exit(1);
            },
            'ENOTFOUND': () => {
                this.logger.error('Hostname not found');
                process.exit(1);
            }
        };

        const handler = errorHandlers[error.code];
        if (handler) {
            handler();
        } else {
            throw error;
        }
    }

    /**
     * Handles client connection errors
     * @private
     * @param {Error} error - Client error object
     * @param {Socket} socket - Client socket
     */
    handleClientError(error, socket) {
        this.metricsCollector.incrementCounter('gateway_client_errors_total', {
            error_code: error.code
        });

        this.logger.warn('Client error detected', {
            error: error.message,
            code: error.code,
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort
        });

        if (error.code === 'ECONNRESET' || !socket.writable) {
            socket.destroy();
            return;
        }

        // Send proper HTTP error response
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }

    /**
     * Handles server close event
     * @private
     */
    handleServerClose() {
        this.logger.info('Server closed');
        this.metricsCollector.registerGauge('gateway_server_status', 0);
    }

    /**
     * Handles server listening event
     * @private
     */
    handleServerListening() {
        const address = this.server.address();
        this.logger.info('Server listening', {
            address: address.address,
            port: address.port,
            family: address.family
        });
    }

    /**
     * Performs graceful shutdown of the server and all components
     * @async
     * @param {string} signal - Signal that triggered shutdown
     * @returns {Promise<void>}
     */
    async shutdown(signal) {
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown already in progress, ignoring signal', { signal });
            return;
        }

        this.isShuttingDown = true;
        const shutdownStartTime = Date.now();

        this.logger.info(`Gateway Server Shutdown Initiated`, {
            signal,
            uptime: process.uptime(),
            pid: process.pid
        });

        try {
            // Set shutdown deadline
            const shutdownDeadline = setTimeout(() => {
                this.logger.error('Graceful shutdown timeout exceeded, forcing exit');
                process.exit(1);
            }, this.config.get('server.shutdownTimeout') || 30000);

            // Stop accepting new connections
            if (this.server) {
                this.logger.info('Closing server connections');
                await this.closeServerConnections();
            }

            // Stop health monitoring
            if (this.healthMonitor) {
                this.logger.info('Stopping health monitor');
                await this.healthMonitor.stop();
            }

            // Close circuit breakers
            if (this.circuitBreakerManager) {
                this.logger.info('Closing circuit breakers');
                await this.circuitBreakerManager.shutdown();
            }

            // Disconnect from service registry
            if (this.serviceRegistry) {
                this.logger.info('Deregistering from service registry');
                await this.serviceRegistry.deregister();
                await this.serviceRegistry.disconnect();
            }

            // Disconnect cache
            if (this.cacheManager) {
                this.logger.info('Disconnecting cache');
                await this.cacheManager.disconnect();
            }

            // Flush metrics
            if (this.metricsCollector) {
                this.logger.info('Flushing metrics');
                await this.metricsCollector.flush();
                await this.metricsCollector.shutdown();
            }

            // Flush traces
            if (this.traceManager) {
                this.logger.info('Flushing traces');
                await this.traceManager.shutdown();
            }

            // Cleanup application
            if (this.app) {
                this.logger.info('Cleaning up application');
                await this.app.cleanup();
            }

            clearTimeout(shutdownDeadline);

            const shutdownTime = Date.now() - shutdownStartTime;
            this.logger.info('Gateway Server Shutdown Completed', {
                shutdownTime,
                signal
            });

            process.exit(0);
        } catch (error) {
            this.logger.error('Error during graceful shutdown', error);
            process.exit(1);
        }
    }

    /**
     * Closes server connections gracefully
     * @private
     * @async
     * @returns {Promise<void>}
     */
    async closeServerConnections() {
        return new Promise((resolve) => {
            this.server.close((error) => {
                if (error) {
                    this.logger.error('Error closing server', error);
                }
                resolve();
            });

            // Force close after timeout
            setTimeout(() => {
                this.logger.warn('Forcing server close due to timeout');
                resolve();
            }, 10000);
        });
    }

    /**
     * Performs emergency shutdown on critical failures
     * @private
     * @async
     * @param {Error} error - Critical error that triggered emergency shutdown
     */
    async emergencyShutdown(error) {
        console.error('EMERGENCY SHUTDOWN INITIATED:', error);
        
        try {
            if (this.logger) {
                this.logger.fatal('Emergency shutdown', error);
            }
            
            // Attempt minimal cleanup
            if (this.server) {
                this.server.close();
            }
            
            if (this.cacheManager) {
                await this.cacheManager.disconnect();
            }
        } catch (cleanupError) {
            console.error('Error during emergency cleanup:', cleanupError);
        }
    }
}

/**
 * ClusterManager handles multi-process deployment for production environments.
 * It manages worker processes, handles worker failures, and coordinates graceful
 * cluster-wide shutdowns.
 * 
 * @class ClusterManager
 */
class ClusterManager {
    /**
     * Creates an instance of ClusterManager
     * @constructor
     */
    constructor() {
        this.numWorkers = this.calculateWorkerCount();
        this.logger = new Logger({ 
            service: 'cluster-manager',
            processType: 'master'
        });
        this.workers = new Map();
        this.isShuttingDown = false;
    }

    /**
     * Calculates optimal worker count based on CPU cores and configuration
     * @private
     * @returns {number} Number of workers to spawn
     */
    calculateWorkerCount() {
        const envWorkers = parseInt(process.env.GATEWAY_WORKERS, 10);
        const cpuCount = os.cpus().length;
        
        if (envWorkers && envWorkers > 0) {
            return Math.min(envWorkers, cpuCount * 2);
        }
        
        // Use CPU count for production, limited workers for development
        return process.env.NODE_ENV === 'production' 
            ? cpuCount 
            : Math.min(2, cpuCount);
    }

    /**
     * Starts the cluster manager or single instance based on environment
     */
    start() {
        if (!this.shouldUseCluster()) {
            this.startSingleInstance();
            return;
        }

        if (cluster.isMaster) {
            this.startMaster();
        } else {
            this.startWorker();
        }
    }

    /**
     * Determines if clustering should be used
     * @private
     * @returns {boolean} True if clustering should be enabled
     */
    shouldUseCluster() {
        return process.env.NODE_ENV === 'production' && 
               process.env.DISABLE_CLUSTERING !== 'true' &&
               this.numWorkers > 1;
    }

    /**
     * Starts the master process and spawns workers
     * @private
     */
    startMaster() {
        this.logger.info('Master process started', {
            pid: process.pid,
            workers: this.numWorkers,
            platform: process.platform,
            nodeVersion: process.version,
            cpus: os.cpus().length
        });

        // Setup cluster settings
        cluster.setupMaster({
            exec: __filename,
            silent: false
        });

        // Fork initial workers
        for (let i = 0; i < this.numWorkers; i++) {
            this.forkWorker(i);
        }

        // Handle cluster events
        this.setupClusterEventHandlers();

        // Handle master process signals
        this.setupMasterSignalHandlers();

        // Monitor cluster health
        this.startClusterMonitoring();
    }

    /**
     * Sets up cluster event handlers
     * @private
     */
    setupClusterEventHandlers() {
        cluster.on('fork', (worker) => {
            this.logger.info('Worker forked', {
                workerId: worker.id,
                pid: worker.process.pid
            });
        });

        cluster.on('online', (worker) => {
            this.logger.info('Worker online', {
                workerId: worker.id,
                pid: worker.process.pid
            });
        });

        cluster.on('listening', (worker, address) => {
            this.logger.info('Worker listening', {
                workerId: worker.id,
                pid: worker.process.pid,
                address: address.address,
                port: address.port
            });
        });

        cluster.on('disconnect', (worker) => {
            this.logger.warn('Worker disconnected', {
                workerId: worker.id,
                pid: worker.process.pid
            });
        });

        cluster.on('exit', this.handleWorkerExit.bind(this));

        cluster.on('message', this.handleWorkerMessage.bind(this));
    }

    /**
     * Handles worker exit events
     * @private
     * @param {Worker} worker - Worker that exited
     * @param {number} code - Exit code
     * @param {string} signal - Exit signal
     */
    handleWorkerExit(worker, code, signal) {
        const exitInfo = {
            workerId: worker.id,
            pid: worker.process.pid,
            code,
            signal,
            suicide: worker.exitedAfterDisconnect
        };

        this.workers.delete(worker.id);

        if (!worker.exitedAfterDisconnect && !this.isShuttingDown) {
            this.logger.error('Worker died unexpectedly', exitInfo);
            
            // Restart worker with exponential backoff
            const restartDelay = this.calculateRestartDelay(worker.id);
            
            setTimeout(() => {
                if (!this.isShuttingDown) {
                    this.logger.info('Restarting failed worker', {
                        workerId: worker.id,
                        delay: restartDelay
                    });
                    this.forkWorker(worker.id);
                }
            }, restartDelay);
        } else {
            this.logger.info('Worker exited gracefully', exitInfo);
        }
    }

    /**
     * Handles messages from workers
     * @private
     * @param {Worker} worker - Worker that sent the message
     * @param {Object} message - Message content
     */
    handleWorkerMessage(worker, message) {
        if (message.type === 'metrics') {
            // Aggregate metrics from workers
            this.aggregateWorkerMetrics(worker.id, message.data);
        } else if (message.type === 'health') {
            // Update worker health status
            this.updateWorkerHealth(worker.id, message.data);
        }
    }

    /**
     * Calculates restart delay with exponential backoff
     * @private
     * @param {number} workerId - Worker ID
     * @returns {number} Delay in milliseconds
     */
    calculateRestartDelay(workerId) {
        const restartCount = this.workers.get(workerId)?.restartCount || 0;
        const baseDelay = 1000;
        const maxDelay = 30000;
        
        return Math.min(baseDelay * Math.pow(2, restartCount), maxDelay);
    }

    /**
     * Sets up signal handlers for master process
     * @private
     */
    setupMasterSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        
        signals.forEach(signal => {
            process.on(signal, () => this.shutdownCluster(signal));
        });

        process.on('SIGUSR1', () => this.reloadWorkers());
    }

    /**
     * Starts cluster health monitoring
     * @private
     */
    startClusterMonitoring() {
        setInterval(() => {
            const clusterHealth = {
                workers: Object.keys(cluster.workers).length,
                targetWorkers: this.numWorkers,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };

            this.logger.debug('Cluster health check', clusterHealth);

            // Ensure correct number of workers
            if (clusterHealth.workers < clusterHealth.targetWorkers && !this.isShuttingDown) {
                const deficit = clusterHealth.targetWorkers - clusterHealth.workers;
                this.logger.warn(`Worker deficit detected, spawning ${deficit} workers`);
                
                for (let i = 0; i < deficit; i++) {
                    this.forkWorker();
                }
            }
        }, 30000);
    }

    /**
     * Forks a new worker process
     * @private
     * @param {number} [workerId] - Optional worker ID for tracking
     * @returns {Worker} Forked worker instance
     */
    forkWorker(workerId) {
        const worker = cluster.fork({
            WORKER_ID: workerId,
            WORKER_TYPE: 'gateway'
        });

        this.workers.set(worker.id, {
            id: worker.id,
            pid: worker.process.pid,
            startTime: Date.now(),
            restartCount: this.workers.get(workerId)?.restartCount || 0
        });

        this.logger.info('Worker forked', {
            workerId: worker.id,
            pid: worker.process.pid
        });

        return worker;
    }

    /**
     * Performs rolling restart of all workers
     * @private
     * @async
     */
    async reloadWorkers() {
        this.logger.info('Rolling restart initiated');

        const workers = Object.values(cluster.workers);
        
        for (const worker of workers) {
            // Fork new worker before killing old one
            const newWorker = this.forkWorker();
            
            // Wait for new worker to be ready
            await new Promise((resolve) => {
                newWorker.once('listening', resolve);
                setTimeout(resolve, 10000); // Timeout after 10 seconds
            });
            
            // Gracefully shutdown old worker
            worker.disconnect();
            
            // Give old worker time to cleanup
            setTimeout(() => {
                if (!worker.isDead()) {
                    worker.kill();
                }
            }, 5000);
        }

        this.logger.info('Rolling restart completed');
    }

    /**
     * Starts a worker process
     * @private
     * @async
     */
    async startWorker() {
        const server = new GatewayServer();
        
        try {
            await server.initialize();
            await server.start();

            // Notify master that worker is ready
            if (process.send) {
                process.send({ type: 'ready', pid: process.pid });
            }

            // Handle worker signals
            this.setupWorkerSignalHandlers(server);

            // Setup worker health reporting
            this.startWorkerHealthReporting();

        } catch (error) {
            this.logger.error('Failed to start worker', error);
            process.exit(1);
        }
    }

    /**
     * Sets up signal handlers for worker process
     * @private
     * @param {GatewayServer} server - Server instance to shutdown
     */
    setupWorkerSignalHandlers(server) {
        const signals = ['SIGTERM', 'SIGINT'];
        
        signals.forEach(signal => {
            process.on(signal, () => server.shutdown(signal));
        });

        process.on('disconnect', () => {
            this.logger.warn('Worker disconnected from master');
            server.shutdown('disconnect');
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in worker', error);
            server.shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection in worker', { reason, promise });
            server.shutdown('unhandledRejection');
        });
    }

    /**
     * Starts health reporting from worker to master
     * @private
     */
    startWorkerHealthReporting() {
        if (!process.send) return;

        setInterval(() => {
            process.send({
                type: 'health',
                data: {
                    pid: process.pid,
                    memoryUsage: process.memoryUsage(),
                    uptime: process.uptime()
                }
            });
        }, 30000);
    }

    /**
     * Starts single instance for development mode
     * @private
     * @async
     */
    async startSingleInstance() {
        const server = new GatewayServer();
        
        try {
            await server.initialize();
            await server.start();

            // Handle process signals
            const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
            signals.forEach(signal => {
                process.on(signal, () => server.shutdown(signal));
            });

            // Handle uncaught exceptions
            process.on('uncaughtException', (error) => {
                console.error('Uncaught exception:', error);
                server.shutdown('uncaughtException');
            });

            process.on('unhandledRejection', (reason, promise) => {
                console.error('Unhandled rejection:', reason);
                server.shutdown('unhandledRejection');
            });

        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Gracefully shuts down the entire cluster
     * @private
     * @async
     * @param {string} signal - Signal that triggered shutdown
     */
    async shutdownCluster(signal) {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.logger.info(`Cluster shutdown initiated`, { signal });

        // Set shutdown deadline
        const shutdownDeadline = setTimeout(() => {
            this.logger.error('Cluster shutdown deadline exceeded, forcing exit');
            
            // Force kill all workers
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }
            
            process.exit(1);
        }, 30000);

        // Gracefully disconnect all workers
        const workers = Object.values(cluster.workers);
        const disconnectPromises = workers.map(worker => {
            return new Promise((resolve) => {
                worker.disconnect();
                worker.once('exit', resolve);
                
                // Force kill after timeout
                setTimeout(() => {
                    if (!worker.isDead()) {
                        worker.kill();
                    }
                    resolve();
                }, 10000);
            });
        });

        await Promise.all(disconnectPromises);

        clearTimeout(shutdownDeadline);
        
        this.logger.info('All workers shutdown, exiting master process');
        process.exit(0);
    }

    /**
     * Aggregates metrics from worker processes
     * @private
     * @param {number} workerId - Worker ID
     * @param {Object} metrics - Worker metrics
     */
    aggregateWorkerMetrics(workerId, metrics) {
        // Implementation would aggregate metrics from all workers
        // This could be sent to a central metrics store
        this.logger.debug('Worker metrics received', { workerId, metrics });
    }

    /**
     * Updates worker health status
     * @private
     * @param {number} workerId - Worker ID
     * @param {Object} health - Worker health data
     */
    updateWorkerHealth(workerId, health) {
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
            workerInfo.lastHealthReport = Date.now();
            workerInfo.health = health;
        }
    }
}

// Export classes for testing
module.exports = { GatewayServer, ClusterManager };

// Start the application if this is the main module
if (require.main === module) {
    const clusterManager = new ClusterManager();
    clusterManager.start();
}