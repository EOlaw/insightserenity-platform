/**
 * @fileoverview Admin Server Entry Point
 * @module servers/admin-server/server
 * @description Main entry point for the InsightSerenity Admin Server with comprehensive
 *              configuration management, clustering, graceful shutdown, health monitoring,
 *              and production-ready features
 * @version 2.0.0
 * @author InsightSerenity Team
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const EventEmitter = require('events');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const AdminApp = require('./app');
const { getLogger } = require('../../shared/lib/utils/logger');
const database = require('../../shared/lib/database');

// Import configuration from external file
const { ServerConfig } = require('./config/server-config');

/**
 * Server Metrics Collector
 * Collects and manages server performance metrics
 * @class MetricsCollector
 */
class MetricsCollector extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.metrics = {
            requests: { total: 0, success: 0, error: 0 },
            connections: { current: 0, total: 0, rejected: 0 },
            memory: { samples: [] },
            cpu: { samples: [] },
            eventLoop: { samples: [] },
            uptime: 0,
            startTime: Date.now()
        };
        this.interval = null;
    }

    /**
     * Start collecting metrics
     */
    start() {
        if (!this.config.get('metrics.enabled')) return;

        this.interval = setInterval(() => {
            this.collectMetrics();
        }, this.config.get('metrics.collectInterval'));

        this.collectMetrics();
    }

    /**
     * Stop collecting metrics
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    /**
     * Collect current metrics
     */
    collectMetrics() {
        const now = Date.now();
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        this.metrics.memory.samples.push({
            timestamp: now,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss
        });

        this.metrics.cpu.samples.push({
            timestamp: now,
            user: cpuUsage.user,
            system: cpuUsage.system
        });

        this.metrics.uptime = process.uptime();

        const retentionPeriod = this.config.get('metrics.retentionPeriod');
        const cutoff = now - retentionPeriod;

        this.metrics.memory.samples = this.metrics.memory.samples.filter(s => s.timestamp > cutoff);
        this.metrics.cpu.samples = this.metrics.cpu.samples.filter(s => s.timestamp > cutoff);
        this.metrics.eventLoop.samples = this.metrics.eventLoop.samples.filter(s => s.timestamp > cutoff);

        this.emit('metrics', this.getMetrics());
    }

    /**
     * Record a request
     * @param {boolean} success - Whether request was successful
     */
    recordRequest(success = true) {
        this.metrics.requests.total++;
        if (success) {
            this.metrics.requests.success++;
        } else {
            this.metrics.requests.error++;
        }
    }

    /**
     * Record connection event
     * @param {string} event - Event type (open, close, reject)
     */
    recordConnection(event) {
        switch (event) {
            case 'open':
                this.metrics.connections.current++;
                this.metrics.connections.total++;
                break;
            case 'close':
                this.metrics.connections.current = Math.max(0, this.metrics.connections.current - 1);
                break;
            case 'reject':
                this.metrics.connections.rejected++;
                break;
        }
    }

    /**
     * Get current metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        const latestMemory = this.metrics.memory.samples[this.metrics.memory.samples.length - 1] || {};

        return {
            timestamp: Date.now(),
            uptime: this.metrics.uptime,
            requests: { ...this.metrics.requests },
            connections: { ...this.metrics.connections },
            memory: {
                heapUsed: latestMemory.heapUsed ? Math.round(latestMemory.heapUsed / 1024 / 1024) : 0,
                heapTotal: latestMemory.heapTotal ? Math.round(latestMemory.heapTotal / 1024 / 1024) : 0,
                external: latestMemory.external ? Math.round(latestMemory.external / 1024 / 1024) : 0,
                rss: latestMemory.rss ? Math.round(latestMemory.rss / 1024 / 1024) : 0
            },
            pid: process.pid,
            nodeVersion: process.version
        };
    }
}

/**
 * Health Monitor
 * Monitors server health and triggers alerts
 * @class HealthMonitor
 */
class HealthMonitor extends EventEmitter {
    constructor(config, logger) {
        super();
        this.config = config;
        this.logger = logger;
        this.status = 'starting';
        this.checks = {};
        this.interval = null;
        this.lastCheck = null;
    }

    /**
     * Start health monitoring
     */
    start() {
        if (!this.config.get('health.enabled')) {
            this.status = 'disabled';
            return;
        }

        this.interval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.get('health.checkInterval'));

