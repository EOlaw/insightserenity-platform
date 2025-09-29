/**
 * @fileoverview Customer Services Server
 * @module servers/customer-services/server
 * @requires http
 * @requires https
 * @requires cluster
 * @requires os
 * @requires winston
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const cluster = require('cluster');
const os = require('os');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

/**
 * @class CustomerServicesServer
 * @description Main server class for Customer Services
 */
class CustomerServicesServer {
    /**
     * Creates an instance of CustomerServicesServer
     * @param {Object} options - Server options
     */
    constructor(options = {}) {
        // Server configuration
        this.port = parseInt(process.env.PORT) || options.port || 3001;
        this.host = process.env.HOST || options.host || '0.0.0.0';
        this.environment = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.environment === 'development';
        this.isProduction = this.environment === 'production';

        // SSL configuration
        this.useSSL = process.env.USE_SSL === 'true' || options.useSSL;
        this.sslOptions = this._loadSSLConfiguration();

        // Clustering configuration
        this.useCluster = process.env.USE_CLUSTER === 'true' || options.useCluster;
        this.workerCount = parseInt(process.env.WORKER_COUNT) || options.workerCount || os.cpus().length;

        // Server instances
        this.app = null;
        this.server = null;
        this.workers = new Map();

        // Server state
        this.isRunning = false;
        this.startTime = null;
        this.shutdownInProgress = false;

        // Logger setup
        this.logger = this._setupLogger();

        // Performance monitoring
        this.metrics = {
            startupTime: 0,
            restarts: 0,
            errors: 0,
            connections: 0,
            peakConnections: 0
        };

        // Server metadata
        this.metadata = {
            name: 'Customer Services Server',
            version: process.env.npm_package_version || '1.0.0',
            pid: process.pid,
            node: process.version,
            platform: process.platform,
            arch: process.arch
        };
    }

