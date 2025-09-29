/**
 * @fileoverview HealthMonitor - Monitors database health and connectivity
 * @module shared/lib/database/monitoring/health-monitor
 * @requires events
 * @requires winston
 */

const { EventEmitter } = require('events');
const winston = require('winston');
const os = require('os');
const { performance } = require('perf_hooks');

/**
 * @class HealthMonitor
 * @extends EventEmitter
 * @description Monitors database health, connectivity, and performance with alerting capabilities
 */
class HealthMonitor extends EventEmitter {
    /**
     * Creates an instance of HealthMonitor
     * @param {Object} options - Configuration options
     * @param {ConnectionManager} options.connectionManager - Connection manager instance
     * @param {winston.Logger} options.logger - Logger instance
     * @param {Object} options.config - Health monitoring configuration
     */
    constructor(options = {}) {
        super();

        // Validate required dependencies
        if (!options.connectionManager) {
            throw new Error('ConnectionManager instance is required');
        }

        this.connectionManager = options.connectionManager;
        this.logger = options.logger || this._createDefaultLogger();

        // Health monitoring configuration
        this.config = {
            enabled: options.config?.enabled !== false,
            interval: options.config?.interval || 30000, // 30 seconds
            timeout: options.config?.timeout || 5000, // 5 seconds
            retryAttempts: options.config?.retryAttempts || 3,
            retryDelay: options.config?.retryDelay || 1000,

            // Alert thresholds
            thresholds: {
                responseTime: options.config?.thresholds?.responseTime || 1000,
                connectionPool: options.config?.thresholds?.connectionPool || 0.8,
                errorRate: options.config?.thresholds?.errorRate || 0.05,
                memoryUsage: options.config?.thresholds?.memoryUsage || 0.9,
                cpuUsage: options.config?.thresholds?.cpuUsage || 0.8,
                diskUsage: options.config?.thresholds?.diskUsage || 0.9,
                queryQueueSize: options.config?.thresholds?.queryQueueSize || 100,
                slowQueryCount: options.config?.thresholds?.slowQueryCount || 10
            },

            // Alert configuration
            alerts: {
                enabled: options.config?.alerts?.enabled !== false,
                channels: options.config?.alerts?.channels || ['log'],
                cooldown: options.config?.alerts?.cooldown || 300000, // 5 minutes
                aggregation: options.config?.alerts?.aggregation || 60000 // 1 minute
            },

            // Health check probes
            probes: {
                ping: options.config?.probes?.ping !== false,
                serverStatus: options.config?.probes?.serverStatus !== false,
                replSetStatus: options.config?.probes?.replSetStatus !== false,
                connectionPool: options.config?.probes?.connectionPool !== false,
                collections: options.config?.probes?.collections !== false,
                indexes: options.config?.probes?.indexes !== false
            },

            ...options.config
        };

        // Health state
        this.state = {
            status: 'unknown',
            lastCheck: null,
            checkCount: 0,
            startTime: Date.now(),
            databases: new Map(),
            alerts: new Map(),
            issues: []
        };

        // Health metrics
        this.metrics = {
            checks: {
                total: 0,
                successful: 0,
                failed: 0
            },
            responseTime: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0,
                history: []
            },
            availability: {
                uptime: 0,
                downtime: 0,
                percentage: 100
            },
            errors: {
                total: 0,
                rate: 0,
                types: new Map()
            }
        };

        // Health check timer
        this.checkTimer = null;

        // Alert state
        this.alertState = {
            active: new Map(),
            history: [],
            lastAlert: null,
            cooldowns: new Map()
        };

        // Initialize if enabled
        if (this.config.enabled) {
            this.start();
        }