        this.performHealthCheck();
        this.status = 'healthy';
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.status = 'stopped';
    }

    /**
     * Perform health check
     */
    async performHealthCheck() {
        const checks = {};
        let overallHealthy = true;

        checks.memory = this.checkMemory();
        if (checks.memory.status !== 'ok') overallHealthy = false;

        checks.eventLoop = this.checkEventLoop();
        if (checks.eventLoop.status !== 'ok') overallHealthy = false;

        checks.process = this.checkProcess();
        if (checks.process.status !== 'ok') overallHealthy = false;

        this.checks = checks;
        this.lastCheck = Date.now();
        this.status = overallHealthy ? 'healthy' : 'degraded';

        if (!overallHealthy) {
            this.emit('unhealthy', checks);
            this.logger.warn('Health check detected issues', { checks });
        }

        return checks;
    }

    /**
     * Check memory health
     * @returns {Object} Memory health status
     */
    checkMemory() {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
        const usagePercentage = (heapUsedMB / heapTotalMB) * 100;
        const threshold = this.config.get('health.memoryThreshold');

        let status = 'ok';
        if (usagePercentage > threshold) {
            status = 'critical';
        } else if (usagePercentage > threshold * 0.8) {
            status = 'warning';
        }

        return {
            status,
            usagePercentage: Math.round(usagePercentage),
            heapUsedMB: Math.round(heapUsedMB),
            heapTotalMB: Math.round(heapTotalMB),
            threshold
        };
    }

    /**
     * Check event loop health
     * @returns {Object} Event loop health status
     */
    checkEventLoop() {
        const threshold = this.config.get('health.eventLoopThreshold');

        return {
            status: 'ok',
            lag: 0,
            threshold
        };
    }

    /**
     * Check process health
     * @returns {Object} Process health status
     */
    checkProcess() {
        return {
            status: 'ok',
            pid: process.pid,
            uptime: process.uptime(),
            nodeVersion: process.version
        };
    }

    /**
     * Get current health status
     * @returns {Object} Health status
     */
    getStatus() {
        return {
            status: this.status,
            lastCheck: this.lastCheck,
            checks: this.checks
        };
    }
}

/**
 * Admin Server Class
 * Manages the lifecycle of the admin server including startup, shutdown, and clustering
 * @class AdminServer
 */
class AdminServer extends EventEmitter {
    constructor() {
        super();

        this.config = new ServerConfig();
        this.logger = getLogger({ serviceName: this.config.get('server.name') });

        this.app = null;
        this.server = null;
        this.connections = new Map();
        this.workers = new Map();

        this.metricsCollector = new MetricsCollector(this.config);
        this.healthMonitor = new HealthMonitor(this.config, this.logger);

        this.state = {
            status: 'initializing',
            startTime: null,
            shutdownInProgress: false,
            shutdownReason: null,
            respawnCount: 0,
            lastRespawn: null
        };

        if (this.config.get('process.title')) {
            process.title = this.config.get('process.title');
        }
    }

    /**
     * Start the server
     * @returns {Promise<void>}
     */
    async start() {
        try {
            this.state.status = 'starting';
            this.state.startTime = Date.now();

            if (this.config.get('startup.delayMs') > 0) {
                this.logger.info(`Waiting ${this.config.get('startup.delayMs')}ms before startup`);
                await this.delay(this.config.get('startup.delayMs'));
            }

            if (this.config.get('cluster.enabled') && cluster.isMaster) {
                await this.startMaster();
            } else {
                await this.startWorker();
            }
        } catch (error) {
            this.logger.error('Failed to start admin server', {
                error: error.message,
                stack: error.stack
            });
            this.state.status = 'failed';
            process.exit(1);
        }
    }

    /**
     * Start master process for clustering
     * @returns {Promise<void>}
     */
    async startMaster() {
        const workerCount = this.config.get('cluster.workers');
        this.logger.info(`Master process ${process.pid} starting ${workerCount} workers`);

        if (this.config.get('cluster.schedulingPolicy') === 'rr') {
            cluster.schedulingPolicy = cluster.SCHED_RR;
        } else {
            cluster.schedulingPolicy = cluster.SCHED_NONE;
        }

        for (let i = 0; i < workerCount; i++) {
            await this.forkWorker();
        }

        cluster.on('exit', (worker, code, signal) => this.handleWorkerExit(worker, code, signal));
        cluster.on('online', (worker) => this.handleWorkerOnline(worker));
        cluster.on('message', (worker, message) => this.handleWorkerMessage(worker, message));
        cluster.on('disconnect', (worker) => this.handleWorkerDisconnect(worker));

        this.setupMasterSignalHandlers();

        this.metricsCollector.start();
        this.healthMonitor.start();

        this.state.status = 'running';
        this.emit('master:started');

        if (this.config.get('startup.banner')) {
            this.printMasterBanner();
        }
    }