    /**
     * Setup Winston logger
     * @private
     */
    _setupLogger() {
        const logLevel = process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info');

        const logger = winston.createLogger({
            level: logLevel,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: {
                service: 'customer-services-server',
                environment: this.environment,
                pid: process.pid
            },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });

        // Add file transport in production
        if (this.isProduction) {
            logger.add(new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error'
            }));
            logger.add(new winston.transports.File({
                filename: 'logs/combined.log'
            }));
        }

        return logger;
    }

    /**
     * Load SSL configuration
     * @private
     */
    _loadSSLConfiguration() {
        if (!this.useSSL) return null;

        try {
            const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'key.pem');
            const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'ssl', 'cert.pem');

            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                return {
                    key: fs.readFileSync(keyPath),
                    cert: fs.readFileSync(certPath)
                };
            }
        } catch (error) {
            this.logger.warn('Failed to load SSL certificates', { error: error.message });
        }

        return null;
    }

    /**
     * Start the server
     * @returns {Promise<void>}
     */
    async start() {
        const startTime = Date.now();

        try {
            // Check if already running
            if (this.isRunning) {
                this.logger.warn('Server is already running');
                return;
            }

            this.logger.info('Starting Customer Services Server...', {
                port: this.port,
                host: this.host,
                environment: this.environment,
                cluster: this.useCluster,
                ssl: this.useSSL
            });

            // Start with clustering if enabled and we're the master
            if (this.useCluster && cluster.isMaster) {
                await this._startClusterMaster();
            } else {
                await this._startWorker();
            }

            this.metrics.startupTime = Date.now() - startTime;
            this.logger.info(`Server startup completed in ${this.metrics.startupTime}ms`);

        } catch (error) {
            this.logger.error('Failed to start server', {
                error: error.message,
                stack: error.stack
            });
            this.metrics.errors++;
            throw error;
        }
    }

    /**
     * Start cluster master
     * @private
     */
    async _startClusterMaster() {
        this.logger.info(`Starting cluster master with ${this.workerCount} workers`);

        // Fork workers
        for (let i = 0; i < this.workerCount; i++) {
            this._forkWorker();
        }

        // Handle worker events
        cluster.on('exit', (worker, code, signal) => {
            this.logger.error(`Worker ${worker.process.pid} died`, { code, signal });
            this.workers.delete(worker.id);

            // Restart worker if not shutting down
            if (!this.shutdownInProgress) {
                this.logger.info('Starting replacement worker...');
                this._forkWorker();
                this.metrics.restarts++;
            }
        });

        cluster.on('listening', (worker, address) => {
            this.logger.info(`Worker ${worker.process.pid} listening`, {
                address: address.address,
                port: address.port
            });
        });

        // Handle master process signals
        this._setupMasterSignalHandlers();

        this.isRunning = true;
        this.startTime = new Date();

        // Display startup banner
        this._displayBanner();
    }

    /**
     * Fork a new worker
     * @private
     */
    _forkWorker() {
        const worker = cluster.fork();
        this.workers.set(worker.id, worker);

        worker.on('message', (message) => {
            this._handleWorkerMessage(worker, message);
        });

        return worker;
    }

    /**
     * Handle messages from workers
     * @private
     */
    _handleWorkerMessage(worker, message) {
        if (message.type === 'metrics') {
            // Aggregate metrics from workers
            this.metrics.connections += message.data.connections || 0;
            this.metrics.peakConnections = Math.max(
                this.metrics.peakConnections,
                message.data.connections || 0
            );
        }
    }

    /**
     * Start worker process
     * @private
     */
    async _startWorker() {
        // Create application instance
        const CustomerServicesApp = require('./app');
        const appInstance = new CustomerServicesApp();
        this.app = appInstance.getApp();

        // Create server
        if (this.useSSL && this.sslOptions) {
            this.server = https.createServer(this.sslOptions, this.app);
        } else {
            this.server = http.createServer(this.app);
        }

        // Setup server event handlers
        this._setupServerEventHandlers();

        // Start listening
        await new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        this.isRunning = true;
        this.startTime = new Date();

        // Setup signal handlers for worker
        this._setupWorkerSignalHandlers();

        // Display banner for single instance
        if (!cluster.isWorker) {
            this._displayBanner();
        }

        // Send ready message to master if in cluster
        if (cluster.isWorker) {
            process.send({ type: 'ready', pid: process.pid });
        }

        this.logger.info('Customer Services worker started', {
            pid: process.pid,
            port: this.port,
            host: this.host
        });
    }

    /**
     * Setup server event handlers
     * @private
     */
    _setupServerEventHandlers() {
        // Track connections
        let connections = 0;

        this.server.on('connection', (socket) => {
            connections++;
            this.metrics.connections++;
            this.metrics.peakConnections = Math.max(this.metrics.peakConnections, connections);

            socket.on('close', () => {
                connections--;
            });

            // Send metrics to master if in cluster
            if (cluster.isWorker) {
                process.send({
                    type: 'metrics',
                    data: { connections }
                });
            }
        });

        // Handle server errors
        this.server.on('error', (error) => {
            this._handleServerError(error);
        });

        // Handle server close
        this.server.on('close', () => {
            this.logger.info('Server closed');
            this.isRunning = false;
        });
    }

    /**
     * Handle server errors
     * @private
     */
    _handleServerError(error) {
        this.metrics.errors++;

        if (error.syscall !== 'listen') {
            this.logger.error('Server error', { error: error.message });
            throw error;
        }

        const bind = typeof this.port === 'string'
            ? 'Pipe ' + this.port
            : 'Port ' + this.port;

        switch (error.code) {
            case 'EACCES':
                this.logger.error(`${bind} requires elevated privileges`);
                console.error(`\n❌ ERROR: ${bind} requires elevated privileges\n`);
                console.error('Try running with sudo or use a port number > 1024\n');
                process.exit(1);
                break;

            case 'EADDRINUSE':
                this.logger.error(`${bind} is already in use`);
                console.error(`\n❌ ERROR: ${bind} is already in use\n`);
                console.error('Please check if another process is using this port\n');
                console.error('You can find the process with: lsof -i :' + this.port + '\n');
                process.exit(1);
                break;

            default:
                this.logger.error('Server error', { code: error.code });
                throw error;
        }
    }

    /**
     * Setup signal handlers for master process
     * @private
     */
    _setupMasterSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

        signals.forEach(signal => {
            process.on(signal, async () => {
                this.logger.info(`Master received ${signal} signal`);
                await this._gracefulShutdown();
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in master', {
                error: error.message,
                stack: error.stack
            });
            this._gracefulShutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection in master', {
                reason,
                promise
            });
        });
    }

    /**
     * Setup signal handlers for worker process
     * @private
     */
    _setupWorkerSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT'];

        signals.forEach(signal => {
            process.on(signal, async () => {
                this.logger.info(`Worker ${process.pid} received ${signal} signal`);
                await this._gracefulShutdown();
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in worker', {
                error: error.message,
                stack: error.stack,
                pid: process.pid
            });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection in worker', {
                reason,
                promise,
                pid: process.pid
            });
        });

        // Handle disconnect from master
        if (cluster.isWorker) {
            process.on('disconnect', () => {
                this.logger.warn('Worker disconnected from master');
                this._gracefulShutdown();
            });
        }
    }

    /**
     * Graceful shutdown
     * @private
     */
    async _gracefulShutdown() {
        if (this.shutdownInProgress) {
            return;
        }

        this.shutdownInProgress = true;
        this.logger.info('Starting graceful shutdown...');

        const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000;

        // Set timeout for forced shutdown
        const forceShutdown = setTimeout(() => {
            this.logger.error('Forced shutdown due to timeout');
            process.exit(1);
        }, shutdownTimeout);

        try {
            if (cluster.isMaster) {
                // Shutdown workers
                await this._shutdownWorkers();
            } else {
                // Shutdown server
                await this._shutdownServer();
            }

            clearTimeout(forceShutdown);
            this.logger.info('Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            this.logger.error('Error during shutdown', { error: error.message });
            clearTimeout(forceShutdown);
            process.exit(1);
        }
    }

    /**
     * Shutdown workers
     * @private
     */
    async _shutdownWorkers() {
        const promises = [];

        for (const [id, worker] of this.workers) {
            promises.push(new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    this.logger.warn(`Worker ${worker.process.pid} shutdown timeout, killing...`);
                    worker.kill();
                    resolve();
                }, 10000);

                worker.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                worker.disconnect();
            }));
        }

        await Promise.all(promises);
        this.logger.info('All workers shut down');
    }

    /**
     * Shutdown server
     * @private
     */
    async _shutdownServer() {
        if (!this.server) return;

        return new Promise((resolve) => {
            this.server.close(() => {
                this.logger.info('HTTP server closed');
                resolve();
            });

            // Force close connections after timeout
            setTimeout(() => {
                this.server.closeAllConnections();
            }, 5000);
        });
    }

    /**
     * Display startup banner
     * @private
     */
    _displayBanner() {
        const banner = `
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ____          _                                       ║
║  / ___|   _ ___| |_ ___  _ __ ___   ___ _ __           ║
║ | |  | | | / __| __/ _ \\| '_ \` _ \\ / _ \\ '__|          ║
║ | |__| |_| \\__ \\ || (_) | | | | | |  __/ |              ║
║  \\____\\__,_|___/\\__\\___/|_| |_| |_|\\___|_|              ║
║                                                          ║
║     ____                  _                             ║
║    / ___|  ___ _ ____   _(_) ___ ___  ___              ║
║    \\___ \\ / _ \\ '__\\ \\ / / |/ __/ _ \\/ __|             ║
║     ___) |  __/ |   \\ V /| | (_|  __/\\__ \\             ║
║    |____/ \\___|_|    \\_/ |_|\\___\\___||___/             ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`;

        console.log(banner);
        console.log('============================================================');
        console.log('🚀 CUSTOMER SERVICES SERVER STARTED');
        console.log('============================================================');
        console.log(`📍 Server:       ${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}`);
        console.log(`📚 Documentation: ${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}/docs`);
        console.log(`🏥 Health:       ${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}/health`);
        console.log(`📊 Metrics:      ${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}/api/metrics`);
        console.log(`🔧 Environment:  ${this.environment}`);
        console.log(`⚙️  Process:      ${cluster.isMaster ? 'Master' : 'Worker'} ${process.pid}`);

        if (this.useCluster && cluster.isMaster) {
            console.log(`👥 Workers:      ${this.workerCount}`);
        }

        console.log(`🕐 Started:      ${new Date().toISOString()}`);
        console.log('============================================================\n');

        // Log additional information
        this.logger.info('Customer Services Server Started', {
            url: `${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}`,
            documentation: `${this.useSSL ? 'https' : 'http'}://${this.host}:${this.port}/docs`,
            environment: this.environment,
            pid: process.pid,
            worker: cluster.isWorker,
            protocol: this.useSSL ? 'https' : 'http',
            host: this.host,
            port: this.port,
            metadata: this.metadata
        });
    }

    /**
     * Get server status
     * @returns {Object} Server status
     */
    getStatus() {
        return {
            running: this.isRunning,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            environment: this.environment,
            port: this.port,
            host: this.host,
            ssl: this.useSSL,
            cluster: this.useCluster,
            workers: this.workers.size,
            metrics: this.metrics,
            metadata: this.metadata
        };
    }

    /**
     * Restart the server
     */
    async restart() {
        this.logger.info('Restarting server...');
        await this._gracefulShutdown();
        await this.start();
    }
}

// Create and start server
const server = new CustomerServicesServer();

// Export for testing
module.exports = CustomerServicesServer;

// Start server if not imported
if (require.main === module) {
    server.start().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
