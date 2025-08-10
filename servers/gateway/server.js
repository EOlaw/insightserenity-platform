/**
 * Enterprise API Gateway Server
 * Main entry point for the InsightSerenity Platform Gateway
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
const { gracefulShutdown } = require('./utils/shutdown-handler');

/**
 * Gateway Server Class
 * Orchestrates the entire gateway lifecycle
 */
class GatewayServer {
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
        this.isShuttingDown = false;
    }

    /**
     * Initialize all server components
     */
    async initialize() {
        try {
            // Initialize configuration
            this.config = new ConfigManager();
            await this.config.load();

            // Initialize logger
            this.logger = new Logger(this.config.get('logging'));
            this.logger.info('Gateway Server Initialization Started', {
                environment: process.env.NODE_ENV,
                nodeVersion: process.version,
                pid: process.pid
            });

            // Initialize tracing
            this.traceManager = new TraceManager(this.config.get('tracing'));
            await this.traceManager.initialize();

            // Initialize cache manager
            this.cacheManager = new CacheManager(this.config.get('cache'));
            await this.cacheManager.connect();

            // Initialize service registry
            this.serviceRegistry = new ServiceRegistry(this.config.get('services'));
            await this.serviceRegistry.initialize();

            // Initialize health monitor
            this.healthMonitor = new HealthMonitor(
                this.serviceRegistry,
                this.config.get('healthCheck')
            );
            await this.healthMonitor.start();

            // Initialize metrics collector
            this.metricsCollector = new MetricsCollector(this.config.get('metrics'));
            await this.metricsCollector.initialize();

            // Create and configure application
            this.app = new GatewayApplication({
                config: this.config,
                logger: this.logger,
                serviceRegistry: this.serviceRegistry,
                healthMonitor: this.healthMonitor,
                metricsCollector: this.metricsCollector,
                traceManager: this.traceManager,
                cacheManager: this.cacheManager
            });

            await this.app.initialize();

            this.logger.info('Gateway Server Initialization Completed');
        } catch (error) {
            console.error('Failed to initialize gateway server:', error);
            process.exit(1);
        }
    }

    /**
     * Start the HTTP server
     */
    async start() {
        const port = this.config.get('server.port') || 3000;
        const host = this.config.get('server.host') || '0.0.0.0';

        return new Promise((resolve, reject) => {
            this.server = this.app.getExpressApp().listen(port, host, (error) => {
                if (error) {
                    this.logger.error('Failed to start server', error);
                    reject(error);
                    return;
                }

                this.logger.info(`Gateway Server Started`, {
                    host,
                    port,
                    environment: process.env.NODE_ENV,
                    pid: process.pid,
                    workerId: cluster.worker?.id || 'master'
                });

                // Register server metrics
                this.metricsCollector.registerGauge('gateway_server_status', 1, {
                    host,
                    port,
                    environment: process.env.NODE_ENV
                });

                resolve();
            });

            // Configure server timeouts
            this.server.timeout = this.config.get('server.timeout') || 120000;
            this.server.keepAliveTimeout = this.config.get('server.keepAliveTimeout') || 65000;
            this.server.headersTimeout = this.config.get('server.headersTimeout') || 66000;

            // Handle server errors
            this.server.on('error', this.handleServerError.bind(this));
            this.server.on('clientError', this.handleClientError.bind(this));
        });
    }

    /**
     * Handle server errors
     */
    handleServerError(error) {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const port = this.config.get('server.port');
        switch (error.code) {
            case 'EACCES':
                this.logger.error(`Port ${port} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                this.logger.error(`Port ${port} is already in use`);
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    /**
     * Handle client errors
     */
    handleClientError(error, socket) {
        this.logger.warn('Client error detected', {
            error: error.message,
            remoteAddress: socket.remoteAddress
        });

        if (error.code === 'ECONNRESET' || !socket.writable) {
            return;
        }

        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }

    /**
     * Gracefully shutdown the server
     */
    async shutdown(signal) {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.logger.info(`Gateway Server Shutdown Initiated (${signal})`);

        try {
            // Stop accepting new connections
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
            }

            // Stop health monitoring
            if (this.healthMonitor) {
                await this.healthMonitor.stop();
            }

            // Disconnect from service registry
            if (this.serviceRegistry) {
                await this.serviceRegistry.disconnect();
            }

            // Disconnect cache
            if (this.cacheManager) {
                await this.cacheManager.disconnect();
            }

            // Flush metrics
            if (this.metricsCollector) {
                await this.metricsCollector.flush();
            }

            // Flush traces
            if (this.traceManager) {
                await this.traceManager.shutdown();
            }

            // Cleanup application
            if (this.app) {
                await this.app.cleanup();
            }

            this.logger.info('Gateway Server Shutdown Completed');
            process.exit(0);
        } catch (error) {
            this.logger.error('Error during shutdown', error);
            process.exit(1);
        }
    }
}

/**
 * Cluster Manager for production deployment
 */
class ClusterManager {
    constructor() {
        this.numWorkers = process.env.GATEWAY_WORKERS || os.cpus().length;
        this.logger = new Logger({ service: 'cluster-manager' });
    }

    /**
     * Start cluster with multiple workers
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
     * Check if clustering should be used
     */
    shouldUseCluster() {
        return process.env.NODE_ENV === 'production' && 
               process.env.DISABLE_CLUSTERING !== 'true';
    }

    /**
     * Start master process
     */
    startMaster() {
        this.logger.info(`Master process started`, {
            pid: process.pid,
            workers: this.numWorkers
        });

        // Fork workers
        for (let i = 0; i < this.numWorkers; i++) {
            this.forkWorker();
        }

        // Handle worker events
        cluster.on('exit', (worker, code, signal) => {
            if (!worker.exitedAfterDisconnect) {
                this.logger.error(`Worker died unexpectedly`, {
                    workerId: worker.id,
                    pid: worker.process.pid,
                    code,
                    signal
                });
                this.forkWorker();
            }
        });

        // Handle master process signals
        process.on('SIGTERM', () => this.shutdownCluster('SIGTERM'));
        process.on('SIGINT', () => this.shutdownCluster('SIGINT'));
    }

    /**
     * Fork a new worker
     */
    forkWorker() {
        const worker = cluster.fork();
        this.logger.info(`Worker forked`, {
            workerId: worker.id,
            pid: worker.process.pid
        });
    }

    /**
     * Start worker process
     */
    async startWorker() {
        const server = new GatewayServer();
        
        try {
            await server.initialize();
            await server.start();

            // Handle worker signals
            process.on('SIGTERM', () => server.shutdown('SIGTERM'));
            process.on('SIGINT', () => server.shutdown('SIGINT'));
            process.on('SIGUSR2', () => server.shutdown('SIGUSR2'));

            // Handle uncaught exceptions
            process.on('uncaughtException', (error) => {
                this.logger.error('Uncaught exception', error);
                server.shutdown('uncaughtException');
            });

            process.on('unhandledRejection', (reason, promise) => {
                this.logger.error('Unhandled rejection', { reason, promise });
                server.shutdown('unhandledRejection');
            });
        } catch (error) {
            this.logger.error('Failed to start worker', error);
            process.exit(1);
        }
    }

    /**
     * Start single instance (development mode)
     */
    async startSingleInstance() {
        const server = new GatewayServer();
        
        try {
            await server.initialize();
            await server.start();

            // Handle process signals
            process.on('SIGTERM', () => server.shutdown('SIGTERM'));
            process.on('SIGINT', () => server.shutdown('SIGINT'));
            process.on('SIGUSR2', () => server.shutdown('SIGUSR2'));

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
     * Gracefully shutdown cluster
     */
    async shutdownCluster(signal) {
        this.logger.info(`Cluster shutdown initiated (${signal})`);

        // Disconnect all workers
        for (const id in cluster.workers) {
            cluster.workers[id].disconnect();
        }

        // Wait for workers to exit
        setTimeout(() => {
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }
            process.exit(0);
        }, 10000);
    }
}

// Start the application
if (require.main === module) {
    const clusterManager = new ClusterManager();
    clusterManager.start();
}

module.exports = { GatewayServer, ClusterManager };