    /**
     * Fork a new worker process
     * @returns {Promise<cluster.Worker>}
     */
    async forkWorker() {
        return new Promise((resolve) => {
            const worker = cluster.fork({
                WORKER_ID: this.workers.size + 1
            });

            this.workers.set(worker.id, {
                worker,
                startTime: Date.now(),
                status: 'starting',
                requests: 0
            });

            worker.on('online', () => {
                this.workers.get(worker.id).status = 'online';
                resolve(worker);
            });
        });
    }

    /**
     * Handle worker exit
     * @param {cluster.Worker} worker - Worker that exited
     * @param {number} code - Exit code
     * @param {string} signal - Exit signal
     */
    async handleWorkerExit(worker, code, signal) {
        const workerInfo = this.workers.get(worker.id);
        this.workers.delete(worker.id);

        this.logger.warn(`Worker ${worker.process.pid} died`, {
            code,
            signal,
            workerId: worker.id,
            uptime: workerInfo ? (Date.now() - workerInfo.startTime) / 1000 : 0
        });

        if (this.state.shutdownInProgress) {
            return;
        }

        const now = Date.now();
        const respawnWindow = this.config.get('cluster.respawnWindow');
        const maxRespawns = this.config.get('cluster.maxRespawns');

        if (this.state.lastRespawn && (now - this.state.lastRespawn) > respawnWindow) {
            this.state.respawnCount = 0;
        }

        if (this.state.respawnCount >= maxRespawns) {
            this.logger.error('Max respawns reached, not spawning new worker', {
                respawnCount: this.state.respawnCount,
                maxRespawns
            });
            return;
        }

        this.state.respawnCount++;
        this.state.lastRespawn = now;

        const delay = this.config.get('cluster.respawnDelay');
        this.logger.info(`Spawning new worker in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.forkWorker();
            } catch (error) {
                this.logger.error('Failed to spawn new worker', { error: error.message });
            }
        }, delay);
    }

    /**
     * Handle worker online event
     * @param {cluster.Worker} worker - Worker that came online
     */
    handleWorkerOnline(worker) {
        this.logger.info(`Worker ${worker.process.pid} is online`, { workerId: worker.id });
        this.emit('worker:online', worker);
    }

    /**
     * Handle worker message
     * @param {cluster.Worker} worker - Worker that sent message
     * @param {*} message - Message content
     */
    handleWorkerMessage(worker, message) {
        if (message.type === 'metrics') {
            const workerInfo = this.workers.get(worker.id);
            if (workerInfo) {
                workerInfo.requests = message.requests || 0;
            }
        } else if (message.type === 'ready') {
            const workerInfo = this.workers.get(worker.id);
            if (workerInfo) {
                workerInfo.status = 'ready';
            }
        }

        this.emit('worker:message', worker, message);
    }

    /**
     * Handle worker disconnect
     * @param {cluster.Worker} worker - Worker that disconnected
     */
    handleWorkerDisconnect(worker) {
        this.logger.info(`Worker ${worker.process.pid} disconnected`, { workerId: worker.id });
        this.emit('worker:disconnect', worker);
    }

    /**
     * Setup signal handlers for master process
     */
    setupMasterSignalHandlers() {
        const signals = this.config.get('shutdown.signals');

        signals.forEach(signal => {
            process.on(signal, () => this.shutdownMaster(signal));
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception in master', {
                error: error.message,
                stack: error.stack
            });
        });

        process.on('unhandledRejection', (reason) => {
            this.logger.error('Unhandled rejection in master', {
                reason: reason instanceof Error ? reason.message : reason
            });
        });
    }

    /**
     * Start worker process
     * @returns {Promise<void>}
     */
    async startWorker() {
        await this.initializeDatabase();
        await this.initializeApp();
        await this.createServer();
        this.setupWorkerEventHandlers();
        await this.listen();

        if (this.config.get('startup.warmup')) {
            await this.performWarmup();
        }

        this.metricsCollector.start();
        this.healthMonitor.start();

        this.state.status = 'running';
        this.emit('worker:started');

        if (process.send) {
            process.send({ type: 'ready' });
        }
    }

    /**
     * Initialize database connections
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        if (!this.config.get('database.enabled')) {
            this.logger.info('Database disabled by configuration');
            return;
        }

        const maxAttempts = this.config.get('database.retryAttempts');
        const retryDelay = this.config.get('database.retryDelay');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.logger.info(`Initializing database connections (attempt ${attempt}/${maxAttempts})`);

                await database.initialize({
                    environment: this.config.get('server.environment')
                });

                this.logger.info('Database connections established successfully');
                return;
            } catch (error) {
                this.logger.error(`Database initialization failed (attempt ${attempt}/${maxAttempts})`, {
                    error: error.message
                });

                if (attempt < maxAttempts) {
                    this.logger.info(`Retrying in ${retryDelay}ms`);
                    await this.delay(retryDelay);
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Initialize Express application
     * @returns {Promise<void>}
     */
    async initializeApp() {
        try {
            this.logger.info('Initializing Express application');

            const adminApp = new AdminApp(this.config);
            await adminApp.initialize();
            this.app = adminApp.getApp();

            this.logger.info('Express application initialized successfully');
        } catch (error) {
            this.logger.error('Application initialization failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Create HTTP/HTTPS server
     * @returns {Promise<void>}
     */
    async createServer() {
        const isProduction = this.config.get('server.environment') === 'production';
        const sslEnabled = this.config.get('ssl.enabled');

        if (isProduction && sslEnabled) {
            const httpsOptions = this.buildHttpsOptions();
            this.server = https.createServer(httpsOptions, this.app);
            this.logger.info('HTTPS server created');
        } else {
            this.server = http.createServer(this.app);
            this.logger.info('HTTP server created');
        }

        this.server.timeout = this.config.get('timeouts.server');
        this.server.keepAliveTimeout = this.config.get('timeouts.keepAlive');
        this.server.headersTimeout = this.config.get('timeouts.headers');

        const maxConnections = this.config.get('connections.maxConnections');
        if (maxConnections > 0) {
            this.server.maxConnections = maxConnections;
        }

        if (this.config.get('connections.trackConnections')) {
            this.server.on('connection', (socket) => this.handleConnection(socket));
        }
    }

    /**
     * Build HTTPS options
     * @returns {Object} HTTPS server options
     */
    buildHttpsOptions() {
        const options = {
            key: fs.readFileSync(this.config.get('ssl.keyPath')),
            cert: fs.readFileSync(this.config.get('ssl.certPath')),
            minVersion: this.config.get('ssl.minVersion'),
            maxVersion: this.config.get('ssl.maxVersion'),
            ciphers: this.config.get('ssl.ciphers'),
            honorCipherOrder: this.config.get('ssl.honorCipherOrder'),
            sessionTimeout: this.config.get('ssl.sessionTimeout')
        };

        if (this.config.get('ssl.caPath')) {
            options.ca = fs.readFileSync(this.config.get('ssl.caPath'));
        }

        if (this.config.get('ssl.passphrase')) {
            options.passphrase = this.config.get('ssl.passphrase');
        }

        if (this.config.get('ssl.requestCert')) {
            options.requestCert = true;
            options.rejectUnauthorized = this.config.get('ssl.rejectUnauthorized');
        }

        return options;
    }

    /**
     * Handle new connection
     * @param {net.Socket} socket - Client socket
     */
    handleConnection(socket) {
        const connectionId = `${socket.remoteAddress}:${socket.remotePort}:${Date.now()}`;

        this.connections.set(connectionId, {
            socket,
            startTime: Date.now(),
            bytesRead: 0,
            bytesWritten: 0
        });

        this.metricsCollector.recordConnection('open');

        if (this.config.get('connections.noDelay')) {
            socket.setNoDelay(true);
        }

        if (this.config.get('connections.keepAlive')) {
            socket.setKeepAlive(true, this.config.get('timeouts.keepAlive'));
        }

        socket.on('close', () => {
            this.connections.delete(connectionId);
            this.metricsCollector.recordConnection('close');
        });

        socket.on('error', (error) => {
            this.logger.debug('Socket error', { connectionId, error: error.message });
        });
    }

    /**
     * Setup event handlers for worker process
     */
    setupWorkerEventHandlers() {
        this.server.on('error', (error) => this.onServerError(error));
        this.server.on('clientError', (error, socket) => this.onClientError(error, socket));

        const signals = this.config.get('shutdown.signals');
        signals.forEach(signal => {
            process.on(signal, () => this.gracefulShutdown(signal));
        });

        process.on('uncaughtException', (error) => this.handleUncaughtException(error));
        process.on('unhandledRejection', (reason, promise) => this.handleUnhandledRejection(reason, promise));

        if (process.send) {
            process.on('message', (message) => {
                if (message === 'shutdown') {
                    this.gracefulShutdown('master-signal');
                }
            });
        }
    }

    /**
     * Start listening for connections
     * @returns {Promise<void>}
     */
    async listen() {
        return new Promise((resolve, reject) => {
            const host = this.config.get('network.host');
            const port = this.config.get('network.port');
            const backlog = this.config.get('network.backlog');

            this.server.listen(port, host, backlog, () => {
                const protocol = this.server instanceof https.Server ? 'https' : 'http';
                const workerId = cluster.worker ? cluster.worker.id : 'main';

                if (this.config.get('startup.banner') && !cluster.worker) {
                    this.printWorkerBanner(protocol, host, port, workerId);
                } else if (cluster.worker) {
                    this.logger.info(`Worker ${workerId} listening on ${protocol}://${host}:${port}`);
                }

                this.emit('listening', { protocol, host, port, workerId });
                resolve();
            });

            this.server.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Perform warmup routine
     * @returns {Promise<void>}
     */
    async performWarmup() {
        const duration = this.config.get('startup.warmupDuration');
        this.logger.info(`Performing warmup for ${duration}ms`);

        await this.delay(duration);

        this.logger.info('Warmup completed');
    }

    /**
     * Handle server errors
     * @param {Error} error - Server error
     */
    onServerError(error) {
        if (error.syscall !== 'listen') {
            this.logger.error('Server error', { error: error.message, stack: error.stack });
            throw error;
        }

        const port = this.config.get('network.port');
        const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

        switch (error.code) {
            case 'EACCES':
                this.logger.error(`${bind} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                this.logger.error(`${bind} is already in use`);
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    /**
     * Handle client errors
     * @param {Error} error - Client error
     * @param {net.Socket} socket - Client socket
     */
    onClientError(error, socket) {
        if (error.code === 'ECONNRESET' || !socket.writable) {
            return;
        }

        this.logger.debug('Client error', { error: error.message, code: error.code });

        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }

    /**
     * Handle uncaught exceptions
     * @param {Error} error - Uncaught exception
     */
    handleUncaughtException(error) {
        this.logger.error('Uncaught Exception', {
            error: error.message,
            stack: error.stack
        });

        this.gracefulShutdown('uncaughtException');
    }

    /**
     * Handle unhandled promise rejections
     * @param {*} reason - Rejection reason
     * @param {Promise} promise - Rejected promise
     */
    handleUnhandledRejection(reason, promise) {
        this.logger.error('Unhandled Rejection', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : undefined
        });
    }

    /**
     * Gracefully shutdown worker
     * @param {string} signal - Signal that triggered shutdown
     * @returns {Promise<void>}
     */
    async gracefulShutdown(signal) {
        if (this.state.shutdownInProgress) {
            this.logger.warn('Shutdown already in progress');
            return;
        }

        this.state.shutdownInProgress = true;
        this.state.shutdownReason = signal;
        this.state.status = 'shutting_down';

        this.logger.info(`Received ${signal}, starting graceful shutdown`);
        this.emit('shutdown:start', signal);

        const shutdownTimeout = this.config.get('timeouts.shutdown');
        const forceTimeout = this.config.get('timeouts.forceShutdown');

        const forceShutdown = setTimeout(() => {
            this.logger.error('Forced shutdown due to timeout');
            process.exit(1);
        }, forceTimeout);

        try {
            this.metricsCollector.stop();
            this.healthMonitor.stop();

            this.logger.info('Closing HTTP server');
            await this.closeServer(shutdownTimeout);

            if (this.config.get('shutdown.drainConnections')) {
                this.logger.info('Draining existing connections');
                await this.drainConnections();
            }

            if (this.config.get('shutdown.closeDatabase') && this.config.get('database.enabled')) {
                this.logger.info('Closing database connections');
                await database.shutdown();
            }

            clearTimeout(forceShutdown);

            this.state.status = 'stopped';
            this.logger.info('Graceful shutdown completed');
            this.emit('shutdown:complete');

            process.exit(0);
        } catch (error) {
            this.logger.error('Error during graceful shutdown', {
                error: error.message,
                stack: error.stack
            });
            clearTimeout(forceShutdown);
            process.exit(1);
        }
    }

    /**
     * Close HTTP server
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<void>}
     */
    closeServer(timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Server close timeout'));
            }, timeout);

            this.server.close((error) => {
                clearTimeout(timer);
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Drain existing connections
     * @returns {Promise<void>}
     */
    async drainConnections() {
        const drainTimeout = this.config.get('timeouts.connectionDrain');

        for (const [connectionId, connectionInfo] of this.connections) {
            try {
                connectionInfo.socket.end();
            } catch (error) {
                this.logger.debug('Error ending connection', { connectionId, error: error.message });
            }
        }

        await this.delay(drainTimeout);

        for (const [connectionId, connectionInfo] of this.connections) {
            try {
                connectionInfo.socket.destroy();
            } catch (error) {
                this.logger.debug('Error destroying connection', { connectionId, error: error.message });
            }
        }

        this.connections.clear();
    }

    /**
     * Shutdown master process
     * @param {string} signal - Signal that triggered shutdown
     * @returns {Promise<void>}
     */
    async shutdownMaster(signal) {
        if (this.state.shutdownInProgress) {
            this.logger.warn('Master shutdown already in progress');
            return;
        }

        this.state.shutdownInProgress = true;
        this.state.shutdownReason = signal;
        this.state.status = 'shutting_down';

        this.logger.info(`Master received ${signal}, shutting down workers`);

        this.metricsCollector.stop();
        this.healthMonitor.stop();

        if (this.config.get('shutdown.notifyWorkers')) {
            for (const [workerId, workerInfo] of this.workers) {
                try {
                    workerInfo.worker.send('shutdown');
                    workerInfo.worker.disconnect();
                } catch (error) {
                    this.logger.debug('Error notifying worker', { workerId, error: error.message });
                }
            }
        }

        const timeout = this.config.get('cluster.workerTimeout');

        setTimeout(() => {
            for (const [workerId, workerInfo] of this.workers) {
                if (!workerInfo.worker.isDead()) {
                    this.logger.warn(`Force killing worker ${workerId}`);
                    workerInfo.worker.kill();
                }
            }

            this.logger.info('Master process exiting');
            process.exit(0);
        }, timeout);
    }

    /**
     * Print master startup banner
     */
    printMasterBanner() {
        const workerCount = this.config.get('cluster.workers');

        console.log('\n' + '='.repeat(70));
        console.log('🔧 INSIGHTSERENITY ADMIN SERVER - MASTER PROCESS');
        console.log('='.repeat(70));
        console.log(`⚙️  Environment:    ${this.config.get('server.environment')}`);
        console.log(`🔧 Process ID:     ${process.pid}`);
        console.log(`👷 Workers:        ${workerCount}`);
        console.log(`🖥️  Node Version:   ${process.version}`);
        console.log(`📅 Started:        ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Print worker startup banner
     * @param {string} protocol - Server protocol
     * @param {string} host - Server host
     * @param {number} port - Server port
     * @param {string|number} workerId - Worker ID
     */
    printWorkerBanner(protocol, host, port, workerId) {
        console.log('\n' + '='.repeat(70));
        console.log('🔧 INSIGHTSERENITY ADMIN SERVER STARTED');
        console.log('='.repeat(70));
        console.log(`📍 Server URL:     ${protocol}://${host}:${port}`);
        console.log(`🔗 API Base:       ${protocol}://${host}:${port}/api/v1/admin`);
        console.log(`🏥 Health Check:   ${protocol}://${host}:${port}/health`);
        console.log(`📊 API Docs:       ${protocol}://${host}:${port}/api/docs`);
        console.log(`⚙️  Environment:    ${this.config.get('server.environment')}`);
        console.log(`🔧 Process ID:     ${process.pid}`);
        console.log(`👷 Worker ID:      ${workerId}`);
        console.log(`🖥️  Node Version:   ${process.version}`);
        console.log(`💾 Memory Usage:   ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
        console.log(`📅 Started:        ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get server status
     * @returns {Object} Server status
     */
    getStatus() {
        return {
            state: this.state,
            health: this.healthMonitor.getStatus(),
            metrics: this.metricsCollector.getMetrics(),
            connections: this.connections.size,
            workers: cluster.isMaster ? this.workers.size : null
        };
    }
}

const adminServer = new AdminServer();
adminServer.start();

module.exports = { AdminServer, MetricsCollector, HealthMonitor };