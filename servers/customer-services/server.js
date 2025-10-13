/**
 * @fileoverview Customer Services Server with Universal Transaction Service
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
 * @description Main server class for Customer Services with transaction support
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
        this.infrastructureInitialized = false;

        // Logger setup
        this.logger = this._setupLogger();

        // Performance monitoring
        this.metrics = {
            startupTime: 0,
            restarts: 0,
            errors: 0,
            connections: 0,
            peakConnections: 0,
            transactionMetrics: {}
        };

        // Server metadata
        this.metadata = {
            name: 'Customer Services Server',
            version: process.env.npm_package_version || '1.0.0',
            pid: process.pid,
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            features: {
                clustering: this.useCluster,
                ssl: this.useSSL,
                transactions: true,
                entityStrategies: true
            }
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
            const logDir = path.join(__dirname, '..', '..', 'logs');
            
            // Ensure log directory exists
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            logger.add(new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error'
            }));
            logger.add(new winston.transports.File({
                filename: path.join(logDir, 'combined.log')
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
     * Initialize infrastructure services
     * CRITICAL: This should ONLY be called in worker processes, not in master
     * @private
     */
    async _initializeInfrastructure() {
        if (this.infrastructureInitialized) {
            this.logger.debug('Infrastructure already initialized');
            return;
        }

        // CRITICAL: Prevent infrastructure initialization in master process
        if (cluster.isMaster && this.useCluster) {
            this.logger.warn('Skipping infrastructure initialization in master process');
            return;
        }

        const initStartTime = Date.now();
        this.logger.info('Initializing infrastructure services...', {
            environment: this.environment,
            pid: process.pid
        });

        try {
            // Step 1: Initialize Database Connections
            this.logger.info('Step 1/3: Initializing database connections...', {
                environment: this.environment,
                pid: process.pid
            });

            const database = require('../../shared/lib/database');
            
            // CRITICAL: Initialize database ONCE per worker
            await database.initialize({
                environment: this.environment,
                autoDiscoverModels: true,
                enableHealthChecks: true,
                enableMetrics: true
            });

            // Verify the database is ready
            const connectionManager = database.getInstance();
            if (!connectionManager || !connectionManager.state || !connectionManager.state.ready) {
                throw new Error('Database not ready after initialization');
            }

            this.logger.info('✓ Database connections initialized', {
                environment: this.environment,
                pid: process.pid
            });

            // Step 2: Initialize Entity Strategy Registry
            this.logger.info('Step 2/3: Initializing entity strategy registry...', {
                environment: this.environment,
                pid: process.pid
            });

            const EntityStrategyRegistry = require('../../shared/lib/database/services/entity-strategy-registry');
            await EntityStrategyRegistry.initialize();
            
            const strategies = EntityStrategyRegistry.getAllStrategies();
            this.logger.info('✓ Entity strategy registry initialized', {
                strategiesRegistered: strategies.length,
                strategies: strategies.map(s => ({
                    userType: s.userType,
                    entityType: s.entityType
                })),
                environment: this.environment,
                pid: process.pid
            });

            // Step 3: Initialize Universal Transaction Service
            this.logger.info('Step 3/3: Initializing universal transaction service...', {
                environment: this.environment,
                pid: process.pid
            });

            const UniversalTransactionService = require('../../shared/lib/database/services/universal-transaction-service');
            
            // Get initial metrics
            const initialMetrics = UniversalTransactionService.getMetrics();
            this.metrics.transactionMetrics = initialMetrics;
            
            this.logger.info('✓ Universal transaction service initialized', {
                environment: this.environment,
                metrics: initialMetrics,
                pid: process.pid
            });

            this.infrastructureInitialized = true;

            const initDuration = Date.now() - initStartTime;
            this.logger.info('Infrastructure initialization completed', {
                duration: `${initDuration}ms`,
                environment: this.environment,
                pid: process.pid,
                components: [
                    'Database Connections',
                    'Entity Strategy Registry',
                    'Universal Transaction Service'
                ]
            });

        } catch (error) {
            this.logger.error('Infrastructure initialization failed', {
                error: error.message,
                stack: error.stack,
                environment: this.environment,
                pid: process.pid
            });
            throw new Error(`Infrastructure initialization failed: ${error.message}`);
        }
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
                ssl: this.useSSL,
                workers: this.useCluster ? this.workerCount : 1
            });

            // Start with clustering if enabled and we're the master
            if (this.useCluster && cluster.isMaster) {
                await this._startClusterMaster();
            } else {
                await this._startWorker();
            }

            this.metrics.startupTime = Date.now() - startTime;
            this.logger.info(`Server startup completed in ${this.metrics.startupTime}ms`, {
                environment: this.environment,
                pid: process.pid
            });

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
     * CRITICAL: Master process should NOT initialize database connections
     * @private
     */
    async _startClusterMaster() {
        this.logger.info(`Starting cluster master with ${this.workerCount} workers`, {
            pid: process.pid
        });

        // CRITICAL: DO NOT initialize infrastructure in master
        // The master only manages worker lifecycle, not database connections

        // Fork workers - they will initialize infrastructure independently
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

        cluster.on('online', (worker) => {
            this.logger.info(`Worker ${worker.process.pid} is online`);
        });

        // Handle master process signals
        this._setupMasterSignalHandlers();

        this.isRunning = true;
        this.startTime = new Date();

        // Display startup banner
        this._displayBanner();

        // Start periodic metrics collection
        this._startMetricsCollection();
    }

    /**
     * Fork a new worker
     * @private
     */
    _forkWorker() {
        const worker = cluster.fork();
        this.workers.set(worker.id, {
            worker,
            startedAt: new Date(),
            metrics: {}
        });

        worker.on('message', (message) => {
            this._handleWorkerMessage(worker, message);
        });

        worker.on('error', (error) => {
            this.logger.error(`Worker ${worker.process.pid} error`, {
                error: error.message
            });
        });

        return worker;
    }

    /**
     * Handle messages from workers
     * @private
     */
    _handleWorkerMessage(worker, message) {
        const workerInfo = this.workers.get(worker.id);
        
        if (!workerInfo) return;

        switch (message.type) {
            case 'metrics':
                // Aggregate metrics from workers
                workerInfo.metrics = message.data;
                this.metrics.connections += message.data.connections || 0;
                this.metrics.peakConnections = Math.max(
                    this.metrics.peakConnections,
                    message.data.connections || 0
                );
                break;

            case 'transaction-metrics':
                // Update transaction metrics
                this.metrics.transactionMetrics = message.data;
                break;

            case 'ready':
                this.logger.info(`Worker ${message.pid} is ready`, {
                    infrastructureInitialized: message.infrastructureInitialized
                });
                break;

            case 'error':
                this.logger.error(`Worker ${worker.process.pid} reported error`, {
                    error: message.error
                });
                break;

            default:
                this.logger.debug(`Unknown message type from worker: ${message.type}`);
        }
    }

    /**
     * Start worker process
     * CRITICAL: Workers should initialize infrastructure independently
     * @private
     */
    async _startWorker() {
        try {
            // CRITICAL: Initialize infrastructure in worker process
            // Each worker gets its own database connection pool
            await this._initializeInfrastructure();

            // Create application instance AFTER infrastructure is ready
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
                process.send({ 
                    type: 'ready', 
                    pid: process.pid,
                    infrastructureInitialized: this.infrastructureInitialized
                });
            }

            this.logger.info('Customer Services worker started', {
                pid: process.pid,
                port: this.port,
                host: this.host,
                environment: this.environment,
                infrastructureInitialized: this.infrastructureInitialized
            });

            // Start periodic metrics reporting for workers
            if (cluster.isWorker) {
                this._startWorkerMetricsReporting();
            }

        } catch (error) {
            this.logger.error('Worker startup failed', {
                error: error.message,
                stack: error.stack,
                pid: process.pid
            });
            
            // Notify master of failure if in cluster
            if (cluster.isWorker) {
                process.send({ 
                    type: 'error', 
                    error: error.message,
                    pid: process.pid
                });
            }
            
            throw error;
        }
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

            // Set socket timeout
            socket.setTimeout(parseInt(process.env.SOCKET_TIMEOUT) || 120000);
            
            socket.on('timeout', () => {
                this.logger.warn('Socket timeout, destroying connection', {
                    environment: this.environment,
                    pid: process.pid
                });
                socket.destroy();
            });
        });

        // Handle server errors
        this.server.on('error', (error) => {
            this._handleServerError(error);
        });

        // Handle server close
        this.server.on('close', () => {
            this.logger.info('Server closed', {
                environment: this.environment,
                pid: process.pid
            });
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
            this.logger.error('Server error', { 
                error: error.message,
                environment: this.environment,
                pid: process.pid
            });
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
                this.logger.error('Server error', { 
                    code: error.code,
                    environment: this.environment,
                    pid: process.pid
                });
                throw error;
        }
    }

    /**
     * Start periodic metrics collection (master only)
     * @private
     */
    _startMetricsCollection() {
        const interval = parseInt(process.env.METRICS_INTERVAL) || 60000; // 1 minute default

        setInterval(() => {
            try {
                this.logger.debug('Metrics collected', {
                    connections: this.metrics.connections,
                    peakConnections: this.metrics.peakConnections,
                    transactions: this.metrics.transactionMetrics,
                    environment: this.environment,
                    pid: process.pid
                });
            } catch (error) {
                this.logger.error('Metrics collection failed', {
                    error: error.message,
                    environment: this.environment,
                    pid: process.pid
                });
            }
        }, interval);
    }

    /**
     * Start worker metrics reporting
     * @private
     */
    _startWorkerMetricsReporting() {
        const interval = parseInt(process.env.WORKER_METRICS_INTERVAL) || 30000; // 30 seconds

        setInterval(() => {
            try {
                const UniversalTransactionService = require('../../shared/lib/database/services/universal-transaction-service');
                const transactionMetrics = UniversalTransactionService.getMetrics();

                process.send({
                    type: 'transaction-metrics',
                    data: transactionMetrics,
                    pid: process.pid
                });
            } catch (error) {
                this.logger.error('Worker metrics reporting failed', {
                    error: error.message,
                    pid: process.pid
                });
            }
        }, interval);
    }

    /**
     * Setup signal handlers for master process
     * @private
     */
    _setupMasterSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

        signals.forEach(signal => {
            process.on(signal, async () => {
                this.logger.info(`Master received ${signal} signal`, {
                    pid: process.pid
                });
                await this._gracefulShutdown();
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in master', {
                error: error.message,
                stack: error.stack,
                pid: process.pid
            });
            this._gracefulShutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection in master', {
                reason,
                promise,
                pid: process.pid
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
                this.logger.warn('Worker disconnected from master', {
                    pid: process.pid
                });
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
        this.logger.info('Starting graceful shutdown...', {
            environment: this.environment,
            pid: process.pid
        });

        const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000;

        // Set timeout for forced shutdown
        const forceShutdown = setTimeout(() => {
            this.logger.error('Forced shutdown due to timeout', {
                environment: this.environment,
                pid: process.pid
            });
            process.exit(1);
        }, shutdownTimeout);

        try {
            if (cluster.isMaster) {
                // Shutdown workers
                await this._shutdownWorkers();
            } else {
                // Shutdown server
                await this._shutdownServer();
                
                // Cleanup infrastructure
                await this._cleanupInfrastructure();
            }

            clearTimeout(forceShutdown);
            this.logger.info('Graceful shutdown completed', {
                environment: this.environment,
                pid: process.pid
            });
            process.exit(0);

        } catch (error) {
            this.logger.error('Error during shutdown', { 
                error: error.message,
                environment: this.environment,
                pid: process.pid
            });
            clearTimeout(forceShutdown);
            process.exit(1);
        }
    }

    /**
     * Cleanup infrastructure services
     * @private
     */
    async _cleanupInfrastructure() {
        if (!this.infrastructureInitialized) {
            return;
        }

        this.logger.info('Cleaning up infrastructure services...', {
            environment: this.environment,
            pid: process.pid
        });

        try {
            // Close database connections
            const database = require('../../shared/lib/database');
            await database.shutdown();
            this.logger.info('✓ Database connections closed', {
                environment: this.environment,
                pid: process.pid
            });

            this.infrastructureInitialized = false;

        } catch (error) {
            this.logger.error('Infrastructure cleanup failed', {
                error: error.message,
                environment: this.environment,
                pid: process.pid
            });
        }
    }

    /**
     * Shutdown workers
     * @private
     */
    async _shutdownWorkers() {
        const promises = [];

        for (const [id, workerInfo] of this.workers) {
            const worker = workerInfo.worker;
            
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
        this.logger.info('All workers shut down', {
            environment: this.environment,
            pid: process.pid
        });
    }

    /**
     * Shutdown server
     * @private
     */
    async _shutdownServer() {
        if (!this.server) return;

        return new Promise((resolve) => {
            this.server.close(() => {
                this.logger.info('HTTP server closed', {
                    environment: this.environment,
                    pid: process.pid
                });
                resolve();
            });

            // Force close connections after timeout
            setTimeout(() => {
                if (this.server.closeAllConnections) {
                    this.server.closeAllConnections();
                }
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
║            with Transaction Support                     ║
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
        console.log('------------------------------------------------------------');
        console.log('🔄 Infrastructure Status:');
        console.log(`   ✓ Database Connections`);
        console.log(`   ✓ Entity Strategy Registry`);
        console.log(`   ✓ Universal Transaction Service`);
        
        if (this.metrics.transactionMetrics) {
            console.log('------------------------------------------------------------');
            console.log('📈 Transaction Service Metrics:');
            console.log(`   Total: ${this.metrics.transactionMetrics.total || 0}`);
            console.log(`   Successful: ${this.metrics.transactionMetrics.successful || 0}`);
            console.log(`   Failed: ${this.metrics.transactionMetrics.failed || 0}`);
            console.log(`   Active: ${this.metrics.transactionMetrics.activeTransactions || 0}`);
        }
        
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
            metadata: this.metadata,
            infrastructureInitialized: this.infrastructureInitialized
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
            infrastructureInitialized: this.infrastructureInitialized,
            metrics: this.metrics,
            metadata: this.metadata
        };
    }

    /**
     * Get transaction metrics
     * @returns {Object} Transaction metrics
     */
    getTransactionMetrics() {
        try {
            const UniversalTransactionService = require('../../shared/lib/database/services/universal-transaction-service');
            return UniversalTransactionService.getMetrics();
        } catch (error) {
            this.logger.error('Failed to get transaction metrics', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get active transactions
     * @returns {Array} Active transactions
     */
    getActiveTransactions() {
        try {
            const UniversalTransactionService = require('../../shared/lib/database/services/universal-transaction-service');
            return UniversalTransactionService.getActiveTransactions();
        } catch (error) {
            this.logger.error('Failed to get active transactions', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Restart the server
     */
    async restart() {
        this.logger.info('Restarting server...', {
            environment: this.environment,
            pid: process.pid
        });
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