        this.logger.info('HealthMonitor initialized', {
            enabled: this.config.enabled,
            interval: this.config.interval,
            probes: Object.keys(this.config.probes).filter(p => this.config.probes[p])
        });
    }

    /**
     * Creates a default Winston logger
     * @private
     * @returns {winston.Logger} Logger instance
     */
    _createDefaultLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'health-monitor' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Starts health monitoring
     */
    start() {
        if (this.checkTimer) {
            this.logger.warn('Health monitoring is already running');
            return;
        }

        this.logger.info('Starting health monitoring');

        // Perform initial check
        this.check();

        // Setup periodic checks
        this.checkTimer = setInterval(() => {
            this.check();
        }, this.config.interval);

        // Update state
        this.state.status = 'monitoring';

        // Emit start event
        this.emit('monitoring:started');
    }

    /**
     * Stops health monitoring
     */
    stop() {
        if (!this.checkTimer) {
            this.logger.warn('Health monitoring is not running');
            return;
        }

        this.logger.info('Stopping health monitoring');

        // Clear timer
        clearInterval(this.checkTimer);
        this.checkTimer = null;

        // Update state
        this.state.status = 'stopped';

        // Emit stop event
        this.emit('monitoring:stopped');
    }

    /**
     * Performs a health check
     * @returns {Promise<Object>} Health check results
     */
    async check() {
        const startTime = performance.now();
        const checkId = Date.now();

        this.state.checkCount++;
        this.metrics.checks.total++;

        const results = {
            checkId,
            timestamp: new Date().toISOString(),
            status: 'healthy',
            databases: {},
            system: {},
            issues: [],
            duration: 0
        };

        try {
            // Check system health
            results.system = await this._checkSystemHealth();

            // Check database health
            const databases = this.connectionManager.getAllConnections();

            for (const [name, connection] of databases) {
                const dbHealth = await this._checkDatabaseHealth(name, connection);
                results.databases[name] = dbHealth;

                // Update database state
                this.state.databases.set(name, dbHealth);

                // Check for issues
                if (dbHealth.status !== 'healthy') {
                    results.status = dbHealth.status === 'degraded' ? 'degraded' : 'unhealthy';
                    results.issues.push({
                        database: name,
                        status: dbHealth.status,
                        issues: dbHealth.issues
                    });
                }
            }

            // Check system thresholds
            const systemIssues = this._checkSystemThresholds(results.system);
            if (systemIssues.length > 0) {
                results.status = results.status === 'unhealthy' ? 'unhealthy' : 'degraded';
                results.issues.push(...systemIssues);
            }

            // Calculate duration
            results.duration = performance.now() - startTime;

            // Update metrics
            this._updateMetrics(results);

            // Check for alerts
            if (this.config.alerts.enabled) {
                await this._checkAlerts(results);
            }

            // Update state
            this.state.status = results.status;
            this.state.lastCheck = new Date().toISOString();
            this.state.issues = results.issues;

            // Emit health check event
            this.emit('health:checked', results);

            this.metrics.checks.successful++;

            return results;

        } catch (error) {
            const duration = performance.now() - startTime;

            this.logger.error('Health check failed', {
                error: error.message,
                duration: `${duration}ms`
            });

            results.status = 'error';
            results.error = error.message;
            results.duration = duration;

            this.state.status = 'error';
            this.metrics.checks.failed++;

            // Emit error event
            this.emit('health:error', { checkId, error });

            return results;
        }
    }

    /**
     * Checks database health
     * @private
     * @param {string} name - Database name
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Database health status
     */
    async _checkDatabaseHealth(name, connection) {
        const health = {
            name,
            status: 'healthy',
            connected: false,
            responseTime: 0,
            issues: [],
            metrics: {}
        };

        try {
            // Check connection state
            health.connected = connection.readyState === 1;

            if (!health.connected) {
                health.status = 'unhealthy';
                health.issues.push('Database disconnected');
                return health;
            }

            // Ping probe
            if (this.config.probes.ping) {
                const pingStart = performance.now();
                await connection.db.admin().ping();
                health.responseTime = performance.now() - pingStart;

                if (health.responseTime > this.config.thresholds.responseTime) {
                    health.status = 'degraded';
                    health.issues.push(`Slow response time: ${health.responseTime.toFixed(2)}ms`);
                }
            }

            // Server status probe
            if (this.config.probes.serverStatus) {
                const status = await connection.db.admin().serverStatus();

                health.metrics.version = status.version;
                health.metrics.uptime = status.uptime;
                health.metrics.connections = {
                    current: status.connections?.current || 0,
                    available: status.connections?.available || 0,
                    totalCreated: status.connections?.totalCreated || 0
                };
                health.metrics.memory = {
                    resident: status.mem?.resident || 0,
                    virtual: status.mem?.virtual || 0,
                    mapped: status.mem?.mapped || 0
                };
                health.metrics.opcounters = status.opcounters || {};
            }

            // Replica set status probe
            if (this.config.probes.replSetStatus) {
                try {
                    const replStatus = await connection.db.admin().replSetGetStatus();
                    health.metrics.replicaSet = {
                        set: replStatus.set,
                        myState: replStatus.myState,
                        members: replStatus.members?.length || 0,
                        ok: replStatus.ok === 1
                    };
                } catch (error) {
                    // Not a replica set, ignore
                }
            }

            // Connection pool probe
            if (this.config.probes.connectionPool) {
                const poolMetrics = await this._getConnectionPoolMetrics(connection);
                health.metrics.connectionPool = poolMetrics;

                // Check pool usage
                const usage = poolMetrics.inUse / poolMetrics.total;
                if (usage > this.config.thresholds.connectionPool) {
                    health.status = 'degraded';
                    health.issues.push(`High connection pool usage: ${(usage * 100).toFixed(1)}%`);
                }
            }

            // Collections probe
            if (this.config.probes.collections) {
                const collections = await connection.db.listCollections().toArray();
                health.metrics.collections = collections.length;
            }

            // Indexes probe
            if (this.config.probes.indexes) {
                const indexStats = await this._getIndexStatistics(connection);
                health.metrics.indexes = indexStats;
            }

            return health;

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
            health.issues.push(`Health check error: ${error.message}`);

            return health;
        }
    }

    /**
     * Checks system health
     * @private
     * @returns {Promise<Object>} System health metrics
     */
    async _checkSystemHealth() {
        const system = {
            timestamp: new Date().toISOString(),
            process: {
                uptime: process.uptime(),
                pid: process.pid,
                version: process.version,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            os: {
                platform: os.platform(),
                release: os.release(),
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                loadAverage: os.loadavg(),
                cpus: os.cpus().length,
                uptime: os.uptime()
            }
        };

        // Calculate memory usage percentage
        system.os.memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem();

        // Calculate CPU usage percentage (simplified)
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        system.os.cpuUsage = 1 - (totalIdle / totalTick);

        return system;
    }

    /**
     * Gets connection pool metrics
     * @private
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Connection pool metrics
     */
    async _getConnectionPoolMetrics(connection) {
        const client = connection.getClient();
        const metrics = {
            total: 0,
            available: 0,
            inUse: 0,
            pending: 0,
            waitQueueSize: 0
        };

        if (!client) return metrics;

        try {
            const topology = client.topology;
            if (!topology) return metrics;

            const servers = topology.s?.servers;
            if (!servers) return metrics;

            servers.forEach(server => {
                if (server.s?.pool) {
                    const pool = server.s.pool;
                    metrics.total += pool.totalConnectionCount || 0;
                    metrics.available += pool.availableConnectionCount || 0;
                    metrics.pending += pool.pendingConnectionCount || 0;
                    metrics.waitQueueSize += pool.waitQueueSize || 0;
                }
            });

            metrics.inUse = metrics.total - metrics.available;

        } catch (error) {
            this.logger.error('Failed to get connection pool metrics', {
                error: error.message
            });
        }

        return metrics;
    }

    /**
     * Gets index statistics
     * @private
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Index statistics
     */
    async _getIndexStatistics(connection) {
        const stats = {
            total: 0,
            size: 0,
            usage: {}
        };

        try {
            const collections = await connection.db.listCollections().toArray();

            for (const coll of collections.slice(0, 10)) { // Limit to first 10 collections
                const collection = connection.db.collection(coll.name);
                const indexStats = await collection.indexStats();

                if (indexStats) {
                    stats.total += indexStats.length;

                    indexStats.forEach(index => {
                        stats.size += index.storageSize || 0;

                        if (index.accesses) {
                            stats.usage[index.name] = {
                                ops: index.accesses.ops || 0,
                                since: index.accesses.since
                            };
                        }
                    });
                }
            }

        } catch (error) {
            // Index stats may not be available
            this.logger.debug('Could not get index statistics', {
                error: error.message
            });
        }

        return stats;
    }

    /**
     * Checks system thresholds
     * @private
     * @param {Object} system - System metrics
     * @returns {Array} System issues
     */
    _checkSystemThresholds(system) {
        const issues = [];

        // Check memory usage
        if (system.os.memoryUsage > this.config.thresholds.memoryUsage) {
            issues.push({
                type: 'system',
                severity: 'warning',
                message: `High memory usage: ${(system.os.memoryUsage * 100).toFixed(1)}%`
            });
        }

        // Check CPU usage
        if (system.os.cpuUsage > this.config.thresholds.cpuUsage) {
            issues.push({
                type: 'system',
                severity: 'warning',
                message: `High CPU usage: ${(system.os.cpuUsage * 100).toFixed(1)}%`
            });
        }

        // Check process memory
        const processMemoryMB = system.process.memory.heapUsed / 1024 / 1024;
        if (processMemoryMB > 1024) { // Over 1GB
            issues.push({
                type: 'process',
                severity: 'warning',
                message: `High process memory usage: ${processMemoryMB.toFixed(2)}MB`
            });
        }

        return issues;
    }

    /**
     * Updates metrics
     * @private
     * @param {Object} results - Health check results
     */
    _updateMetrics(results) {
        // Update response time metrics
        const avgResponseTime = Object.values(results.databases)
            .filter(db => db.responseTime)
            .reduce((sum, db) => sum + db.responseTime, 0) /
            Object.keys(results.databases).length || 0;

        this.metrics.responseTime.current = avgResponseTime;
        this.metrics.responseTime.history.push({
            timestamp: results.timestamp,
            value: avgResponseTime
        });

        // Keep only last 100 measurements
        if (this.metrics.responseTime.history.length > 100) {
            this.metrics.responseTime.history = this.metrics.responseTime.history.slice(-100);
        }

        // Update min/max/average
        this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, avgResponseTime);
        this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, avgResponseTime);

        const sum = this.metrics.responseTime.history.reduce((s, h) => s + h.value, 0);
        this.metrics.responseTime.average = sum / this.metrics.responseTime.history.length;

        // Update availability metrics
        const totalTime = Date.now() - this.state.startTime;

        if (results.status === 'healthy') {
            this.metrics.availability.uptime += this.config.interval;
        } else {
            this.metrics.availability.downtime += this.config.interval;
        }

        this.metrics.availability.percentage =
            (this.metrics.availability.uptime / totalTime) * 100;

        // Update error metrics
        if (results.status === 'error' || results.status === 'unhealthy') {
            this.metrics.errors.total++;

            results.issues.forEach(issue => {
                const type = issue.type || 'unknown';
                const count = this.metrics.errors.types.get(type) || 0;
                this.metrics.errors.types.set(type, count + 1);
            });
        }

        // Calculate error rate
        this.metrics.errors.rate = this.metrics.errors.total / this.metrics.checks.total;
    }

    /**
     * Checks for alerts
     * @private
     * @param {Object} results - Health check results
     */
    async _checkAlerts(results) {
        const alerts = [];

        // Check health status
        if (results.status === 'unhealthy') {
            alerts.push({
                severity: 'critical',
                type: 'health',
                message: 'Database health check failed',
                details: results.issues
            });
        } else if (results.status === 'degraded') {
            alerts.push({
                severity: 'warning',
                type: 'health',
                message: 'Database health degraded',
                details: results.issues
            });
        }

        // Check response time
        if (this.metrics.responseTime.current > this.config.thresholds.responseTime) {
            alerts.push({
                severity: 'warning',
                type: 'performance',
                message: `High response time: ${this.metrics.responseTime.current.toFixed(2)}ms`
            });
        }

        // Check error rate
        if (this.metrics.errors.rate > this.config.thresholds.errorRate) {
            alerts.push({
                severity: 'warning',
                type: 'errors',
                message: `High error rate: ${(this.metrics.errors.rate * 100).toFixed(2)}%`
            });
        }

        // Process alerts
        for (const alert of alerts) {
            await this._processAlert(alert);
        }
    }

    /**
     * Processes an alert
     * @private
     * @param {Object} alert - Alert to process
     */
    async _processAlert(alert) {
        const alertKey = `${alert.type}:${alert.severity}`;

        // Check cooldown
        const lastAlert = this.alertState.cooldowns.get(alertKey);
        if (lastAlert && Date.now() - lastAlert < this.config.alerts.cooldown) {
            return; // Still in cooldown
        }

        // Update alert state
        this.alertState.active.set(alertKey, alert);
        this.alertState.lastAlert = new Date().toISOString();
        this.alertState.cooldowns.set(alertKey, Date.now());

        // Store in history
        this.alertState.history.push({
            ...alert,
            timestamp: new Date().toISOString()
        });

        // Keep only last 100 alerts
        if (this.alertState.history.length > 100) {
            this.alertState.history = this.alertState.history.slice(-100);
        }

        // Send alert through configured channels
        for (const channel of this.config.alerts.channels) {
            try {
                await this._sendAlert(channel, alert);
            } catch (error) {
                this.logger.error(`Failed to send alert through ${channel}`, {
                    error: error.message
                });
            }
        }

        // Emit alert event
        this.emit('alert:triggered', alert);
    }

    /**
     * Sends an alert through a channel
     * @private
     * @param {string} channel - Alert channel
     * @param {Object} alert - Alert to send
     */
    async _sendAlert(channel, alert) {
        switch (channel) {
            case 'log':
                const logMethod = alert.severity === 'critical' ? 'error' : 'warn';
                this.logger[logMethod](`Health Alert: ${alert.message}`, alert);
                break;

            case 'console':
                console.warn(`[HEALTH ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`);
                break;

            case 'webhook':
                // Implement webhook alerting
                break;

            case 'email':
                // Implement email alerting
                break;

            default:
                this.logger.warn(`Unknown alert channel: ${channel}`);
        }
    }

    /**
     * Gets current health status
     * @returns {Object} Current health status
     */
    getStatus() {
        return {
            status: this.state.status,
            lastCheck: this.state.lastCheck,
            checkCount: this.state.checkCount,
            uptime: Date.now() - this.state.startTime,
            databases: Object.fromEntries(this.state.databases),
            issues: this.state.issues,
            metrics: this.metrics,
            alerts: {
                active: Array.from(this.alertState.active.values()),
                recent: this.alertState.history.slice(-10)
            }
        };
    }

    /**
     * Gets health metrics
     * @returns {Object} Health metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            availability: {
                ...this.metrics.availability,
                uptimeFormatted: this._formatDuration(this.metrics.availability.uptime),
                downtimeFormatted: this._formatDuration(this.metrics.availability.downtime)
            }
        };
    }

    /**
     * Formats duration
     * @private
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Performs an immediate health check
     * @returns {Promise<Object>} Health check results
     */
    async checkNow() {
        return await this.check();
    }

    /**
     * Resets metrics
     */
    resetMetrics() {
        this.metrics = {
            checks: {
                total: 0,
                successful: 0,
                failed: 0
            },
            responseTime: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0,
                history: []
            },
            availability: {
                uptime: 0,
                downtime: 0,
                percentage: 100
            },
            errors: {
                total: 0,
                rate: 0,
                types: new Map()
            }
        };

        this.state.startTime = Date.now();

        this.logger.info('Health metrics reset');
    }

    /**
     * Cleans up resources
     */
    cleanup() {
        this.stop();
        this.removeAllListeners();

        this.logger.info('HealthMonitor cleanup completed');
    }
}

module.exports = HealthMonitor;
